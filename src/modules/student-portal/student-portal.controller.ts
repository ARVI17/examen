import { Request, Response } from "express";
import logger from "../../common/logger";
import { sendSuccess } from "../../common/utils/api-response";
import { createAuditLog } from "../../common/utils/audit";
import { StudentPortalService } from "./student-portal.service";

export class StudentPortalController {
  private static async auditEvent(req: Request, action: string, entityId: string, data: Record<string, unknown>) {
    const session = req.studentSession;
    await createAuditLog({
      entidad: "student_portal",
      entidadId: entityId,
      accion: action,
      datos: {
        ...data,
        requestId: req.id ?? null,
        studentId: session?.studentId ?? null
      }
    });
  }

  static async home(req: Request, res: Response) {
    const data = await StudentPortalService.home(req.studentSession!);
    return sendSuccess(res, "Portal estudiante", data);
  }

  static async listExams(req: Request, res: Response) {
    const data = await StudentPortalService.listExams(req.studentSession!);
    return sendSuccess(res, "Pruebas disponibles", data);
  }

  static async startAttempt(req: Request, res: Response) {
    const data = await StudentPortalService.startAttempt(req.studentSession!, req.body);
    const action = data.reusedOpenAttempt ? "STUDENT_ATTEMPT_RESUMED" : "STUDENT_ATTEMPT_STARTED";
    logger.info(
      {
        event: action,
        requestId: req.id ?? null,
        studentId: req.studentSession?.studentId ?? null,
        attemptId: data.attempt?.id ?? null,
        examId: data.attempt?.pruebaId ?? null
      },
      action
    );
    await StudentPortalController.auditEvent(req, action, data.attempt?.id ?? "unknown_attempt", {
      reusedOpenAttempt: Boolean(data.reusedOpenAttempt),
      examId: data.attempt?.pruebaId ?? null
    });
    return sendSuccess(res, "Intento iniciado", data, 201);
  }

  static async getAttempt(req: Request, res: Response) {
    const data = await StudentPortalService.getAttempt(req.studentSession!, req.params.id);
    return sendSuccess(res, "Intento estudiante", data);
  }

  static async answerAttempt(req: Request, res: Response) {
    try {
      const data = await StudentPortalService.answerAttempt(req.studentSession!, req.params.id, req.body);
      logger.info(
        {
          event: "STUDENT_ANSWER_SAVED",
          requestId: req.id ?? null,
          studentId: req.studentSession?.studentId ?? null,
          attemptId: req.params.id,
          questionId: req.body?.preguntaId ?? req.body?.pregunta_id ?? null
        },
        "STUDENT_ANSWER_SAVED"
      );
      await StudentPortalController.auditEvent(req, "STUDENT_ANSWER_SAVED", req.params.id, {
        questionId: req.body?.preguntaId ?? req.body?.pregunta_id ?? null
      });
      return sendSuccess(res, "Respuesta registrada", data, 201);
    } catch (error) {
      logger.warn(
        {
          event: "STUDENT_ANSWER_SYNC_ERROR",
          requestId: req.id ?? null,
          studentId: req.studentSession?.studentId ?? null,
          attemptId: req.params.id,
          questionId: req.body?.preguntaId ?? req.body?.pregunta_id ?? null,
          error: error instanceof Error ? error.message : "unknown_error"
        },
        "STUDENT_ANSWER_SYNC_ERROR"
      );
      await StudentPortalController.auditEvent(req, "STUDENT_ANSWER_SYNC_ERROR", req.params.id, {
        questionId: req.body?.preguntaId ?? req.body?.pregunta_id ?? null,
        error: error instanceof Error ? error.message : "unknown_error"
      });
      throw error;
    }
  }

  static async submitAttempt(req: Request, res: Response) {
    try {
      const data = await StudentPortalService.submitAttempt(req.studentSession!, req.params.id);
      logger.info(
        {
          event: "STUDENT_ATTEMPT_SUBMITTED",
          requestId: req.id ?? null,
          studentId: req.studentSession?.studentId ?? null,
          attemptId: req.params.id,
          porcentajeTotal: data?.porcentajeTotal ?? null
        },
        "STUDENT_ATTEMPT_SUBMITTED"
      );
      await StudentPortalController.auditEvent(req, "STUDENT_ATTEMPT_SUBMITTED", req.params.id, {
        porcentajeTotal: data?.porcentajeTotal ?? null
      });
      return sendSuccess(res, "Intento enviado y calificado", data);
    } catch (error) {
      logger.error(
        {
          event: "STUDENT_ATTEMPT_SUBMIT_FAILED",
          requestId: req.id ?? null,
          studentId: req.studentSession?.studentId ?? null,
          attemptId: req.params.id,
          error: error instanceof Error ? error.message : "unknown_error"
        },
        "STUDENT_ATTEMPT_SUBMIT_FAILED"
      );
      await StudentPortalController.auditEvent(req, "STUDENT_ATTEMPT_SUBMIT_FAILED", req.params.id, {
        error: error instanceof Error ? error.message : "unknown_error"
      });
      throw error;
    }
  }

  static async completeSessionOne(req: Request, res: Response) {
    const data = await StudentPortalService.completeSessionOne(req.studentSession!, req.params.id);
    logger.info(
      {
        event: "STUDENT_ATTEMPT_SESSION1_COMPLETED",
        requestId: req.id ?? null,
        studentId: req.studentSession?.studentId ?? null,
        attemptId: req.params.id
      },
      "STUDENT_ATTEMPT_SESSION1_COMPLETED"
    );
    await StudentPortalController.auditEvent(req, "STUDENT_ATTEMPT_SESSION1_COMPLETED", req.params.id, {});
    return sendSuccess(res, "Jornada 1 completada", data);
  }

  static async listResults(req: Request, res: Response) {
    const data = await StudentPortalService.listResults(req.studentSession!);
    return sendSuccess(res, "Resultados del estudiante", data);
  }

  static async getResult(req: Request, res: Response) {
    const data = await StudentPortalService.getResultByAttempt(req.studentSession!, req.params.id);
    return sendSuccess(res, "Resultado del intento", data);
  }
}
