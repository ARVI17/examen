import { ExamStatus, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import prisma from "../../common/prisma";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { QuestionsRepository } from "../questions/questions.repository";
import { ExamsRepository } from "./exams.repository";
import { ExamCreateInput, ExamQuestionAssignment, ExamUpdateInput } from "./exams.types";
import { normalizeExamType, normalizeGradoObjetivo } from "./exams.utils";

export class ExamService {
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

  static async getById(id: string) {
    const exam = await ExamsRepository.findByIdWithRelations(id);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    return exam;
  }

  static async list(query: Record<string, unknown>) {
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

    const where = {
      estado: typedQuery.estado,
      tipoPrueba: normalizedTipoPrueba,
      gradoObjetivo: normalizedGradoObjetivo,
      isDeleted: false
    };

    const [total, exams] = await ExamsRepository.list(where, pagination.skip, pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: exams
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

  static async listQuestions(examId: string) {
    const exam = await ExamsRepository.findById(examId);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const questions = await ExamsRepository.listExamQuestions(examId);

    return {
      exam,
      totalQuestions: questions.length,
      items: questions
    };
  }
}
