import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { AttemptService } from "./attempts.service";

export class AttemptController {
  static async start(req: Request, res: Response) {
    const data = await AttemptService.start(req.body, req.user?.id);
    return sendSuccess(res, "Intento creado", data, 201);
  }

  static async answer(req: Request, res: Response) {
    const data = await AttemptService.answer(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Respuesta registrada", data, 201);
  }

  static async submit(req: Request, res: Response) {
    const data = await AttemptService.submit(req.params.id, req.user?.id);
    return sendSuccess(res, "Intento enviado y calificado", data);
  }

  static async getById(req: Request, res: Response) {
    const data = await AttemptService.getById(req.params.id);
    return sendSuccess(res, "Detalle de intento", data);
  }

  static async getByStudentDocument(req: Request, res: Response) {
    const data = await AttemptService.getByStudentDocument(req.params.numero_identificacion);
    return sendSuccess(res, "Intentos por estudiante", data);
  }

  static async getByExam(req: Request, res: Response) {
    const data = await AttemptService.getByExam(req.params.examId);
    return sendSuccess(res, "Intentos por prueba", data);
  }
}
