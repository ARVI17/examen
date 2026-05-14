import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { ensureDocenteScopeConfigured, getNormalizedScope, isDocenteUser } from "../../common/security/access-scope";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { SchoolsRepository } from "./schools.repository";
import {
  SchoolCreateInput,
  SchoolGroupCreateInput,
  SchoolGroupUpdateInput,
  SchoolUpdateInput
} from "./schools.types";

type ActorUser = Express.Request["user"];

const normalizeUpper = (value?: string | null) => (value ? value.trim().replace(/\s+/g, " ").toUpperCase() : undefined);

const normalizeBasic = (value?: string | null) => (value ? value.trim().replace(/\s+/g, " ") : undefined);

const normalizeForSearch = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
};

const buildSchoolSearchLabel = (payload: Partial<SchoolCreateInput>) => {
  const departamento = normalizeUpper(payload.departamento);
  const municipio = normalizeUpper(payload.municipio);
  const establecimiento = normalizeBasic(payload.establecimiento || payload.name);
  const sede = normalizeBasic(payload.sede);
  const sector = normalizeUpper(payload.sectorNormalizado);

  const parts = [departamento, municipio, establecimiento, sede, sector].filter(Boolean) as string[];
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(" / ");
};

export class SchoolsService {
  static async createSchool(payload: SchoolCreateInput, actorId?: string) {
    if (payload.code) {
      const duplicatedCode = await SchoolsRepository.findSchoolByCode(payload.code);
      if (duplicatedCode) {
        throw new AppError("Ya existe un colegio con ese codigo", 409, "SCHOOL_CODE_EXISTS");
      }
    }

    const normalizedPayload: SchoolCreateInput = {
      ...payload,
      establecimiento: normalizeBasic(payload.establecimiento),
      sede: normalizeBasic(payload.sede),
      departamento: normalizeUpper(payload.departamento),
      municipio: normalizeUpper(payload.municipio),
      departamentoCodigo: normalizeBasic(payload.departamentoCodigo),
      municipioCodigo: normalizeBasic(payload.municipioCodigo),
      sectorOriginal: normalizeBasic(payload.sectorOriginal),
      sectorNormalizado: normalizeUpper(payload.sectorNormalizado) as SchoolCreateInput["sectorNormalizado"],
      zona: normalizeUpper(payload.zona),
      direccion: normalizeBasic(payload.direccion),
      codigoDane: normalizeBasic(payload.codigoDane),
      estadoFuente: normalizeBasic(payload.estadoFuente),
      fuente: normalizeBasic(payload.fuente),
      searchLabel: payload.searchLabel ? normalizeBasic(payload.searchLabel) : buildSchoolSearchLabel(payload),
      nombreNormalizado: payload.nombreNormalizado
        ? normalizeForSearch(payload.nombreNormalizado)
        : normalizeForSearch(payload.establecimiento || payload.name)
    };

    const school = await SchoolsRepository.createSchool(normalizedPayload);

    await createAuditLog({
      entidad: "schools",
      entidadId: school.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        code: school.code,
        name: school.name
      }
    });

    return school;
  }

  static async listSchools(query: Record<string, unknown>, actor?: ActorUser) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      q?: string;
      departamento?: string;
      municipio?: string;
      codigoDane?: string;
      sectorNormalizado?: "OFICIAL" | "NO OFICIAL";
      isActive?: boolean;
    };
    const departamento = normalizeUpper(typedQuery.departamento);
    const municipio = normalizeUpper(typedQuery.municipio);
    const codigoDane = normalizeBasic(typedQuery.codigoDane);
    const sectorNormalizado = normalizeUpper(typedQuery.sectorNormalizado) as "OFICIAL" | "NO OFICIAL" | undefined;
    const search = typedQuery.q ? typedQuery.q.trim() : undefined;

    let where: Prisma.SchoolWhereInput = {
      departamento,
      municipio,
      codigoDane,
      sectorNormalizado,
      isActive: typedQuery.isActive,
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
            { establecimiento: { contains: search, mode: "insensitive" } },
            { sede: { contains: search, mode: "insensitive" } },
            { searchLabel: { contains: search, mode: "insensitive" } },
            { nombreNormalizado: { contains: normalizeForSearch(search), mode: "insensitive" } }
          ]
        : undefined
    };

    if (isDocenteUser(actor)) {
      ensureDocenteScopeConfigured(actor);
      const scope = getNormalizedScope(actor);
      where = {
        ...where,
        id: {
          in: scope.schoolIds
        }
      };
    }

    const [total, items] = await SchoolsRepository.listSchools(where, pagination.skip, pagination.limit);
    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items
    };
  }

  static async listDepartments(query: Record<string, unknown>, actor?: ActorUser) {
    const typedQuery = query as { q?: string };
    const search = typedQuery.q ? typedQuery.q.trim() : undefined;

    let where: Prisma.SchoolWhereInput | undefined;
    if (isDocenteUser(actor)) {
      ensureDocenteScopeConfigured(actor);
      const scope = getNormalizedScope(actor);
      where = {
        id: {
          in: scope.schoolIds
        }
      };
    }

    const rows = await SchoolsRepository.listDistinctDepartments(where);
    const items = rows
      .map((row) => row.departamento?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value) => (search ? value.toLowerCase().includes(search.toLowerCase()) : true));

    return { items };
  }

  static async listMunicipalities(query: Record<string, unknown>, actor?: ActorUser) {
    const typedQuery = query as { departamento: string; q?: string };
    const departamento = normalizeUpper(typedQuery.departamento);
    if (!departamento) {
      throw new AppError("departamento es obligatorio", 400, "VALIDATION_ERROR");
    }

    const search = typedQuery.q ? typedQuery.q.trim() : undefined;

    let where: Prisma.SchoolWhereInput | undefined;
    if (isDocenteUser(actor)) {
      ensureDocenteScopeConfigured(actor);
      const scope = getNormalizedScope(actor);
      where = {
        id: {
          in: scope.schoolIds
        }
      };
    }

    const rows = await SchoolsRepository.listDistinctMunicipalities(departamento, where);
    const items = rows
      .map((row) => row.municipio?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value) => (search ? value.toLowerCase().includes(search.toLowerCase()) : true));

    return { items };
  }

  static async getSchoolById(id: string, actor?: ActorUser) {
    if (isDocenteUser(actor)) {
      ensureDocenteScopeConfigured(actor);
      const scope = getNormalizedScope(actor);
      if (!scope.schoolIds.includes(id)) {
        throw new AppError("No autorizado para este colegio", 403, "DOCENTE_SCOPE_FORBIDDEN");
      }
    }

    const school = await SchoolsRepository.findSchoolById(id);
    if (!school) {
      throw new AppError("Colegio no encontrado", 404, "NOT_FOUND");
    }
    return school;
  }

  static async updateSchool(id: string, payload: SchoolUpdateInput, actorId?: string) {
    const existing = await this.getSchoolById(id);

    if (payload.code && payload.code !== existing.code) {
      const duplicatedCode = await SchoolsRepository.findSchoolByCode(payload.code);
      if (duplicatedCode && duplicatedCode.id !== id) {
        throw new AppError("Ya existe un colegio con ese codigo", 409, "SCHOOL_CODE_EXISTS");
      }
    }

    const normalizedPayload: SchoolUpdateInput = {
      ...payload,
      establecimiento: normalizeBasic(payload.establecimiento),
      sede: normalizeBasic(payload.sede),
      departamento: normalizeUpper(payload.departamento),
      municipio: normalizeUpper(payload.municipio),
      departamentoCodigo: normalizeBasic(payload.departamentoCodigo),
      municipioCodigo: normalizeBasic(payload.municipioCodigo),
      sectorOriginal: normalizeBasic(payload.sectorOriginal),
      sectorNormalizado: normalizeUpper(payload.sectorNormalizado) as SchoolCreateInput["sectorNormalizado"],
      zona: normalizeUpper(payload.zona),
      direccion: normalizeBasic(payload.direccion),
      codigoDane: normalizeBasic(payload.codigoDane),
      estadoFuente: normalizeBasic(payload.estadoFuente),
      fuente: normalizeBasic(payload.fuente),
      searchLabel: payload.searchLabel
        ? normalizeBasic(payload.searchLabel)
        : buildSchoolSearchLabel({ ...existing, ...payload } as Partial<SchoolCreateInput>),
      nombreNormalizado: payload.nombreNormalizado
        ? normalizeForSearch(payload.nombreNormalizado)
        : payload.name || payload.establecimiento
          ? normalizeForSearch(payload.establecimiento || payload.name)
          : existing.nombreNormalizado || normalizeForSearch(existing.establecimiento || existing.name)
    };

    const updated = await SchoolsRepository.updateSchool(id, normalizedPayload);

    await createAuditLog({
      entidad: "schools",
      entidadId: id,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        before: existing,
        after: updated
      }
    });

    return updated;
  }

  static async createGroup(schoolId: string, payload: Omit<SchoolGroupCreateInput, "schoolId">, actorId?: string) {
    await this.getSchoolById(schoolId);

    const duplicated = await SchoolsRepository.findGroupUnique({
      schoolId,
      name: payload.name,
      academicYear: payload.academicYear
    });

    if (duplicated) {
      throw new AppError("Ya existe un grupo con el mismo nombre y anio academico", 409, "GROUP_ALREADY_EXISTS");
    }

    const created = await SchoolsRepository.createGroup({
      schoolId,
      code: payload.code,
      name: payload.name,
      grade: payload.grade,
      academicYear: payload.academicYear,
      isActive: payload.isActive
    });

    await createAuditLog({
      entidad: "school_groups",
      entidadId: created.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        schoolId,
        name: created.name,
        academicYear: created.academicYear
      }
    });

    return created;
  }

  static async listGroupsBySchool(schoolId: string, query: Record<string, unknown>, actor?: ActorUser) {
    await this.getSchoolById(schoolId, actor);

    const pagination = getPagination(query);
    const typedQuery = query as {
      q?: string;
      grade?: string;
      academicYear?: number;
      isActive?: boolean;
    };

    const where: Prisma.SchoolGroupWhereInput = {
      grade: typedQuery.grade,
      academicYear: typedQuery.academicYear,
      isActive: typedQuery.isActive,
      OR: typedQuery.q
        ? [
            { name: { contains: typedQuery.q, mode: "insensitive" } },
            { code: { contains: typedQuery.q, mode: "insensitive" } }
          ]
        : undefined
    };

    const [total, items] = await SchoolsRepository.listGroupsBySchool(schoolId, where, pagination.skip, pagination.limit);

    if (isDocenteUser(actor)) {
      const scope = getNormalizedScope(actor);
      const filtered = items.filter((group) => scope.groupIds.length === 0 || scope.groupIds.includes(group.id));
      return {
        page: pagination.page,
        limit: pagination.limit,
        total: filtered.length,
        items: filtered
      };
    }

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items
    };
  }

  static async updateGroup(groupId: string, payload: SchoolGroupUpdateInput, actorId?: string) {
    const existing = await SchoolsRepository.findGroupById(groupId);
    if (!existing) {
      throw new AppError("Grupo no encontrado", 404, "NOT_FOUND");
    }

    const candidateName = payload.name ?? existing.name;
    const candidateYear = payload.academicYear ?? existing.academicYear ?? undefined;

    const duplicated = await SchoolsRepository.findGroupUnique({
      schoolId: existing.schoolId,
      name: candidateName,
      academicYear: candidateYear
    });

    if (duplicated && duplicated.id !== groupId) {
      throw new AppError("Ya existe un grupo con el mismo nombre y anio academico", 409, "GROUP_ALREADY_EXISTS");
    }

    const updated = await SchoolsRepository.updateGroup(groupId, payload);

    await createAuditLog({
      entidad: "school_groups",
      entidadId: groupId,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        before: existing,
        after: updated
      }
    });

    return updated;
  }
}
