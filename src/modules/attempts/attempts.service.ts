import { AttemptStatus, PerformanceLevel, QuestionArea } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { StudentService } from "../students/students.service";
import { AttemptsRepository } from "./attempts.repository";
import {
  AnswerAttemptInput,
  AreaStats,
  AttemptPresentation,
  AttemptSessionPlan,
  StartAttemptInput,
  StopAttemptInput
} from "./attempts.types";

type ExamWithRelations = NonNullable<Awaited<ReturnType<typeof AttemptsRepository.findExamById>>>;

export class AttemptService {
  private static parsePresentation(value: unknown): AttemptPresentation | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const parsed = value as Partial<AttemptPresentation>;
    if (!parsed.sessionPlan || !parsed.sessionControl || !parsed.optionOrderByQuestion) {
      return null;
    }

    return parsed as AttemptPresentation;
  }

  private static shuffle<T>(items: T[]) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  private static buildSessionPlan(
    totalQuestions: number,
    totalMinutes: number,
    strictMode: boolean
  ): AttemptSessionPlan {
    const safeQuestions = Math.max(totalQuestions, 1);
    const safeMinutes = Math.max(totalMinutes, 1);

    if (!strictMode || safeQuestions < 2) {
      return {
        mode: "SIMPLE",
        totalQuestions: safeQuestions,
        totalMinutes: safeMinutes,
        sessions: [
          {
            id: "S1",
            label: "Sesion unica",
            questionStart: 1,
            questionEnd: safeQuestions,
            questionCount: safeQuestions,
            durationMinutes: safeMinutes,
            suggestedStart: null,
            suggestedEnd: null,
            description: "Presentacion en una sola sesion."
          }
        ]
      };
    }

    const firstCount = Math.ceil(safeQuestions / 2);
    const secondCount = safeQuestions - firstCount;
    const firstMinutes = Math.max(1, Math.round(safeMinutes * 0.5));
    const secondMinutes = Math.max(1, safeMinutes - firstMinutes);

    return {
      mode: "SABER11_DOS_JORNADAS",
      totalQuestions: safeQuestions,
      totalMinutes: safeMinutes,
      sessions: [
        {
          id: "J1",
          label: "Jornada 1",
          questionStart: 1,
          questionEnd: firstCount,
          questionCount: firstCount,
          durationMinutes: firstMinutes,
          suggestedStart: null,
          suggestedEnd: null,
          description: "Primera jornada de la prueba."
        },
        {
          id: "J2",
          label: "Jornada 2",
          questionStart: firstCount + 1,
          questionEnd: safeQuestions,
          questionCount: secondCount,
          durationMinutes: secondMinutes,
          suggestedStart: null,
          suggestedEnd: null,
          description: "Segunda jornada habilitable por administrador."
        }
      ]
    };
  }

  private static buildInitialPresentation(exam: ExamWithRelations, strictMode?: boolean): AttemptPresentation {
    const questionOrder = this.shuffle(exam.examQuestions).map((item) => item.questionId);
    const optionOrderByQuestion: Record<string, string[]> = {};

    for (const examQuestion of exam.examQuestions) {
      optionOrderByQuestion[examQuestion.questionId] = this.shuffle(
        examQuestion.question.options.map((option) => option.id)
      );
    }

    const resolvedStrict =
      strictMode ??
      (exam.tipoPrueba.toUpperCase() === "SABER_11" || exam.tipoPrueba.toUpperCase().includes("SABER 11"));

    const sessionPlan = this.buildSessionPlan(questionOrder.length, exam.tiempoLimiteMinutos, resolvedStrict);

    return {
      questionOrder,
      optionOrderByQuestion,
      sessionPlan,
      sessionControl: {
        strictMode: sessionPlan.mode === "SABER11_DOS_JORNADAS",
        currentSessionIndex: 0,
        session1CompletedAt: null,
        session2Enabled: sessionPlan.mode !== "SABER11_DOS_JORNADAS",
        session2EnabledAt: null,
        session2EnabledBy: null,
        stoppedAt: null,
        stopReason: null,
        restartedFromAttemptId: null
      }
    };
  }

  private static findMatchingAssignment(
    exam: ExamWithRelations,
    student: {
      id: string;
      schoolId: string | null;
      groupId: string | null;
    }
  ) {
    const now = new Date();
    const activeAssignments = exam.assignments.filter((assignment) => {
      if (!assignment.isActive) {
        return false;
      }
      if (assignment.startsAt && assignment.startsAt.getTime() > now.getTime()) {
        return false;
      }
      if (assignment.endsAt && assignment.endsAt.getTime() < now.getTime()) {
        return false;
      }
      return true;
    });

    if (activeAssignments.length === 0) {
      return null;
    }

    for (const assignment of activeAssignments) {
      if (assignment.scope === "GLOBAL") {
        return assignment;
      }
      if (assignment.scope === "SCHOOL" && assignment.schoolId && assignment.schoolId === student.schoolId) {
        return assignment;
      }
      if (assignment.scope === "GROUP" && assignment.groupId && assignment.groupId === student.groupId) {
        return assignment;
      }
      if (assignment.scope === "STUDENT" && assignment.studentId && assignment.studentId === student.id) {
        return assignment;
      }
    }

    return "NO_MATCH" as const;
  }

  private static buildQuestionDeck(
    exam: ExamWithRelations,
    presentation: AttemptPresentation,
    selectedByQuestionId: Map<string, string>
  ) {
    const byQuestionId = new Map(exam.examQuestions.map((item) => [item.questionId, item] as const));
    const questionOrder = presentation.questionOrder?.length
      ? presentation.questionOrder
      : exam.examQuestions.map((item) => item.questionId);

    return questionOrder
      .map((questionId, index) => {
        const examQuestion = byQuestionId.get(questionId);
        if (!examQuestion) {
          return null;
        }

        const optionOrder = presentation.optionOrderByQuestion?.[questionId]?.length
          ? presentation.optionOrderByQuestion[questionId]
          : examQuestion.question.options.map((option) => option.id);
        const optionById = new Map(examQuestion.question.options.map((option) => [option.id, option] as const));

        const options = optionOrder
          .map((optionId, optionIndex) => {
            const option = optionById.get(optionId);
            if (!option) {
              return null;
            }

            return {
              id: option.id,
              textoOpcion: option.textoOpcion,
              ordenOriginal: option.orden,
              ordenPresentacion: optionIndex + 1
            };
          })
          .filter(Boolean);

        return {
          order: index + 1,
          questionId: examQuestion.questionId,
          area: examQuestion.question.area,
          competencia: examQuestion.question.competencia,
          componente: examQuestion.question.componente,
          nivelDificultad: examQuestion.question.nivelDificultad,
          enunciado: examQuestion.question.enunciado,
          contextoTextoBase: examQuestion.question.contextoTextoBase,
          metadata: examQuestion.metadata,
          topics: examQuestion.question.topicLinks.map((link) => ({
            id: link.topic.id,
            code: link.topic.code,
            name: link.topic.name,
            subject: link.topic.subject
              ? {
                  id: link.topic.subject.id,
                  code: link.topic.subject.code,
                  name: link.topic.subject.name
                }
              : null
          })),
          subject: examQuestion.question.subject
            ? {
                id: examQuestion.question.subject.id,
                code: examQuestion.question.subject.code,
                name: examQuestion.question.subject.name
              }
            : null,
          options,
          selectedOptionId: selectedByQuestionId.get(questionId) ?? null
        };
      })
      .filter(Boolean);
  }

  private static async buildAttemptResponse(attemptId: string) {
    const attempt = await AttemptsRepository.findAttemptById(attemptId);
    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    const exam = await AttemptsRepository.findExamById(attempt.pruebaId);
    if (!exam) {
      throw new AppError("Prueba no encontrada", 404, "EXAM_NOT_FOUND");
    }

    const presentation = this.parsePresentation(attempt.presentacion) ?? this.buildInitialPresentation(exam);
    if (!this.parsePresentation(attempt.presentacion)) {
      await AttemptsRepository.updateAttemptPresentation(attempt.id, presentation);
    }

    const selectedByQuestionId = new Map(
      attempt.studentAnswers.map((answer) => [answer.preguntaId, answer.opcionIdSeleccionada] as const)
    );

    return {
      attempt,
      questionDeck: this.buildQuestionDeck(exam, presentation, selectedByQuestionId),
      sessionPlan: presentation.sessionPlan,
      sessionControl: presentation.sessionControl
    };
  }

  static async start(payload: StartAttemptInput, actorId?: string) {
    const exam = await AttemptsRepository.findExamById(payload.pruebaId);

    if (!exam || exam.isDeleted || exam.estado === "INACTIVO") {
      throw new AppError("Prueba no disponible", 404, "EXAM_NOT_FOUND");
    }

    const resolvedStudent = await (async () => {
      if (payload.estudianteRegistrado) {
        const student = await AttemptsRepository.findStudentByDocument(payload.estudianteRegistrado.numeroIdentificacion);
        if (!student || student.isDeleted) {
          throw new AppError("Estudiante no registrado", 404, "STUDENT_NOT_REGISTERED");
        }
        return { student, reused: true };
      }

      if (!payload.estudiante) {
        throw new AppError("Debe enviar estudiante o estudiante_registrado", 400, "VALIDATION_ERROR");
      }

      return StudentService.createOrFind(payload.estudiante, actorId);
    })();

    const assignment = this.findMatchingAssignment(exam, {
      id: resolvedStudent.student.id,
      schoolId: resolvedStudent.student.schoolId,
      groupId: resolvedStudent.student.groupId
    });

    if (assignment === "NO_MATCH") {
      throw new AppError("La prueba no esta asignada al estudiante/colegio/grupo", 403, "EXAM_NOT_ASSIGNED");
    }

    const openAttempt = await AttemptsRepository.findOpenAttemptByStudentExam({
      estudianteId: resolvedStudent.student.id,
      pruebaId: payload.pruebaId
    });

    if (openAttempt) {
      const response = await this.buildAttemptResponse(openAttempt.id);
      return {
        ...response,
        reusedStudent: resolvedStudent.reused,
        reusedOpenAttempt: true,
        student: resolvedStudent.student
      };
    }

    const attemptCount = await AttemptsRepository.countStudentAttemptsByExam({
      estudianteId: resolvedStudent.student.id,
      pruebaId: payload.pruebaId,
      assignmentId: assignment?.id
    });

    const maxAttempts = assignment?.maxAttempts ?? 1;
    const allowRetake = assignment?.allowRetake ?? false;

    if (!allowRetake && attemptCount >= 1) {
      throw new AppError("El estudiante ya presento esta prueba", 409, "ATTEMPT_ALREADY_EXISTS");
    }

    if (attemptCount >= maxAttempts) {
      throw new AppError("El estudiante alcanzo el maximo de intentos permitidos", 409, "ATTEMPT_LIMIT_REACHED");
    }

    const presentation = this.buildInitialPresentation(exam, payload.strictMode);
    const attempt = await AttemptsRepository.createAttempt({
      estudianteId: resolvedStudent.student.id,
      pruebaId: payload.pruebaId,
      assignmentId: assignment?.id,
      estado: AttemptStatus.INICIADA,
      presentacion: presentation
    });

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: attempt.id,
      accion: "START",
      userId: actorId,
      datos: {
        estudianteId: attempt.estudianteId,
        reusedStudent: resolvedStudent.reused,
        reusedOpenAttempt: false,
        pruebaId: attempt.pruebaId,
        assignmentId: assignment?.id ?? null
      }
    });

    const response = await this.buildAttemptResponse(attempt.id);

    return {
      ...response,
      reusedStudent: resolvedStudent.reused,
      reusedOpenAttempt: false,
      student: resolvedStudent.student
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

    const presentation = this.parsePresentation(attempt.presentacion);
    if (presentation?.sessionControl?.stoppedAt) {
      throw new AppError("El intento fue detenido", 400, "ATTEMPT_STOPPED");
    }
    if (
      presentation?.sessionControl?.strictMode &&
      presentation.sessionControl.session1CompletedAt &&
      !presentation.sessionControl.session2Enabled
    ) {
      throw new AppError("Jornada 2 aun no habilitada por administrador", 403, "SESSION2_LOCKED");
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

  static async completeSessionOne(attemptId: string, actorId?: string) {
    const attempt = await AttemptsRepository.findAttemptById(attemptId);
    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    const exam = await AttemptsRepository.findExamById(attempt.pruebaId);
    if (!exam) {
      throw new AppError("Prueba no encontrada", 404, "EXAM_NOT_FOUND");
    }

    const presentation = this.parsePresentation(attempt.presentacion) ?? this.buildInitialPresentation(exam);
    if (!presentation.sessionControl.strictMode) {
      throw new AppError("El intento no usa modo de dos jornadas", 400, "SESSION_MODE_NOT_STRICT");
    }

    presentation.sessionControl.session1CompletedAt = new Date().toISOString();
    presentation.sessionControl.currentSessionIndex = 1;

    await AttemptsRepository.updateAttemptPresentation(attempt.id, presentation);

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: attempt.id,
      accion: "SESSION1_COMPLETE",
      userId: actorId,
      datos: {
        session1CompletedAt: presentation.sessionControl.session1CompletedAt
      }
    });

    return {
      attemptId: attempt.id,
      sessionPlan: presentation.sessionPlan,
      sessionControl: presentation.sessionControl
    };
  }

  static async enableSessionTwo(attemptId: string, actorId?: string) {
    const attempt = await AttemptsRepository.findAttemptById(attemptId);
    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    const exam = await AttemptsRepository.findExamById(attempt.pruebaId);
    if (!exam) {
      throw new AppError("Prueba no encontrada", 404, "EXAM_NOT_FOUND");
    }

    const presentation = this.parsePresentation(attempt.presentacion) ?? this.buildInitialPresentation(exam);
    if (!presentation.sessionControl.strictMode) {
      throw new AppError("El intento no usa modo de dos jornadas", 400, "SESSION_MODE_NOT_STRICT");
    }

    presentation.sessionControl.session2Enabled = true;
    presentation.sessionControl.session2EnabledAt = new Date().toISOString();
    presentation.sessionControl.session2EnabledBy = actorId ?? "SYSTEM";
    presentation.sessionControl.currentSessionIndex = 1;

    await AttemptsRepository.updateAttemptPresentation(attempt.id, presentation);

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: attempt.id,
      accion: "SESSION2_ENABLE",
      userId: actorId,
      datos: {
        session2EnabledAt: presentation.sessionControl.session2EnabledAt
      }
    });

    return {
      attemptId: attempt.id,
      sessionPlan: presentation.sessionPlan,
      sessionControl: presentation.sessionControl
    };
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

    const presentation = this.parsePresentation(attempt.presentacion);
    if (
      presentation?.sessionControl?.strictMode &&
      presentation.sessionControl.session1CompletedAt &&
      !presentation.sessionControl.session2Enabled
    ) {
      throw new AppError("Jornada 2 aun no habilitada por administrador", 403, "SESSION2_LOCKED");
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

  static async stop(attemptId: string, payload: StopAttemptInput, actorId?: string) {
    const attempt = await AttemptsRepository.findAttemptById(attemptId);
    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    if (attempt.estado === AttemptStatus.CALIFICADA) {
      throw new AppError("No se puede detener un intento calificado", 400, "ATTEMPT_ALREADY_GRADED");
    }

    const exam = await AttemptsRepository.findExamById(attempt.pruebaId);
    if (!exam) {
      throw new AppError("Prueba no encontrada", 404, "EXAM_NOT_FOUND");
    }

    const presentation = this.parsePresentation(attempt.presentacion) ?? this.buildInitialPresentation(exam);
    presentation.sessionControl.stoppedAt = new Date().toISOString();
    presentation.sessionControl.stopReason = payload.motivo ?? "Sin motivo";

    const stopped = await AttemptsRepository.markAttemptStopped(attempt.id, {
      presentacion: presentation,
      motivo: payload.motivo
    });

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: attempt.id,
      accion: "STOP",
      userId: actorId,
      datos: {
        motivo: payload.motivo
      }
    });

    return {
      attempt: stopped,
      sessionPlan: presentation.sessionPlan,
      sessionControl: presentation.sessionControl
    };
  }

  static async restart(attemptId: string, payload: StopAttemptInput, actorId?: string) {
    const attempt = await AttemptsRepository.findAttemptById(attemptId);
    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    const exam = await AttemptsRepository.findExamById(attempt.pruebaId);
    if (!exam || exam.isDeleted || exam.estado === "INACTIVO") {
      throw new AppError("Prueba no disponible", 404, "EXAM_NOT_FOUND");
    }

    const oldPresentation = this.parsePresentation(attempt.presentacion) ?? this.buildInitialPresentation(exam);
    await this.stop(attemptId, { motivo: payload.motivo ?? "Reinicio de intento" }, actorId);

    const attemptCount = await AttemptsRepository.countStudentAttemptsByExam({
      estudianteId: attempt.estudianteId,
      pruebaId: attempt.pruebaId,
      assignmentId: attempt.assignmentId ?? undefined
    });

    const assignment = attempt.assignmentId
      ? exam.assignments.find((item) => item.id === attempt.assignmentId) ?? null
      : null;
    const maxAttempts = assignment?.maxAttempts ?? 1;
    const allowRetake = assignment?.allowRetake ?? false;

    if (!allowRetake && attemptCount >= 1) {
      throw new AppError("El estudiante ya presento esta prueba", 409, "ATTEMPT_ALREADY_EXISTS");
    }
    if (attemptCount >= maxAttempts) {
      throw new AppError("El estudiante alcanzo el maximo de intentos permitidos", 409, "ATTEMPT_LIMIT_REACHED");
    }

    const newPresentation = this.buildInitialPresentation(exam, oldPresentation.sessionControl.strictMode);
    newPresentation.sessionControl.restartedFromAttemptId = attempt.id;

    const created = await AttemptsRepository.createAttempt({
      estudianteId: attempt.estudianteId,
      pruebaId: attempt.pruebaId,
      assignmentId: attempt.assignmentId,
      estado: AttemptStatus.INICIADA,
      presentacion: newPresentation
    });

    await createAuditLog({
      entidad: "exam_attempts",
      entidadId: created.id,
      accion: "RESTART",
      userId: actorId,
      datos: {
        fromAttemptId: attempt.id,
        motivo: payload.motivo
      }
    });

    return this.buildAttemptResponse(created.id);
  }

  static async getById(id: string) {
    const attempt = await AttemptsRepository.findAttemptById(id);

    if (!attempt) {
      throw new AppError("Intento no encontrado", 404, "NOT_FOUND");
    }

    return attempt;
  }

  static async getPublicById(id: string) {
    return this.buildAttemptResponse(id);
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

  static async pendingSessionTwo(query: { grado?: string; grupo?: string; limit: number }) {
    const attempts = await AttemptsRepository.listPendingSessionTwo({ limit: query.limit });
    const now = Date.now();

    const items = attempts
      .filter((attempt) => {
        const presentation = this.parsePresentation(attempt.presentacion);
        if (!presentation?.sessionControl?.strictMode) {
          return false;
        }
        if (!presentation.sessionControl.session1CompletedAt) {
          return false;
        }
        if (presentation.sessionControl.session2Enabled) {
          return false;
        }
        if (query.grado && attempt.estudiante.grado !== query.grado) {
          return false;
        }
        if (query.grupo && attempt.estudiante.grupo !== query.grupo) {
          return false;
        }
        return true;
      })
      .map((attempt) => {
        const presentation = this.parsePresentation(attempt.presentacion)!;
        const waitStart = new Date(presentation.sessionControl.session1CompletedAt!).getTime();
        const waitingMinutes = Math.max(0, Math.floor((now - waitStart) / 60000));

        return {
          attemptId: attempt.id,
          waitingMinutes,
          student: {
            id: attempt.estudiante.id,
            nombres: attempt.estudiante.nombres,
            apellidos: attempt.estudiante.apellidos,
            tipoIdentificacion: attempt.estudiante.tipoIdentificacion,
            numeroIdentificacion: attempt.estudiante.numeroIdentificacion,
            grado: attempt.estudiante.grado,
            grupo: attempt.estudiante.grupo
          },
          exam: {
            id: attempt.prueba.id,
            nombre: attempt.prueba.nombre,
            tipoPrueba: attempt.prueba.tipoPrueba
          },
          sessionControl: presentation.sessionControl
        };
      });

    return {
      total: items.length,
      items
    };
  }

  private static resolvePerformanceLevel(levels: PerformanceLevel[], percentage: number) {
    const match = levels.find((level) => percentage >= level.minimo && percentage <= level.maximo);
    return match?.nombre ?? "Sin nivel";
  }
}
