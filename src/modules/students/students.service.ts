import { DocumentTypeCode, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import {
  applyDocenteStudentWhereScope,
  assertCanAccessStudent,
  assertDocenteCanUseGroup,
  assertDocenteCanUseSchool,
  ensureDocenteScopeConfigured,
  getNormalizedScope,
  isDocenteUser
} from "../../common/security/access-scope";
import logger from "../../common/logger";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { StudentsRepository } from "./students.repository";
import { StudentCreateInput, StudentUpdateInput } from "./students.types";

type ActorUser = Express.Request["user"];

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
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
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

const toDocumentType = (value?: string): DocumentTypeCode | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase() as DocumentTypeCode;
  if (Object.values(DocumentTypeCode).includes(normalized)) {
    return normalized;
  }
  return undefined;
};

export class StudentService {
  private static async normalizeSchoolGroup(payload: {
    schoolId?: string;
    groupId?: string;
  }) {
    let schoolId = payload.schoolId;
    const groupId = payload.groupId;

    if (schoolId) {
      const school = await StudentsRepository.findSchoolById(schoolId);
      if (!school || !school.isActive) {
        throw new AppError("Colegio no encontrado o inactivo", 404, "SCHOOL_NOT_FOUND");
      }
    }

    if (groupId) {
      const group = await StudentsRepository.findGroupById(groupId);
      if (!group || !group.isActive) {
        throw new AppError("Grupo no encontrado o inactivo", 404, "GROUP_NOT_FOUND");
      }

      if (schoolId && group.schoolId !== schoolId) {
        throw new AppError("El grupo no pertenece al colegio indicado", 400, "GROUP_SCHOOL_MISMATCH");
      }

      schoolId = schoolId ?? group.schoolId;
    }

    return {
      schoolId,
      groupId
    };
  }

  private static assertDocenteStudentScope(actor: ActorUser | undefined, payload: { schoolId?: string; groupId?: string }) {
    if (isDocenteUser(actor)) {
      ensureDocenteScopeConfigured(actor);
      if (!payload.schoolId && !payload.groupId) {
        throw new AppError("Debes indicar colegio o grupo para registrar/consultar estudiantes", 400, "SCOPE_REQUIRED");
      }
    }
    assertDocenteCanUseSchool(actor, payload.schoolId);
    assertDocenteCanUseGroup(actor, payload.groupId);
  }

  static async createOrFind(payload: StudentCreateInput, actor?: ActorUser) {
    const scope = getNormalizedScope(actor);
    const scopedPayload: StudentCreateInput = {
      ...payload,
      schoolId:
        payload.schoolId ??
        (isDocenteUser(actor) && !payload.groupId && scope.groupIds.length === 0 && scope.schoolIds.length === 1
          ? scope.schoolIds[0]
          : undefined),
      groupId:
        payload.groupId ??
        (isDocenteUser(actor) && !payload.schoolId && scope.groupIds.length === 1 ? scope.groupIds[0] : undefined)
    };

    const normalizedSchoolGroup = await this.normalizeSchoolGroup({
      schoolId: scopedPayload.schoolId,
      groupId: scopedPayload.groupId
    });
    this.assertDocenteStudentScope(actor, normalizedSchoolGroup);

    const existing = await StudentsRepository.findByDocument(scopedPayload.numeroIdentificacion);

    if (existing) {
      assertCanAccessStudent(actor, {
        schoolId: existing.schoolId,
        groupId: existing.groupId
      });

      if (existing.isDeleted) {
        const reactivated = await StudentsRepository.update(existing.id, {
          isDeleted: false,
          nombres: scopedPayload.nombres,
          apellidos: scopedPayload.apellidos,
          tipoIdentificacion: scopedPayload.tipoIdentificacion,
          grado: scopedPayload.grado,
          schoolId: normalizedSchoolGroup.schoolId,
          groupId: normalizedSchoolGroup.groupId,
          fechaNacimiento: scopedPayload.fechaNacimiento,
          genero: scopedPayload.genero,
          institucion: scopedPayload.institucion,
          jornada: scopedPayload.jornada,
          grupo: scopedPayload.grupo,
          departamento: scopedPayload.departamento,
          municipio: scopedPayload.municipio,
          email: scopedPayload.email,
          telefono: scopedPayload.telefono,
          acudienteNombre: scopedPayload.acudienteNombre,
          acudienteEmail: scopedPayload.acudienteEmail,
          acudienteTelefono: scopedPayload.acudienteTelefono
        });

        await createAuditLog({
          entidad: "students",
          entidadId: reactivated.id,
          accion: "REACTIVATE",
          userId: actor?.id,
          datos: { numeroIdentificacion: scopedPayload.numeroIdentificacion }
        });

        return { student: reactivated, reused: true };
      }

      return { student: existing, reused: true };
    }

    const created = await StudentsRepository.create({
      ...scopedPayload,
      schoolId: normalizedSchoolGroup.schoolId,
      groupId: normalizedSchoolGroup.groupId
    });

    await createAuditLog({
      entidad: "students",
      entidadId: created.id,
      accion: "CREATE",
      userId: actor?.id,
      datos: {
        numeroIdentificacion: created.numeroIdentificacion,
        grado: created.grado,
        schoolId: created.schoolId,
        groupId: created.groupId
      }
    });

    return { student: created, reused: false };
  }

  static async getByDocument(numeroIdentificacion: string, actor?: ActorUser) {
    const student = await StudentsRepository.findByDocument(numeroIdentificacion);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    assertCanAccessStudent(actor, {
      schoolId: student.schoolId,
      groupId: student.groupId
    });

    return student;
  }

  static async getById(id: string, actor?: ActorUser) {
    const student = await StudentsRepository.findById(id);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    assertCanAccessStudent(actor, {
      schoolId: student.schoolId,
      groupId: student.groupId
    });

    return student;
  }

  static async update(id: string, payload: StudentUpdateInput, actor?: ActorUser) {
    const student = await this.getById(id, actor);

    const normalizedSchoolGroup = await this.normalizeSchoolGroup({
      schoolId: payload.schoolId ?? student.schoolId ?? undefined,
      groupId: payload.groupId ?? student.groupId ?? undefined
    });
    this.assertDocenteStudentScope(actor, normalizedSchoolGroup);

    const updated = await StudentsRepository.update(id, {
      nombres: payload.nombres,
      apellidos: payload.apellidos,
      tipoIdentificacion: payload.tipoIdentificacion,
      grado: payload.grado,
      schoolId: payload.schoolId === undefined ? undefined : normalizedSchoolGroup.schoolId,
      groupId: payload.groupId === undefined ? undefined : normalizedSchoolGroup.groupId,
      fechaNacimiento: payload.fechaNacimiento,
      genero: payload.genero,
      institucion: payload.institucion,
      jornada: payload.jornada,
      grupo: payload.grupo,
      departamento: payload.departamento,
      municipio: payload.municipio,
      email: payload.email,
      telefono: payload.telefono,
      acudienteNombre: payload.acudienteNombre,
      acudienteEmail: payload.acudienteEmail,
      acudienteTelefono: payload.acudienteTelefono
    });

    await createAuditLog({
      entidad: "students",
      entidadId: updated.id,
      accion: "UPDATE",
      userId: actor?.id,
      datos: {
        before: student,
        after: updated
      }
    });

    return updated;
  }

  static async softDelete(id: string, actor?: ActorUser) {
    const student = await this.getById(id, actor);

    await StudentsRepository.update(id, { isDeleted: true });

    await createAuditLog({
      entidad: "students",
      entidadId: id,
      accion: "SOFT_DELETE",
      userId: actor?.id,
      datos: { numeroIdentificacion: student.numeroIdentificacion }
    });
  }

  static async list(query: Record<string, unknown>, actor?: ActorUser) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      nombres?: string;
      apellidos?: string;
      grado?: string;
      numeroIdentificacion?: string;
      tipoIdentificacion?: string;
      schoolId?: string;
      groupId?: string;
      institucion?: string;
      grupo?: string;
      includeDeleted?: boolean;
    };

    let where: Prisma.StudentWhereInput = {
      isDeleted: typedQuery.includeDeleted ? undefined : false,
      nombres: typedQuery.nombres
        ? {
            contains: typedQuery.nombres,
            mode: "insensitive"
          }
        : undefined,
      apellidos: typedQuery.apellidos
        ? {
            contains: typedQuery.apellidos,
            mode: "insensitive"
          }
        : undefined,
      grado: typedQuery.grado ? typedQuery.grado : undefined,
      numeroIdentificacion: typedQuery.numeroIdentificacion ?? undefined,
      tipoIdentificacion: typedQuery.tipoIdentificacion as DocumentTypeCode | undefined,
      schoolId: typedQuery.schoolId,
      groupId: typedQuery.groupId,
      institucion: typedQuery.institucion
        ? {
            contains: typedQuery.institucion,
            mode: "insensitive"
          }
        : undefined,
      grupo: typedQuery.grupo
        ? {
            contains: typedQuery.grupo,
            mode: "insensitive"
          }
        : undefined
    };

    where = applyDocenteStudentWhereScope(actor, where);

    const [total, students] = await StudentsRepository.list(where, pagination.skip, pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: students
    };
  }

  static async historyById(id: string, actor?: ActorUser) {
    const student = await this.getById(id, actor);
    const attempts = await StudentsRepository.historyByStudentId(student.id);

    return {
      student,
      attempts,
      totalAttempts: attempts.length
    };
  }

  static async historyByDocument(numeroIdentificacion: string, actor?: ActorUser) {
    const student = await this.getByDocument(numeroIdentificacion, actor);
    const attempts = await StudentsRepository.historyByStudentId(student.id);

    return {
      student,
      attempts,
      totalAttempts: attempts.length
    };
  }

  static async bulkCreate(
    payload: {
      fileBuffer?: Buffer;
      csvText?: string;
      delimiter?: string;
    },
    actor?: ActorUser
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
    const delimiter = payload.delimiter && [",", ";", "\t"].includes(payload.delimiter)
      ? payload.delimiter
      : detectDelimiter(headerLine);

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

    const namesIndex = resolveColumnIndex(["nombres", "nombre", "name"]);
    const lastNamesIndex = resolveColumnIndex(["apellidos", "apellido", "lastname", "last_name"]);
    const docTypeIndex = resolveColumnIndex(["tipo_identificacion", "tipoidentificacion", "tipo_documento", "document_type"]);
    const docIndex = resolveColumnIndex(["numero_identificacion", "numeroidentificacion", "documento", "numero_documento"]);
    const gradeIndex = resolveColumnIndex(["grado", "grade"]);
    const groupIndex = resolveColumnIndex(["grupo", "group"]);
    const institutionIndex = resolveColumnIndex(["institucion", "institution", "colegio"]);
    const emailIndex = resolveColumnIndex(["email", "correo"]);
    const schoolIdIndex = resolveColumnIndex(["school_id", "colegio_id"]);
    const groupIdIndex = resolveColumnIndex(["group_id", "grupo_id"]);

    if (namesIndex < 0 || lastNamesIndex < 0 || docTypeIndex < 0 || docIndex < 0 || gradeIndex < 0) {
      throw new AppError(
        "Cabecera invalida. Minimo requerido: nombres, apellidos, tipo_identificacion, numero_identificacion, grado",
        400,
        "CSV_INVALID_HEADER"
      );
    }

    const created = [];
    const reused = [];
    const errors: Array<{ row: number; numeroIdentificacion: string | null; reason: string }> = [];

    for (let rowNumber = 2; rowNumber <= lines.length; rowNumber += 1) {
      const line = lines[rowNumber - 1];
      if (!line || !line.trim()) {
        continue;
      }

      const cells = parseDelimitedLine(line, delimiter);
      const tipoIdentificacion = toDocumentType(cells[docTypeIndex]);
      const numeroIdentificacion = cells[docIndex]?.trim();
      const grado = cells[gradeIndex]?.trim();

      if (!tipoIdentificacion || !numeroIdentificacion || !grado) {
        errors.push({
          row: rowNumber,
          numeroIdentificacion: numeroIdentificacion ?? null,
          reason: "Fila invalida: falta tipo_identificacion/numero_identificacion/grado"
        });
        continue;
      }

      try {
        const result = await this.createOrFind(
          {
            nombres: cells[namesIndex]?.trim() ?? "",
            apellidos: cells[lastNamesIndex]?.trim() ?? "",
            tipoIdentificacion,
            numeroIdentificacion,
            grado,
            grupo: groupIndex >= 0 ? cells[groupIndex]?.trim() || undefined : undefined,
            institucion: institutionIndex >= 0 ? cells[institutionIndex]?.trim() || undefined : undefined,
            email: emailIndex >= 0 ? cells[emailIndex]?.trim().toLowerCase() || undefined : undefined,
            schoolId: schoolIdIndex >= 0 ? cells[schoolIdIndex]?.trim() || undefined : undefined,
            groupId: groupIdIndex >= 0 ? cells[groupIdIndex]?.trim() || undefined : undefined
          },
          actor
        );

        if (result.reused) {
          reused.push(result.student);
        } else {
          created.push(result.student);
        }
      } catch (error) {
        errors.push({
          row: rowNumber,
          numeroIdentificacion,
          reason: error instanceof Error ? error.message : "Error procesando fila"
        });
      }
    }

    logger.info(
      {
        actorId: actor?.id,
        created: created.length,
        reused: reused.length,
        errors: errors.length
      },
      "students.bulk_create.completed"
    );

    return {
      summary: {
        totalRows: lines.length - 1,
        created: created.length,
        reused: reused.length,
        errors: errors.length
      },
      created,
      reused,
      errors
    };
  }
}
