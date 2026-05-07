import { ExamStatus, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import {
  assertCanAccessExamAssignments,
  canAccessExamAssignment,
  isDocenteUser
} from "../../common/security/access-scope";
import prisma from "../../common/prisma";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { QuestionsRepository } from "../questions/questions.repository";
import { ExamsRepository } from "./exams.repository";
import { ExamAssignmentCreateInput, ExamCreateInput, ExamQuestionAssignment, ExamUpdateInput } from "./exams.types";
import { normalizeExamType, normalizeGradoObjetivo } from "./exams.utils";

type ActorUser = Express.Request["user"];

export class ExamService {
  private static filterAssignmentsByScope<T extends { scope: string; schoolId?: string | null; groupId?: string | null; student?: { schoolId: string | null; groupId: string | null } | null }>(
    actor: ActorUser | undefined,
    assignments: T[]
  ) {
    if (!isDocenteUser(actor)) {
      return assignments;
    }

    return assignments.filter((assignment) =>
      canAccessExamAssignment(actor, {
        scope: assignment.scope,
        schoolId: assignment.schoolId ?? null,
        groupId: assignment.groupId ?? null,
        student: assignment.student ?? null
      })
    );
  }

  private static assertDocenteExamScope(actor: ActorUser | undefined, assignments: Array<{ scope: string; schoolId?: string | null; groupId?: string | null; student?: { schoolId: string | null; groupId: string | null } | null }>) {
    if (!isDocenteUser(actor)) {
      return;
    }

    assertCanAccessExamAssignments(actor, assignments.map((assignment) => ({
      scope: assignment.scope,
      schoolId: assignment.schoolId ?? null,
      groupId: assignment.groupId ?? null,
      student: assignment.student ?? null
    })));
  }

  static async create(payload: ExamCreateInput, actorId?: string) {
    const duplicated = await ExamsRepository.findByNaturalKey({
      nombre: payload.nombre,
      tipoPrueba: payload.tipoPrueba,
      gradoObjetivo: payload.gradoObjetivo
    });

    if (duplicated) {
      throw new AppError(
        "Ya existe una prueba activa con el mismo nombre, tipo y grado objetivo",
        409,
        "EXAM_ALREADY_EXISTS"
      );
    }

    const exam = await (async () => {
      try {
        return await ExamsRepository.create(payload);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new AppError(
            "Ya existe una prueba activa con el mismo nombre, tipo y grado objetivo",
            409,
            "EXAM_ALREADY_EXISTS"
          );
        }
        throw error;
      }
    })();

    await createAuditLog({
      entidad: "exams",
      entidadId: exam.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        nombre: exam.nombre,
        tipoPrueba: exam.tipoPrueba
      }
    });

    return exam;
  }

  static async getById(id: string, actor?: ActorUser) {
    const exam = await ExamsRepository.findByIdWithRelations(id);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const assignments = await ExamsRepository.listAssignments(id);
    this.assertDocenteExamScope(actor, assignments);

    if (isDocenteUser(actor)) {
      exam.examAttempts = exam.examAttempts.filter((attempt) =>
        canAccessExamAssignment(actor, {
          scope: "STUDENT",
          schoolId: attempt.estudiante.schoolId,
          groupId: attempt.estudiante.groupId,
          student: {
            schoolId: attempt.estudiante.schoolId,
            groupId: attempt.estudiante.groupId
          }
        })
      );
    }

    return exam;
  }

  static async list(query: Record<string, unknown>, actor?: ActorUser) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      estado?: ExamStatus;
      tipoPrueba?: string;
      gradoObjetivo?: string;
    };

    const normalizedTipoPrueba = typedQuery.tipoPrueba ? normalizeExamType(typedQuery.tipoPrueba) : undefined;
    const normalizedGradoObjetivo = typedQuery.gradoObjetivo
      ? normalizeGradoObjetivo(typedQuery.gradoObjetivo)
      : undefined;

    const where: Prisma.ExamWhereInput = {
      estado: typedQuery.estado,
      tipoPrueba: normalizedTipoPrueba,
      gradoObjetivo: normalizedGradoObjetivo,
      isDeleted: false
    };

    if (isDocenteUser(actor)) {
      const [, examsWithAssignments] = await ExamsRepository.listWithAssignments(where, 0, 5000);
      const scopedExams = examsWithAssignments.filter((exam) =>
        this.filterAssignmentsByScope(actor, exam.assignments).length > 0
      );
      const paged = scopedExams.slice(pagination.skip, pagination.skip + pagination.limit);
      return {
        page: pagination.page,
        limit: pagination.limit,
        total: scopedExams.length,
        items: paged.map((exam) => ({
          id: exam.id,
          nombre: exam.nombre,
          descripcion: exam.descripcion,
          tipoPrueba: exam.tipoPrueba,
          gradoObjetivo: exam.gradoObjetivo,
          estado: exam.estado,
          tiempoLimiteMinutos: exam.tiempoLimiteMinutos,
          totalPreguntas: exam.totalPreguntas,
          puntajeMaximo: exam.puntajeMaximo,
          instrucciones: exam.instrucciones,
          fechaPublicacion: exam.fechaPublicacion,
          isDeleted: exam.isDeleted,
          createdAt: exam.createdAt,
          updatedAt: exam.updatedAt
        }))
      };
    }

    const [total, exams] = await ExamsRepository.list(where, pagination.skip, pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: exams
    };
  }

  static async listPublic(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      tipoPrueba?: string;
      gradoObjetivo?: string;
      schoolId?: string;
      groupId?: string;
      studentId?: string;
      numeroIdentificacion?: string;
    };

    let context = {
      schoolId: typedQuery.schoolId,
      groupId: typedQuery.groupId,
      studentId: typedQuery.studentId
    };

    if (typedQuery.numeroIdentificacion && !context.studentId) {
      const student = await ExamsRepository.findStudentByDocument(typedQuery.numeroIdentificacion);
      if (student && !student.isDeleted) {
        context = {
          schoolId: context.schoolId ?? student.schoolId ?? undefined,
          groupId: context.groupId ?? student.groupId ?? undefined,
          studentId: student.id
        };
      }
    }

    if (context.studentId && (!context.schoolId || !context.groupId)) {
      const student = await ExamsRepository.findStudentById(context.studentId);
      if (student && !student.isDeleted) {
        context = {
          schoolId: context.schoolId ?? student.schoolId ?? undefined,
          groupId: context.groupId ?? student.groupId ?? undefined,
          studentId: context.studentId
        };
      }
    }

    const where: Prisma.ExamWhereInput = {
      estado: ExamStatus.PUBLICADO,
      tipoPrueba: typedQuery.tipoPrueba,
      gradoObjetivo: typedQuery.gradoObjetivo,
      isDeleted: false
    };

    const [, exams] = await ExamsRepository.listWithAssignments(where, 0, 5000);
    const now = new Date();

    const isTimeEnabled = (assignment: { startsAt: Date | null; endsAt: Date | null }) => {
      if (assignment.startsAt && assignment.startsAt.getTime() > now.getTime()) {
        return false;
      }
      if (assignment.endsAt && assignment.endsAt.getTime() < now.getTime()) {
        return false;
      }
      return true;
    };

    const hasMatch = (exam: (typeof exams)[number]) => {
      if (!exam.assignments || exam.assignments.length === 0) {
        return true;
      }

      for (const assignment of exam.assignments) {
        if (!assignment.isActive || !isTimeEnabled(assignment)) {
          continue;
        }

        if (assignment.scope === "GLOBAL") {
          return true;
        }

        if (assignment.scope === "SCHOOL" && context.schoolId && assignment.schoolId === context.schoolId) {
          return true;
        }

        if (assignment.scope === "GROUP" && context.groupId && assignment.groupId === context.groupId) {
          return true;
        }

        if (assignment.scope === "STUDENT" && context.studentId && assignment.studentId === context.studentId) {
          return true;
        }
      }

      return false;
    };

    const filteredAll = exams.filter(hasMatch).map((exam) => ({
      id: exam.id,
      nombre: exam.nombre,
      descripcion: exam.descripcion,
      tipoPrueba: exam.tipoPrueba,
      gradoObjetivo: exam.gradoObjetivo,
      estado: exam.estado,
      tiempoLimiteMinutos: exam.tiempoLimiteMinutos,
      totalPreguntas: exam.totalPreguntas,
      puntajeMaximo: exam.puntajeMaximo,
      instrucciones: exam.instrucciones,
      fechaPublicacion: exam.fechaPublicacion,
      hasAssignments: exam.assignments.length > 0
    }));

    const paged = filteredAll.slice(pagination.skip, pagination.skip + pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total: filteredAll.length,
      context,
      items: paged
    };
  }

  static async update(id: string, payload: ExamUpdateInput, actorId?: string) {
    const existing = await ExamsRepository.findById(id);

    if (!existing || existing.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const candidateNaturalKey = {
      nombre: payload.nombre ?? existing.nombre,
      tipoPrueba: payload.tipoPrueba ?? existing.tipoPrueba,
      gradoObjetivo: payload.gradoObjetivo ?? existing.gradoObjetivo
    };

    const duplicated = await ExamsRepository.findByNaturalKey({
      ...candidateNaturalKey,
      excludeId: id
    });

    if (duplicated) {
      throw new AppError(
        "Ya existe una prueba activa con el mismo nombre, tipo y grado objetivo",
        409,
        "EXAM_ALREADY_EXISTS"
      );
    }

    const updated = await (async () => {
      try {
        return await ExamsRepository.update(id, payload);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new AppError(
            "Ya existe una prueba activa con el mismo nombre, tipo y grado objetivo",
            409,
            "EXAM_ALREADY_EXISTS"
          );
        }
        throw error;
      }
    })();

    await createAuditLog({
      entidad: "exams",
      entidadId: id,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        before: {
          estado: existing.estado,
          totalPreguntas: existing.totalPreguntas,
          puntajeMaximo: existing.puntajeMaximo
        },
        after: {
          estado: updated.estado,
          totalPreguntas: updated.totalPreguntas,
          puntajeMaximo: updated.puntajeMaximo
        }
      }
    });

    return updated;
  }

  static async softDelete(id: string, actorId?: string) {
    const existing = await ExamsRepository.findById(id);

    if (!existing || existing.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    await ExamsRepository.update(id, {
      estado: ExamStatus.INACTIVO,
      isDeleted: true
    });

    await createAuditLog({
      entidad: "exams",
      entidadId: id,
      accion: "SOFT_DELETE",
      userId: actorId,
      datos: {
        nombre: existing.nombre
      }
    });
  }

  static async addQuestions(examId: string, assignments: ExamQuestionAssignment[], actorId?: string) {
    const exam = await ExamsRepository.findById(examId);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const createdQuestions = [];

    for (const [index, assignment] of assignments.entries()) {
      const question = await QuestionsRepository.findById(assignment.questionId);

      if (!question || !question.estado) {
        throw new AppError(`Pregunta no disponible: ${assignment.questionId}`, 404, "QUESTION_NOT_FOUND");
      }

      const existsInExam = await ExamsRepository.findExamQuestion(examId, assignment.questionId);
      if (existsInExam) {
        throw new AppError(
          `La pregunta ${assignment.questionId} ya existe en la prueba`,
          409,
          "QUESTION_ALREADY_ASSIGNED"
        );
      }

      const order = assignment.orden ?? index + 1;
      const existingOrder = await ExamsRepository.findExamQuestionByOrder(examId, order);
      if (existingOrder) {
        throw new AppError(`El orden ${order} ya esta ocupado en la prueba`, 409, "ORDER_ALREADY_USED");
      }

      const created = await ExamsRepository.createExamQuestion({
        examId,
        questionId: assignment.questionId,
        orden: order,
        puntajePregunta: assignment.puntajePregunta ?? 1,
        area: assignment.area ?? question.area,
        metadata: assignment.metadata
      });

      createdQuestions.push(created);
    }

    const totalQuestions = await ExamsRepository.countExamQuestions(examId);

    await prisma.exam.update({
      where: { id: examId },
      data: { totalPreguntas: totalQuestions }
    });

    await createAuditLog({
      entidad: "exam_questions",
      entidadId: examId,
      accion: "ADD_QUESTIONS",
      userId: actorId,
      datos: {
        totalQuestions,
        added: createdQuestions.length
      }
    });

    return {
      addedCount: createdQuestions.length,
      totalQuestions,
      items: createdQuestions
    };
  }

  static async listQuestions(examId: string, actor?: ActorUser) {
    const exam = await ExamsRepository.findById(examId);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const assignments = await ExamsRepository.listAssignments(examId);
    this.assertDocenteExamScope(actor, assignments);

    const questions = await ExamsRepository.listExamQuestions(examId);

    return {
      exam,
      totalQuestions: questions.length,
      items: questions
    };
  }

  static async createAssignment(examId: string, payload: ExamAssignmentCreateInput, actorId?: string) {
    const exam = await ExamsRepository.findById(examId);
    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    if (payload.scope === "SCHOOL") {
      if (!payload.schoolId) {
        throw new AppError("school_id es obligatorio para scope SCHOOL", 400, "VALIDATION_ERROR");
      }
      const school = await ExamsRepository.findSchoolById(payload.schoolId);
      if (!school || !school.isActive) {
        throw new AppError("Colegio no encontrado o inactivo", 404, "SCHOOL_NOT_FOUND");
      }
    }

    if (payload.scope === "GROUP") {
      if (!payload.schoolId || !payload.groupId) {
        throw new AppError("school_id y group_id son obligatorios para scope GROUP", 400, "VALIDATION_ERROR");
      }

      const [school, group] = await Promise.all([
        ExamsRepository.findSchoolById(payload.schoolId),
        ExamsRepository.findGroupById(payload.groupId)
      ]);

      if (!school || !school.isActive) {
        throw new AppError("Colegio no encontrado o inactivo", 404, "SCHOOL_NOT_FOUND");
      }

      if (!group || !group.isActive) {
        throw new AppError("Grupo no encontrado o inactivo", 404, "GROUP_NOT_FOUND");
      }

      if (group.schoolId !== school.id) {
        throw new AppError("El grupo no pertenece al colegio indicado", 400, "GROUP_SCHOOL_MISMATCH");
      }
    }

    if (payload.scope === "STUDENT") {
      if (!payload.studentId) {
        throw new AppError("student_id es obligatorio para scope STUDENT", 400, "VALIDATION_ERROR");
      }

      const student = await ExamsRepository.findStudentById(payload.studentId);
      if (!student || student.isDeleted) {
        throw new AppError("Estudiante no encontrado", 404, "STUDENT_NOT_FOUND");
      }

      if (payload.schoolId && student.schoolId && payload.schoolId !== student.schoolId) {
        throw new AppError("school_id no coincide con el estudiante", 400, "STUDENT_SCHOOL_MISMATCH");
      }

      if (payload.groupId && student.groupId && payload.groupId !== student.groupId) {
        throw new AppError("group_id no coincide con el estudiante", 400, "STUDENT_GROUP_MISMATCH");
      }
    }

    const created = await ExamsRepository.createAssignment(examId, {
      ...payload,
      createdByUserId: actorId
    });

    await createAuditLog({
      entidad: "exam_assignments",
      entidadId: created.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        examId,
        scope: created.scope,
        schoolId: created.schoolId,
        groupId: created.groupId,
        studentId: created.studentId
      }
    });

    return created;
  }

  static async listAssignments(examId: string, actor?: ActorUser) {
    const exam = await ExamsRepository.findById(examId);
    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const items = await ExamsRepository.listAssignments(examId);
    this.assertDocenteExamScope(actor, items);
    const scopedItems = this.filterAssignmentsByScope(actor, items);
    return {
      exam,
      total: scopedItems.length,
      items: scopedItems
    };
  }
}
