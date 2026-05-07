import bcrypt from "bcryptjs";
import { Prisma, RoleCode } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import logger from "../../common/logger";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { UsersRepository } from "./users.repository";
import { createUserSchema } from "./users.schema";
import { UserCreateInput, UserUpdateInput } from "./users.types";

const serializeUser = (user: {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: { code: RoleCode; name: string };
  scopeAssignments: Array<{ schoolId: string | null; groupId: string | null; group?: { schoolId: string } | null }>;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  isActive: user.isActive,
  role: user.role.code,
  roleLabel: user.role.name,
  scope: {
    schoolIds: Array.from(
      new Set(
        user.scopeAssignments
          .map((scope) => scope.schoolId ?? scope.group?.schoolId ?? null)
          .filter((value): value is string => Boolean(value))
      )
    ),
    groupIds: Array.from(
      new Set(user.scopeAssignments.map((scope) => scope.groupId).filter((value): value is string => Boolean(value)))
    )
  },
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const normalizeHeader = (value: string) => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .trim();
};

const parseDelimitedLine = (line: string, delimiter: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};

const parseBooleanLike = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (["1", "true", "si", "sí", "yes", "activo", "activa"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "inactivo", "inactiva"].includes(normalized)) {
    return false;
  }

  return undefined;
};

const detectDelimiter = (headerLine: string) => {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  if (tabCount >= semicolonCount && tabCount >= commaCount && tabCount > 0) {
    return "\t";
  }

  if (semicolonCount >= commaCount && semicolonCount > 0) {
    return ";";
  }

  return ",";
};

const delimiterToLabel = (delimiter: string) => {
  if (delimiter === "\t") {
    return "TAB";
  }

  return delimiter;
};

export class UsersService {
  private static async validateScopeAssignments(payload: { schoolIds: string[]; groupIds: string[] }) {
    const schoolIds = Array.from(new Set(payload.schoolIds));
    const groupIds = Array.from(new Set(payload.groupIds));

    if (schoolIds.length > 0) {
      const schools = await UsersRepository.findSchoolsByIds(schoolIds);
      if (schools.length !== schoolIds.length) {
        throw new AppError("Uno o mas colegios de alcance no existen o estan inactivos", 400, "INVALID_SCOPE_SCHOOL");
      }
    }

    if (groupIds.length > 0) {
      const groups = await UsersRepository.findGroupsByIds(groupIds);
      if (groups.length !== groupIds.length) {
        throw new AppError("Uno o mas grupos de alcance no existen o estan inactivos", 400, "INVALID_SCOPE_GROUP");
      }
    }

    return { schoolIds, groupIds };
  }

  private static async applyScopeIfProvided(
    userId: string,
    payload: { scopeSchoolIds?: string[]; scopeGroupIds?: string[] }
  ) {
    if (payload.scopeSchoolIds === undefined && payload.scopeGroupIds === undefined) {
      return UsersRepository.findById(userId);
    }

    const validated = await this.validateScopeAssignments({
      schoolIds: payload.scopeSchoolIds ?? [],
      groupIds: payload.scopeGroupIds ?? []
    });

    return UsersRepository.replaceScopeAssignments({
      userId,
      schoolIds: validated.schoolIds,
      groupIds: validated.groupIds
    });
  }

  static async create(payload: UserCreateInput, actorId: string) {
    logger.info(
      {
        actorId,
        email: payload.email,
        role: payload.role ?? RoleCode.DOCENTE
      },
      "user.create.requested"
    );

    const normalizedEmail = payload.email.toLowerCase();
    const existing = await UsersRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new AppError("El correo ya esta registrado", 409, "USER_EXISTS");
    }

    const role = await UsersRepository.findRoleByCode(payload.role ?? RoleCode.DOCENTE);
    if (!role) {
      throw new AppError("Rol no configurado en catalogo", 500, "ROLE_NOT_CONFIGURED");
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const created = await UsersRepository.create({
      name: payload.name,
      email: normalizedEmail,
      passwordHash,
      roleId: role.id,
      isActive: payload.isActive ?? true
    });

    const withScope = await this.applyScopeIfProvided(created.id, {
      scopeSchoolIds: payload.scopeSchoolIds,
      scopeGroupIds: payload.scopeGroupIds
    });
    if (!withScope) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }

    await createAuditLog({
      entidad: "users",
      entidadId: withScope.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        email: withScope.email,
        role: withScope.role.code,
        isActive: withScope.isActive,
        scopeSchoolIds: payload.scopeSchoolIds ?? [],
        scopeGroupIds: payload.scopeGroupIds ?? []
      }
    });

    return serializeUser(withScope);
  }

  static async list(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      q?: string;
      role?: RoleCode;
      isActive?: boolean;
    };

    const where: Prisma.UserWhereInput = {
      role: typedQuery.role
        ? {
            code: typedQuery.role
          }
        : undefined,
      isActive: typedQuery.isActive,
      OR: typedQuery.q
        ? [
            { name: { contains: typedQuery.q, mode: "insensitive" } },
            { email: { contains: typedQuery.q, mode: "insensitive" } }
          ]
        : undefined
    };

    const [total, users] = await UsersRepository.list(where, pagination.skip, pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: users.map(serializeUser)
    };
  }

  static async update(id: string, payload: UserUpdateInput, actorId: string) {
    logger.info(
      {
        actorId,
        userId: id
      },
      "user.update.requested"
    );

    const existing = await UsersRepository.findById(id);
    if (!existing) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }

    if (id === actorId && payload.isActive === false) {
      throw new AppError("No puedes desactivarte a ti mismo", 400, "SELF_DEACTIVATE_NOT_ALLOWED");
    }

    let nextRoleId: string | undefined;
    if (payload.role) {
      const role = await UsersRepository.findRoleByCode(payload.role);
      if (!role) {
        throw new AppError("Rol no configurado en catalogo", 500, "ROLE_NOT_CONFIGURED");
      }
      nextRoleId = role.id;
    }

    let nextEmail = payload.email?.toLowerCase();
    if (nextEmail && nextEmail !== existing.email) {
      const emailOwner = await UsersRepository.findByEmail(nextEmail);
      if (emailOwner && emailOwner.id !== existing.id) {
        throw new AppError("El correo ya esta registrado", 409, "USER_EXISTS");
      }
    } else {
      nextEmail = undefined;
    }

    const nextPasswordHash = payload.password ? await bcrypt.hash(payload.password, 10) : undefined;

    const updated = await UsersRepository.update(id, {
      name: payload.name,
      email: nextEmail,
      passwordHash: nextPasswordHash,
      roleId: nextRoleId,
      isActive: payload.isActive
    });

    const updatedWithScope = await this.applyScopeIfProvided(updated.id, {
      scopeSchoolIds: payload.scopeSchoolIds,
      scopeGroupIds: payload.scopeGroupIds
    });
    if (!updatedWithScope) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }

    await createAuditLog({
      entidad: "users",
      entidadId: updatedWithScope.id,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        before: {
          name: existing.name,
          email: existing.email,
          role: existing.role.code,
          isActive: existing.isActive
        },
        after: {
          name: updatedWithScope.name,
          email: updatedWithScope.email,
          role: updatedWithScope.role.code,
          isActive: updatedWithScope.isActive,
          scopeSchoolIds: payload.scopeSchoolIds ?? undefined,
          scopeGroupIds: payload.scopeGroupIds ?? undefined
        },
        changedPassword: Boolean(nextPasswordHash)
      }
    });

    return serializeUser(updatedWithScope);
  }

  static async getScopes(id: string) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }
    return serializeUser(user).scope;
  }

  static async setScopes(id: string, payload: { scopeSchoolIds: string[]; scopeGroupIds: string[] }, actorId: string) {
    const existing = await UsersRepository.findById(id);
    if (!existing) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }

    const validated = await this.validateScopeAssignments({
      schoolIds: payload.scopeSchoolIds,
      groupIds: payload.scopeGroupIds
    });

    const updated = await UsersRepository.replaceScopeAssignments({
      userId: id,
      schoolIds: validated.schoolIds,
      groupIds: validated.groupIds
    });
    if (!updated) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }

    await createAuditLog({
      entidad: "users",
      entidadId: id,
      accion: "UPDATE_SCOPE",
      userId: actorId,
      datos: {
        scopeSchoolIds: validated.schoolIds,
        scopeGroupIds: validated.groupIds
      }
    });

    return serializeUser(updated).scope;
  }

  static async bulkCreate(
    payload: {
      fileBuffer?: Buffer;
      csvText?: string;
      delimiter?: string;
    },
    actorId: string
  ) {
    const sourceText = payload.csvText ?? payload.fileBuffer?.toString("utf-8") ?? "";
    const normalizedText = sourceText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

    if (!normalizedText) {
      throw new AppError("El archivo CSV esta vacio", 400, "CSV_EMPTY");
    }

    const lines = normalizedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new AppError("El CSV debe incluir cabecera y al menos una fila", 400, "CSV_WITHOUT_ROWS");
    }

    const headerLine = lines[0];
    const delimiter =
      payload.delimiter && [",", ";", "\t"].includes(payload.delimiter) ? payload.delimiter : detectDelimiter(headerLine);

    const headers = parseDelimitedLine(headerLine, delimiter).map(normalizeHeader);
    const indexByHeader = new Map(headers.map((header, index) => [header, index] as const));

    const resolveColumnIndex = (aliases: string[]) => {
      for (const alias of aliases) {
        const value = indexByHeader.get(alias);
        if (value !== undefined) {
          return value;
        }
      }
      return -1;
    };

    const nameIndex = resolveColumnIndex(["name", "nombre", "nombres"]);
    const emailIndex = resolveColumnIndex(["email", "correo", "correoelectronico"]);
    const passwordIndex = resolveColumnIndex(["password", "clave", "contrasena", "contrasenausuario"]);
    const roleIndex = resolveColumnIndex(["role", "rol"]);
    const isActiveIndex = resolveColumnIndex(["is_active", "isactive", "activo", "estado"]);

    if (nameIndex < 0 || emailIndex < 0 || passwordIndex < 0) {
      throw new AppError(
        "Cabecera invalida. Debe incluir como minimo columnas: name, email, password",
        400,
        "CSV_INVALID_HEADER"
      );
    }

    const created: ReturnType<typeof serializeUser>[] = [];
    const duplicates: Array<{ row: number; email: string; reason: string }> = [];
    const errors: Array<{ row: number; email: string | null; reason: string }> = [];
    let skippedEmptyRows = 0;

    for (let rowNumber = 2; rowNumber <= lines.length; rowNumber += 1) {
      const line = lines[rowNumber - 1];
      if (!line || !line.trim()) {
        skippedEmptyRows += 1;
        continue;
      }

      const cells = parseDelimitedLine(line, delimiter);
      const rawName = cells[nameIndex]?.trim() ?? "";
      const rawEmail = cells[emailIndex]?.trim() ?? "";
      const rawPassword = cells[passwordIndex]?.trim() ?? "";
      const rawRole = roleIndex >= 0 ? cells[roleIndex]?.trim() ?? "" : "";
      const rawIsActive = isActiveIndex >= 0 ? cells[isActiveIndex]?.trim() ?? "" : "";

      if (!rawName && !rawEmail && !rawPassword && !rawRole && !rawIsActive) {
        skippedEmptyRows += 1;
        continue;
      }

      const parsed = createUserSchema.safeParse({
        name: rawName,
        email: rawEmail,
        password: rawPassword,
        role: rawRole ? rawRole.toUpperCase() : undefined,
        is_active: parseBooleanLike(rawIsActive)
      });

      if (!parsed.success) {
        const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
        errors.push({
          row: rowNumber,
          email: rawEmail || null,
          reason: reason || "fila invalida"
        });
        continue;
      }

      try {
        const item = await this.create(parsed.data, actorId);
        created.push(item);
      } catch (error) {
        if (error instanceof AppError && error.code === "USER_EXISTS") {
          duplicates.push({
            row: rowNumber,
            email: parsed.data.email,
            reason: "correo ya registrado"
          });
          continue;
        }

        const reason = error instanceof Error ? error.message : "error creando usuario";
        errors.push({
          row: rowNumber,
          email: parsed.data.email,
          reason
        });
      }
    }

    const summary = {
      delimiterDetected: delimiterToLabel(delimiter),
      totalRows: Math.max(lines.length - 1, 0),
      created: created.length,
      duplicates: duplicates.length,
      errors: errors.length,
      skippedEmptyRows
    };

    logger.info(
      {
        actorId,
        summary
      },
      "user.bulk_create.completed"
    );

    return {
      summary,
      created,
      duplicates,
      errors
    };
  }
}
