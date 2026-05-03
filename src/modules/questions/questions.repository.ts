import { Prisma, QuestionGenerationStatus } from "@prisma/client";
import prisma from "../../common/prisma";
import { QuestionCreateInput, QuestionUpdateInput } from "./questions.types";

export class QuestionsRepository {
  static findById(id: string) {
    return prisma.question.findUnique({
      where: { id },
      include: { options: { where: { isArchived: false }, orderBy: { orden: "asc" } } }
    });
  }

  static findByCode(codigoInterno: string) {
    return prisma.question.findUnique({ where: { codigoInterno } });
  }

  static create(data: QuestionCreateInput) {
    return prisma.question.create({
      data: {
        codigoInterno: data.codigoInterno,
        area: data.area,
        competencia: data.competencia,
        componente: data.componente,
        nivelDificultad: data.nivelDificultad,
        nivelCognitivo: data.nivelCognitivo,
        enunciado: data.enunciado,
        contextoTextoBase: data.contextoTextoBase,
        tipoPregunta: data.tipoPregunta,
        gradoObjetivo: data.gradoObjetivo,
        estado: data.estado,
        explicacionRespuesta: data.explicacionRespuesta,
        observacionesDocente: data.observacionesDocente,
        options: {
          create: data.options.map((option, index) => ({
            textoOpcion: option.texto_opcion,
            esCorrecta: option.es_correcta,
            isArchived: false,
            orden: option.orden ?? index + 1
          }))
        }
      },
      include: { options: { where: { isArchived: false }, orderBy: { orden: "asc" } } }
    });
  }

  static list(where: Prisma.QuestionWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { options: { where: { isArchived: false }, orderBy: { orden: "asc" } } }
      })
    ]);
  }

  static update(id: string, data: QuestionUpdateInput) {
    return prisma.question.update({
      where: { id },
      data: {
        area: data.area,
        competencia: data.competencia,
        componente: data.componente,
        nivelDificultad: data.nivelDificultad,
        nivelCognitivo: data.nivelCognitivo,
        enunciado: data.enunciado,
        contextoTextoBase: data.contextoTextoBase,
        tipoPregunta: data.tipoPregunta,
        gradoObjetivo: data.gradoObjetivo,
        estado: data.estado,
        explicacionRespuesta: data.explicacionRespuesta,
        observacionesDocente: data.observacionesDocente
      },
      include: { options: { where: { isArchived: false }, orderBy: { orden: "asc" } } }
    });
  }

  static async updateWithOptionalOptions(id: string, data: QuestionUpdateInput) {
    return prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          area: data.area,
          competencia: data.competencia,
          componente: data.componente,
          nivelDificultad: data.nivelDificultad,
          nivelCognitivo: data.nivelCognitivo,
          enunciado: data.enunciado,
          contextoTextoBase: data.contextoTextoBase,
          tipoPregunta: data.tipoPregunta,
          gradoObjetivo: data.gradoObjetivo,
          estado: data.estado,
          explicacionRespuesta: data.explicacionRespuesta,
          observacionesDocente: data.observacionesDocente
        }
      });

      if (data.options?.length) {
        await tx.questionOption.updateMany({
          where: {
            preguntaId: id,
            isArchived: false
          },
          data: {
            isArchived: true
          }
        });

        await tx.questionOption.createMany({
          data: data.options.map((option, index) => ({
            preguntaId: id,
            textoOpcion: option.texto_opcion,
            esCorrecta: option.es_correcta,
            isArchived: false,
            orden: option.orden ?? index + 1
          }))
        });
      }

      return tx.question.findUnique({
        where: { id },
        include: {
          options: {
            where: { isArchived: false },
            orderBy: { orden: "asc" }
          }
        }
      });
    });
  }

  static replaceOptions(questionId: string, options: QuestionCreateInput["options"]) {
    return prisma.$transaction(async (tx) => {
      await tx.questionOption.updateMany({
        where: {
          preguntaId: questionId,
          isArchived: false
        },
        data: {
          isArchived: true
        }
      });

      await tx.questionOption.createMany({
        data: options.map((option, index) => ({
          preguntaId: questionId,
          textoOpcion: option.texto_opcion,
          esCorrecta: option.es_correcta,
          isArchived: false,
          orden: option.orden ?? index + 1
        }))
      });

      return tx.questionOption.findMany({
        where: {
          preguntaId: questionId,
          isArchived: false
        },
        orderBy: {
          orden: "asc"
        }
      });
    });
  }

  static softDelete(id: string) {
    return prisma.question.update({
      where: { id },
      data: { estado: false }
    });
  }

  static listGeneratedQuestions(
    where: Prisma.QuestionWhereInput,
    skip: number,
    take: number
  ) {
    return Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        skip,
        take,
        include: {
          options: { where: { isArchived: false }, orderBy: { orden: "asc" } },
          generation: true,
          source: true
        },
        orderBy: { createdAt: "desc" }
      })
    ]);
  }

  static findGenerationById(generationId: string) {
    return prisma.questionGeneration.findUnique({
      where: { id: generationId }
    });
  }

  static updateGenerationStatus(generationId: string, status: QuestionGenerationStatus) {
    return prisma.questionGeneration.update({
      where: { id: generationId },
      data: { status }
    });
  }
}
