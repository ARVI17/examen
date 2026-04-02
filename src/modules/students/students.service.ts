import { DocumentTypeCode, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { StudentsRepository } from "./students.repository";
import { StudentCreateInput, StudentUpdateInput } from "./students.types";

export class StudentService {
  static async createOrFind(payload: StudentCreateInput, actorId?: string) {
    const existing = await StudentsRepository.findByDocument(payload.numeroIdentificacion);

    if (existing) {
      if (existing.isDeleted) {
        const reactivated = await StudentsRepository.update(existing.id, {
          isDeleted: false,
          nombres: payload.nombres,
          apellidos: payload.apellidos,
          tipoIdentificacion: payload.tipoIdentificacion,
          grado: payload.grado
        });

        await createAuditLog({
          entidad: "students",
          entidadId: reactivated.id,
          accion: "REACTIVATE",
          userId: actorId,
          datos: { numeroIdentificacion: payload.numeroIdentificacion }
        });

        return { student: reactivated, reused: true };
      }

      return { student: existing, reused: true };
    }

    const created = await StudentsRepository.create(payload);

    await createAuditLog({
      entidad: "students",
      entidadId: created.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        numeroIdentificacion: created.numeroIdentificacion,
        grado: created.grado
      }
    });

    return { student: created, reused: false };
  }

  static async getByDocument(numeroIdentificacion: string) {
    const student = await StudentsRepository.findByDocument(numeroIdentificacion);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    return student;
  }

  static async getById(id: string) {
    const student = await StudentsRepository.findById(id);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    return student;
  }

  static async update(id: string, payload: StudentUpdateInput, actorId?: string) {
    const student = await StudentsRepository.findById(id);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    const updated = await StudentsRepository.update(id, {
      nombres: payload.nombres,
      apellidos: payload.apellidos,
      tipoIdentificacion: payload.tipoIdentificacion,
      grado: payload.grado
    });

    await createAuditLog({
      entidad: "students",
      entidadId: updated.id,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        before: {
          nombres: student.nombres,
          apellidos: student.apellidos,
          tipoIdentificacion: student.tipoIdentificacion,
          grado: student.grado
        },
        after: {
          nombres: updated.nombres,
          apellidos: updated.apellidos,
          tipoIdentificacion: updated.tipoIdentificacion,
          grado: updated.grado
        }
      }
    });

    return updated;
  }

  static async softDelete(id: string, actorId?: string) {
    const student = await StudentsRepository.findById(id);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    await StudentsRepository.update(id, { isDeleted: true });

    await createAuditLog({
      entidad: "students",
      entidadId: id,
      accion: "SOFT_DELETE",
      userId: actorId,
      datos: { numeroIdentificacion: student.numeroIdentificacion }
    });
  }

  static async list(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      nombres?: string;
      apellidos?: string;
      grado?: string;
      numeroIdentificacion?: string;
      tipoIdentificacion?: string;
      includeDeleted?: boolean;
    };

    const where: Prisma.StudentWhereInput = {
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
      tipoIdentificacion: typedQuery.tipoIdentificacion as DocumentTypeCode | undefined
    };

    const [total, students] = await StudentsRepository.list(where, pagination.skip, pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: students
    };
  }

  static async historyById(id: string) {
    const student = await this.getById(id);
    const attempts = await StudentsRepository.historyByStudentId(student.id);

    return {
      student,
      attempts,
      totalAttempts: attempts.length
    };
  }

  static async historyByDocument(numeroIdentificacion: string) {
    const student = await this.getByDocument(numeroIdentificacion);
    const attempts = await StudentsRepository.historyByStudentId(student.id);

    return {
      student,
      attempts,
      totalAttempts: attempts.length
    };
  }
}

