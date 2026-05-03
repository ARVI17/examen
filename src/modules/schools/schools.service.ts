import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { SchoolsRepository } from "./schools.repository";
import {
  SchoolCreateInput,
  SchoolGroupCreateInput,
  SchoolGroupUpdateInput,
  SchoolUpdateInput
} from "./schools.types";

export class SchoolsService {
  static async createSchool(payload: SchoolCreateInput, actorId?: string) {
    if (payload.code) {
      const duplicatedCode = await SchoolsRepository.findSchoolByCode(payload.code);
      if (duplicatedCode) {
        throw new AppError("Ya existe un colegio con ese codigo", 409, "SCHOOL_CODE_EXISTS");
      }
    }

    const school = await SchoolsRepository.createSchool(payload);

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

  static async listSchools(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typedQuery = query as { q?: string; isActive?: boolean };

    const where: Prisma.SchoolWhereInput = {
      isActive: typedQuery.isActive,
      OR: typedQuery.q
        ? [
            { name: { contains: typedQuery.q, mode: "insensitive" } },
            { code: { contains: typedQuery.q, mode: "insensitive" } }
          ]
        : undefined
    };

    const [total, items] = await SchoolsRepository.listSchools(where, pagination.skip, pagination.limit);
    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items
    };
  }

  static async getSchoolById(id: string) {
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

    const updated = await SchoolsRepository.updateSchool(id, payload);

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

  static async listGroupsBySchool(schoolId: string, query: Record<string, unknown>) {
    await this.getSchoolById(schoolId);

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

