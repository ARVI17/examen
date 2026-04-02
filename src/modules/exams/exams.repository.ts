import { Prisma, QuestionArea } from "@prisma/client";
import prisma from "../../common/prisma";
import { ExamCreateInput, ExamUpdateInput } from "./exams.types";

export class ExamsRepository {
  static create(data: ExamCreateInput) {
    return prisma.exam.create({ data });
  }

  static findById(id: string) {
    return prisma.exam.findUnique({ where: { id } });
  }

  static findByIdWithRelations(id: string) {
    return prisma.exam.findUnique({
      where: { id },
      include: {
        examQuestions: {
          orderBy: { orden: "asc" },
          include: {
            question: {
              include: { options: { where: { isArchived: false }, orderBy: { orden: "asc" } } }
            }
          }
        },
        examAttempts: {
          include: {
            estudiante: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
  }

  static list(where: Prisma.ExamWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.exam.count({ where }),
      prisma.exam.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
    ]);
  }

  static update(id: string, data: ExamUpdateInput) {
    return prisma.exam.update({
      where: { id },
      data
    });
  }

  static findByNaturalKey(payload: { nombre: string; tipoPrueba: string; gradoObjetivo: string; excludeId?: string }) {
    return prisma.exam.findFirst({
      where: {
        id: payload.excludeId ? { not: payload.excludeId } : undefined,
        nombre: payload.nombre,
        tipoPrueba: payload.tipoPrueba,
        gradoObjetivo: payload.gradoObjetivo,
        isDeleted: false
      }
    });
  }

  static findExamQuestion(examId: string, questionId: string) {
    return prisma.examQuestion.findUnique({
      where: {
        examId_questionId: {
          examId,
          questionId
        }
      }
    });
  }

  static findExamQuestionByOrder(examId: string, orden: number) {
    return prisma.examQuestion.findUnique({
      where: {
        examId_orden: {
          examId,
          orden
        }
      }
    });
  }

  static createExamQuestion(data: {
    examId: string;
    questionId: string;
    orden: number;
    puntajePregunta: number;
    area: QuestionArea;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.examQuestion.create({ data });
  }

  static countExamQuestions(examId: string) {
    return prisma.examQuestion.count({ where: { examId } });
  }

  static listExamQuestions(examId: string) {
    return prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { orden: "asc" },
      include: {
        question: {
          include: {
            options: {
              where: {
                isArchived: false
              },
              orderBy: { orden: "asc" }
            }
          }
        }
      }
    });
  }
}

