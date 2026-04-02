import { AttemptStatus, PerformanceLevel } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { StudentService } from "../students/students.service";
import { AttemptsRepository } from "./attempts.repository";
import { AnswerAttemptInput, AreaStats, StartAttemptInput } from "./attempts.types";

export class AttemptService {
  static async start(payload: StartAttemptInput, actorId?: string) {
    const exam = await AttemptsRepository.findExamById(payload.pruebaId);

    if (!exam || exam.isDeleted || exam.estado === "INACTIVO") {
      throw new AppError("Prueba no disponible", 404, "EXAM_NOT_FOUND");
    }

    const studentResult = await StudentService.createOrFind(payload.estudiante, actorId);

    const attempt = await AttemptsRepository.createAttempt({
      estudianteId: studentResult.student.id,
      pruebaId: payload.pruebaId,
      estado: AttemptStatus.INICIADA
    });

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: attempt.id,
      accion: "START",
      userId: actorId,
      datos: {
        estudianteId: attempt.estudianteId,
        reusedStudent: studentResult.reused,
        pruebaId: attempt.pruebaId
      }
    });

    return {
      attempt,
      reusedStudent: studentResult.reused,
      student: studentResult.student
    };
  }

  static async answer(attemptId: string, payload: AnswerAttemptInput, actorId?: string) {
    const attempt = await AttemptsRepository.findAttemptForAnswer(attemptId);

    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    if (attempt.estado !== AttemptStatus.INICIADA && attempt.estado !== AttemptStatus.PENDIENTE) {
      throw new AppError("El intento no permite registrar respuestas", 400, "ATTEMPT_CLOSED");
    }

    const examQuestion = await AttemptsRepository.findExamQuestion(attempt.pruebaId, payload.preguntaId);
    if (!examQuestion) {
      throw new AppError("La pregunta no pertenece a la prueba", 400, "INVALID_QUESTION");
    }

    const selectedOption = await AttemptsRepository.findOptionById(payload.opcionIdSeleccionada);
    if (!selectedOption) {
      throw new AppError("Opcion no encontrada", 404, "OPTION_NOT_FOUND");
    }

    if (selectedOption.isArchived) {
      throw new AppError("La opcion seleccionada no esta vigente", 400, "OPTION_NOT_ACTIVE");
    }

    if (selectedOption.preguntaId !== payload.preguntaId) {
      throw new AppError("La opcion no pertenece a la pregunta", 400, "INVALID_OPTION_FOR_QUESTION");
    }

    const answer = await AttemptsRepository.upsertAnswer({
      intentoId: attemptId,
      preguntaId: payload.preguntaId,
      opcionIdSeleccionada: payload.opcionIdSeleccionada,
      esCorrecta: selectedOption.esCorrecta,
      puntajeObtenido: selectedOption.esCorrecta ? examQuestion.puntajePregunta : 0,
      tiempoRespuestaSegundos: payload.tiempoRespuestaSegundos
    });

    await createAuditLog({
      entidad: "student_answers",
      entidadId: answer.id,
      accion: "UPSERT",
      userId: actorId,
      datos: {
        intentoId: attemptId,
        preguntaId: payload.preguntaId,
        esCorrecta: answer.esCorrecta
      }
    });

    return answer;
  }

  static async submit(attemptId: string, actorId?: string) {
    const attempt = await AttemptsRepository.findAttemptForSubmit(attemptId);

    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    if (attempt.estado === AttemptStatus.CALIFICADA) {
      throw new AppError("El intento ya fue calificado", 400, "ATTEMPT_ALREADY_GRADED");
    }

    if (attempt.estado === AttemptStatus.ANULADA) {
      throw new AppError("El intento fue anulado", 400, "ATTEMPT_CANCELLED");
    }

    const answerByQuestionId = new Map(attempt.studentAnswers.map((answer) => [answer.preguntaId, answer]));

    let totalCorrectas = 0;
    let totalPuntaje = 0;

    const perArea = new Map<string, AreaStats>();

    for (const examQuestion of attempt.prueba.examQuestions) {
      const areaKey = examQuestion.area;
      const existingArea = perArea.get(areaKey);

      if (!existingArea) {
        perArea.set(areaKey, {
          area: areaKey,
          totalPreguntasArea: 0,
          correctas: 0,
          incorrectas: 0,
          puntajeArea: 0,
          porcentajeArea: 0,
          nivelDesempenoArea: ""
        });
      }

      const currentArea = perArea.get(areaKey)!;
      currentArea.totalPreguntasArea += 1;

      const answer = answerByQuestionId.get(examQuestion.questionId);

      if (answer?.esCorrecta) {
        totalCorrectas += 1;
        totalPuntaje += answer.puntajeObtenido;
        currentArea.correctas += 1;
        currentArea.puntajeArea += answer.puntajeObtenido;
      } else {
        currentArea.incorrectas += 1;
      }
    }

    const totalPreguntas = attempt.prueba.examQuestions.length;
    const porcentajeTotal = totalPreguntas > 0 ? Number(((totalCorrectas / totalPreguntas) * 100).toFixed(2)) : 0;

    const performanceLevels = await AttemptsRepository.findPerformanceLevels();
    const nivelGlobal = this.resolvePerformanceLevel(performanceLevels, porcentajeTotal);

    const areaResults = Array.from(perArea.values()).map((item) => {
      const porcentajeArea =
        item.totalPreguntasArea > 0
          ? Number(((item.correctas / item.totalPreguntasArea) * 100).toFixed(2))
          : 0;

      return {
        area: item.area,
        totalPreguntasArea: item.totalPreguntasArea,
        correctas: item.correctas,
        incorrectas: item.incorrectas,
        puntajeArea: Number(item.puntajeArea.toFixed(2)),
        porcentajeArea,
        nivelDesempenoArea: this.resolvePerformanceLevel(performanceLevels, porcentajeArea)
      };
    });

    const fechaFin = new Date();
    const tiempoEmpleadoSegundos = Math.max(
      0,
      Math.floor((fechaFin.getTime() - attempt.fechaInicio.getTime()) / 1000)
    );

    await AttemptsRepository.saveAttemptResult(attempt.id, {
      estado: AttemptStatus.CALIFICADA,
      fechaFin,
      tiempoEmpleadoSegundos,
      puntajeTotalObtenido: Number(totalPuntaje.toFixed(2)),
      porcentajeTotal,
      nivelDesempenoGlobal: nivelGlobal,
      areaResults
    });

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: attempt.id,
      accion: "SUBMIT_AND_GRADE",
      userId: actorId,
      datos: {
        porcentajeTotal,
        puntajeTotal: Number(totalPuntaje.toFixed(2)),
        totalPreguntas,
        correctas: totalCorrectas
      }
    });

    return {
      attemptId: attempt.id,
      estudianteId: attempt.estudianteId,
      pruebaId: attempt.pruebaId,
      totalPreguntas,
      correctas: totalCorrectas,
      incorrectas: totalPreguntas - totalCorrectas,
      puntajeTotalObtenido: Number(totalPuntaje.toFixed(2)),
      porcentajeTotal,
      nivelDesempenoGlobal: nivelGlobal,
      areaResults
    };
  }

  static async getById(id: string) {
    const attempt = await AttemptsRepository.findAttemptById(id);

    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    return attempt;
  }

  static async getByStudentDocument(numeroIdentificacion: string) {
    const student = await StudentService.getByDocument(numeroIdentificacion);
    const attempts = await AttemptsRepository.listByStudentId(student.id);

    return {
      student,
      totalAttempts: attempts.length,
      items: attempts
    };
  }

  static async getByExam(examId: string) {
    const exam = await AttemptsRepository.findExamById(examId);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const attempts = await AttemptsRepository.listByExamId(examId);

    return {
      exam: {
        id: exam.id,
        nombre: exam.nombre,
        tipoPrueba: exam.tipoPrueba
      },
      totalAttempts: attempts.length,
      items: attempts
    };
  }

  private static resolvePerformanceLevel(levels: PerformanceLevel[], percentage: number) {
    const match = levels.find((level) => percentage >= level.minimo && percentage <= level.maximo);
    return match?.nombre ?? "Sin nivel";
  }
}
