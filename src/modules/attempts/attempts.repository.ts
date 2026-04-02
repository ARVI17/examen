import { AttemptStatus, QuestionArea } from "@prisma/client";
import prisma from "../../common/prisma";

export class AttemptsRepository {
  static findExamById(pruebaId: string) {
    return prisma.exam.findUnique({
      where: { id: pruebaId },
      include: {
        examQuestions: {
          orderBy: { orden: "asc" },
          include: {
            question: {
              include: {
                options: {
                  where: {
                    isArchived: false
                  },
                  orderBy: {
                    orden: "asc"
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  static createAttempt(data: {
    estudianteId: string;
    pruebaId: string;
    estado: AttemptStatus;
  }) {
    return prisma.examAttempt.create({
      data: {
        estudianteId: data.estudianteId,
        pruebaId: data.pruebaId,
        estado: data.estado,
        fechaInicio: new Date()
      },
      include: {
        estudiante: true,
        prueba: true
      }
    });
  }

  static findAttemptById(id: string) {
    return prisma.examAttempt.findUnique({
      where: { id },
      include: {
        estudiante: true,
        prueba: true,
        studentAnswers: {
          include: {
            pregunta: true,
            opcionSeleccionada: true
          }
        },
        areaResults: true
      }
    });
  }

  static findAttemptForAnswer(id: string) {
    return prisma.examAttempt.findUnique({
      where: { id },
      include: {
        prueba: true
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

  static findOptionById(optionId: string) {
    return prisma.questionOption.findUnique({
      where: { id: optionId }
    });
  }

  static upsertAnswer(data: {
    intentoId: string;
    preguntaId: string;
    opcionIdSeleccionada: string;
    esCorrecta: boolean;
    puntajeObtenido: number;
    tiempoRespuestaSegundos?: number;
  }) {
    return prisma.studentAnswer.upsert({
      where: {
        intentoId_preguntaId: {
          intentoId: data.intentoId,
          preguntaId: data.preguntaId
        }
      },
      update: {
        opcionIdSeleccionada: data.opcionIdSeleccionada,
        esCorrecta: data.esCorrecta,
        puntajeObtenido: data.puntajeObtenido,
        tiempoRespuestaSegundos: data.tiempoRespuestaSegundos
      },
      create: {
        intentoId: data.intentoId,
        preguntaId: data.preguntaId,
        opcionIdSeleccionada: data.opcionIdSeleccionada,
        esCorrecta: data.esCorrecta,
        puntajeObtenido: data.puntajeObtenido,
        tiempoRespuestaSegundos: data.tiempoRespuestaSegundos
      },
      include: {
        pregunta: true,
        opcionSeleccionada: true
      }
    });
  }

  static findAttemptForSubmit(id: string) {
    return prisma.examAttempt.findUnique({
      where: { id },
      include: {
        estudiante: true,
        prueba: {
          include: {
            examQuestions: {
              include: {
                question: true
              },
              orderBy: { orden: "asc" }
            }
          }
        },
        studentAnswers: {
          include: {
            opcionSeleccionada: true,
            pregunta: true
          }
        }
      }
    });
  }

  static listByStudentId(studentId: string) {
    return prisma.examAttempt.findMany({
      where: { estudianteId: studentId },
      include: {
        prueba: true,
        areaResults: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  static listByExamId(examId: string) {
    return prisma.examAttempt.findMany({
      where: { pruebaId: examId },
      include: {
        estudiante: true,
        areaResults: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  static findPerformanceLevels() {
    return prisma.performanceLevel.findMany({
      where: { isActive: true },
      orderBy: { minimo: "asc" }
    });
  }

  static async saveAttemptResult(
    attemptId: string,
    payload: {
      estado: AttemptStatus;
      fechaFin: Date;
      tiempoEmpleadoSegundos: number;
      puntajeTotalObtenido: number;
      porcentajeTotal: number;
      nivelDesempenoGlobal: string;
      areaResults: {
        area: QuestionArea;
        totalPreguntasArea: number;
        correctas: number;
        incorrectas: number;
        puntajeArea: number;
        porcentajeArea: number;
        nivelDesempenoArea: string;
      }[];
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const updatedAttempt = await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          estado: payload.estado,
          fechaFin: payload.fechaFin,
          tiempoEmpleadoSegundos: payload.tiempoEmpleadoSegundos,
          puntajeTotalObtenido: payload.puntajeTotalObtenido,
          porcentajeTotal: payload.porcentajeTotal,
          nivelDesempenoGlobal: payload.nivelDesempenoGlobal
        },
        include: {
          estudiante: true,
          prueba: true
        }
      });

      await tx.areaResult.deleteMany({ where: { intentoId: attemptId } });

      if (payload.areaResults.length > 0) {
        await tx.areaResult.createMany({
          data: payload.areaResults.map((result) => ({
            intentoId: attemptId,
            area: result.area,
            totalPreguntasArea: result.totalPreguntasArea,
            correctas: result.correctas,
            incorrectas: result.incorrectas,
            puntajeArea: result.puntajeArea,
            porcentajeArea: result.porcentajeArea,
            nivelDesempenoArea: result.nivelDesempenoArea
          }))
        });
      }

      return updatedAttempt;
    });
  }
}

