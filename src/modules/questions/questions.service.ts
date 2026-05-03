import { Prisma, QuestionGenerationStatus } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { QuestionsRepository } from "./questions.repository";
import { QuestionCreateInput, QuestionUpdateInput } from "./questions.types";

export class QuestionService {
  static async create(payload: QuestionCreateInput, actorId?: string) {
    const exists = await QuestionsRepository.findByCode(payload.codigoInterno);
    if (exists) {
      throw new AppError("codigo_interno ya existe", 409, "QUESTION_CODE_EXISTS");
    }

    const question = await QuestionsRepository.create(payload);

    await createAuditLog({
      entidad: "question_bank",
      entidadId: question.id,
      accion: "CREATE",
      userId: actorId,
      datos: {
        codigoInterno: question.codigoInterno,
        area: question.area
      }
    });

    return question;
  }

  static async list(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      area?: string;
      competencia?: string;
      nivelDificultad?: string;
      gradoObjetivo?: string;
      estado?: boolean;
    };

    const where: Prisma.QuestionWhereInput = {
      area: typedQuery.area as any,
      competencia: typedQuery.competencia
        ? {
            contains: typedQuery.competencia,
            mode: "insensitive"
          }
        : undefined,
      nivelDificultad: typedQuery.nivelDificultad as any,
      gradoObjetivo: typedQuery.gradoObjetivo,
      estado: typedQuery.estado
    };

    const [total, questions] = await QuestionsRepository.list(where, pagination.skip, pagination.limit);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: questions
    };
  }

  static async getById(id: string) {
    const question = await QuestionsRepository.findById(id);
    if (!question) {
      throw new AppError("Pregunta no encontrada", 404, "NOT_FOUND");
    }

    return question;
  }

  static async update(id: string, payload: QuestionUpdateInput, actorId?: string) {
    const existing = await QuestionsRepository.findById(id);
    if (!existing) {
      throw new AppError("Pregunta no encontrada", 404, "NOT_FOUND");
    }

    const withOptions = await QuestionsRepository.updateWithOptionalOptions(id, payload);

    if (!withOptions) {
      throw new AppError("Pregunta no encontrada", 404, "NOT_FOUND");
    }

    await createAuditLog({
      entidad: "question_bank",
      entidadId: id,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        previous: {
          area: existing.area,
          nivelDificultad: existing.nivelDificultad,
          estado: existing.estado
        },
        current: {
          area: withOptions.area,
          nivelDificultad: withOptions.nivelDificultad,
          estado: withOptions.estado
        }
      }
    });

    return withOptions;
  }

  static async softDelete(id: string, actorId?: string) {
    const existing = await QuestionsRepository.findById(id);
    if (!existing) {
      throw new AppError("Pregunta no encontrada", 404, "NOT_FOUND");
    }

    await QuestionsRepository.softDelete(id);

    await createAuditLog({
      entidad: "question_bank",
      entidadId: id,
      accion: "SOFT_DELETE",
      userId: actorId,
      datos: {
        codigoInterno: existing.codigoInterno
      }
    });
  }

  static async listGenerated(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typedQuery = query as {
      status?: QuestionGenerationStatus;
    };

    const where: Prisma.QuestionWhereInput = {
      isAiGenerated: true,
      generation: typedQuery.status
        ? {
            status: typedQuery.status
          }
        : undefined
    };

    const [total, questions] = await QuestionsRepository.listGeneratedQuestions(where, pagination.skip, pagination.limit);
    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: questions
    };
  }

  static async updateGeneratedStatus(questionId: string, status: QuestionGenerationStatus, actorId?: string) {
    const question = await QuestionsRepository.findById(questionId);
    if (!question) {
      throw new AppError("Pregunta no encontrada", 404, "NOT_FOUND");
    }

    if (!question.isAiGenerated || !question.generationId) {
      throw new AppError("La pregunta no pertenece a una generacion IA", 400, "QUESTION_NOT_AI_GENERATED");
    }

    const generation = await QuestionsRepository.findGenerationById(question.generationId);
    if (!generation) {
      throw new AppError("Registro de generacion IA no encontrado", 404, "GENERATION_NOT_FOUND");
    }

    const updated = await QuestionsRepository.updateGenerationStatus(question.generationId, status);

    await createAuditLog({
      entidad: "question_generations",
      entidadId: updated.id,
      accion: "UPDATE_STATUS",
      userId: actorId,
      datos: {
        questionId: question.id,
        before: generation.status,
        after: updated.status
      }
    });

    return {
      questionId: question.id,
      generation: updated
    };
  }
}

