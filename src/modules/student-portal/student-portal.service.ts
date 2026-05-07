import { AttemptStatus } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { AttemptService } from "../attempts/attempts.service";
import { AttemptsRepository } from "../attempts/attempts.repository";
import { AnswerAttemptInput } from "../attempts/attempts.types";
import { ExamService } from "../exams/exams.service";
import { StudentAuthService } from "../student-auth/student-auth.service";

type StudentSession = NonNullable<Express.Request["studentSession"]>;
type AttemptResultShape = {
  id: string;
  estudianteId: string;
  estado: AttemptStatus;
  fechaInicio: Date;
  fechaFin: Date | null;
  tiempoEmpleadoSegundos: number | null;
  puntajeTotalObtenido: number;
  porcentajeTotal: number;
  nivelDesempenoGlobal: string | null;
  prueba: {
    id: string;
    nombre: string;
    tipoPrueba: string;
    gradoObjetivo: string;
    totalPreguntas: number;
  };
  areaResults: Array<{
    id: string;
    area: string;
    porcentajeArea: number;
    correctas: number;
    incorrectas: number;
    totalPreguntasArea: number;
    nivelDesempenoArea: string;
  }>;
};

export class StudentPortalService {
  private static resolvePerformanceLevel(percentage: number) {
    if (percentage >= 90) {
      return "Superior";
    }
    if (percentage >= 80) {
      return "Alto";
    }
    if (percentage >= 60) {
      return "Basico";
    }
    return "Bajo";
  }

  private static buildRecommendations(areaResults: AttemptResultShape["areaResults"]) {
    if (!areaResults.length) {
      return ["Completa simulacros calificados para recibir recomendaciones por materia."];
    }

    const sorted = [...areaResults].sort((left, right) => right.porcentajeArea - left.porcentajeArea);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    const messages: string[] = [];

    if (strongest) {
      messages.push(`${strongest.area}: buen desempeno. Mantener practica sostenida.`);
    }
    if (weakest && weakest.id !== strongest?.id) {
      messages.push(`${weakest.area}: requiere refuerzo. Prioriza ejercicios de aplicacion y analisis.`);
    }
    if (weakest && weakest.porcentajeArea < 60) {
      messages.push(`Seguimiento recomendado en ${weakest.area} para elevar aciertos sobre 60%.`);
    }
    return messages.slice(0, 3);
  }

  private static toResultItem(attempt: AttemptResultShape) {
    const totalPreguntas = Math.max(0, attempt.prueba.totalPreguntas);
    const correctas = attempt.areaResults.reduce((acc, item) => acc + item.correctas, 0);
    const incorrectas = attempt.areaResults.reduce((acc, item) => acc + item.incorrectas, 0);
    const sinResponder = Math.max(0, totalPreguntas - correctas - incorrectas);
    const strongest = [...attempt.areaResults].sort((a, b) => b.porcentajeArea - a.porcentajeArea)[0] ?? null;
    const weakest =
      [...attempt.areaResults].sort((a, b) => a.porcentajeArea - b.porcentajeArea)[0] ?? null;
    const nivel = attempt.nivelDesempenoGlobal || this.resolvePerformanceLevel(attempt.porcentajeTotal);

    return {
      attemptId: attempt.id,
      exam: {
        id: attempt.prueba.id,
        nombre: attempt.prueba.nombre,
        tipoPrueba: attempt.prueba.tipoPrueba,
        gradoObjetivo: attempt.prueba.gradoObjetivo
      },
      estado: attempt.estado,
      fechaInicio: attempt.fechaInicio,
      fechaFin: attempt.fechaFin,
      tiempoEmpleadoSegundos: attempt.tiempoEmpleadoSegundos,
      puntajeTotal: attempt.puntajeTotalObtenido,
      porcentajeTotal: attempt.porcentajeTotal,
      nivelDesempeno: nivel,
      correctas,
      incorrectas,
      sinResponder,
      strongestArea: strongest
        ? { area: strongest.area, porcentaje: strongest.porcentajeArea }
        : null,
      weakestArea: weakest
        ? { area: weakest.area, porcentaje: weakest.porcentajeArea }
        : null,
      areaResults: attempt.areaResults.map((item) => ({
        area: item.area,
        porcentaje: item.porcentajeArea,
        correctas: item.correctas,
        incorrectas: item.incorrectas,
        total: item.totalPreguntasArea,
        nivel: item.nivelDesempenoArea
      })),
      recomendaciones: this.buildRecommendations(attempt.areaResults)
    };
  }

  private static ensureAttemptOwnership(
    session: StudentSession,
    attempt: AttemptResultShape | null
  ): asserts attempt is AttemptResultShape {
    if (!attempt || attempt.estudianteId !== session.studentId) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }
  }

  static async home(session: StudentSession) {
    const [student, attempts, exams] = await Promise.all([
      StudentAuthService.me(session.studentId),
      AttemptsRepository.listByStudentId(session.studentId),
      this.listExams(session)
    ]);

    const latestAttempt = attempts[0] ?? null;
    const activeAttempt =
      attempts.find((item) => item.estado === AttemptStatus.INICIADA || item.estado === AttemptStatus.PENDIENTE) ?? null;
    const gradedAttempts = attempts.filter((item) => item.estado === AttemptStatus.CALIFICADA);
    const averagePercentage =
      gradedAttempts.length > 0
        ? Number(
            (
              gradedAttempts.reduce((acc, item) => acc + (item.porcentajeTotal ?? 0), 0) / gradedAttempts.length
            ).toFixed(2)
          )
        : 0;

    return {
      student,
      activeAttempt,
      latestAttempt,
      availableExams: exams.items,
      stats: {
        totalAttempts: attempts.length,
        gradedAttempts: gradedAttempts.length,
        averagePercentage
      }
    };
  }

  static async listExams(session: StudentSession) {
    return ExamService.listPublic({
      studentId: session.studentId,
      numeroIdentificacion: session.numeroIdentificacion,
      gradoObjetivo: session.grado,
      limit: 200
    });
  }

  static async startAttempt(session: StudentSession, payload: { pruebaId: string; strictMode?: boolean }) {
    const data = await AttemptService.start({
      pruebaId: payload.pruebaId,
      strictMode: payload.strictMode,
      estudianteRegistrado: {
        tipoIdentificacion: session.tipoIdentificacion,
        numeroIdentificacion: session.numeroIdentificacion
      }
    });

    if (data.attempt?.estudianteId !== session.studentId) {
      throw new AppError("No autorizado para iniciar intentos de otro estudiante", 403, "FORBIDDEN");
    }

    return data;
  }

  static async getAttempt(session: StudentSession, attemptId: string) {
    const data = await AttemptService.getPublicById(attemptId);
    this.ensureAttemptOwnership(session, data.attempt);
    return data;
  }

  static async answerAttempt(session: StudentSession, attemptId: string, payload: AnswerAttemptInput) {
    await this.getAttempt(session, attemptId);
    return AttemptService.answer(attemptId, payload);
  }

  static async submitAttempt(session: StudentSession, attemptId: string) {
    await this.getAttempt(session, attemptId);
    return AttemptService.submit(attemptId);
  }

  static async completeSessionOne(session: StudentSession, attemptId: string) {
    await this.getAttempt(session, attemptId);
    return AttemptService.completeSessionOne(attemptId, session.studentId);
  }

  static async listResults(session: StudentSession) {
    const attempts = await AttemptsRepository.listByStudentId(session.studentId);
    const graded = attempts.filter((item) => item.estado === AttemptStatus.CALIFICADA);
    const items = graded.map((attempt) => this.toResultItem(attempt));
    const averagePercentage =
      items.length > 0
        ? Number((items.reduce((acc, item) => acc + item.porcentajeTotal, 0) / items.length).toFixed(2))
        : 0;

    return {
      total: items.length,
      averagePercentage,
      items
    };
  }

  static async getResultByAttempt(session: StudentSession, attemptId: string) {
    const attempt = await AttemptsRepository.findAttemptById(attemptId);
    this.ensureAttemptOwnership(session, attempt);
    if (attempt.estado !== AttemptStatus.CALIFICADA) {
      throw new AppError("El intento aun no esta calificado", 409, "ATTEMPT_NOT_GRADED");
    }
    return this.toResultItem(attempt);
  }
}
