import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { AttemptService } from "./attempts.service";

export class AttemptController {
  static async start(req: Request, res: Response) {
    const data = await AttemptService.start(req.body, req.user);
    return sendSuccess(res, "Intento creado", data, 201);
  }

  static async answer(req: Request, res: Response) {
    const data = await AttemptService.answer(req.params.id, req.body, req.user);
    return sendSuccess(res, "Respuesta registrada", data, 201);
  }

  static async submit(req: Request, res: Response) {
    const data = await AttemptService.submit(req.params.id, req.user);
    return sendSuccess(res, "Intento enviado y calificado", data);
  }

  static async getById(req: Request, res: Response) {
    const data = await AttemptService.getById(req.params.id, req.user);
    return sendSuccess(res, "Detalle de intento", data);
  }

  static async getByStudentDocument(req: Request, res: Response) {
    const data = await AttemptService.getByStudentDocument(req.params.numero_identificacion, req.user);
    return sendSuccess(res, "Intentos por estudiante", data);
  }

  static async getByExam(req: Request, res: Response) {
    const data = await AttemptService.getByExam(req.params.examId, req.user);
    return sendSuccess(res, "Intentos por prueba", data);
  }

  static async stop(req: Request, res: Response) {
    const data = await AttemptService.stop(req.params.id, req.body, req.user);
    return sendSuccess(res, "Intento detenido", data);
  }

  static async restart(req: Request, res: Response) {
    const data = await AttemptService.restart(req.params.id, req.body, req.user);
    return sendSuccess(res, "Intento reiniciado", data);
  }

  static async completeSessionOne(req: Request, res: Response) {
    const data = await AttemptService.completeSessionOne(req.params.id);
    return sendSuccess(res, "Jornada 1 completada", data);
  }

  static async enableSessionTwo(req: Request, res: Response) {
    const data = await AttemptService.enableSessionTwo(req.params.id, req.user);
    return sendSuccess(res, "Jornada 2 habilitada", data);
  }

  static async pendingSessionTwo(req: Request, res: Response) {
    const data = await AttemptService.pendingSessionTwo(
      req.query as unknown as { grado?: string; grupo?: string; limit: number },
      req.user
    );
    return sendSuccess(res, "Intentos pendientes de jornada 2", data);
  }
}
