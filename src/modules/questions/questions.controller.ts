import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { QuestionService } from "./questions.service";

export class QuestionController {
  static async create(req: Request, res: Response) {
    const data = await QuestionService.create(req.body, req.user?.id);
    return sendSuccess(res, "Pregunta creada", data, 201);
  }

  static async list(req: Request, res: Response) {
    const data = await QuestionService.list(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de preguntas", data);
  }

  static async listGenerated(req: Request, res: Response) {
    const data = await QuestionService.listGenerated(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de preguntas generadas por IA", data);
  }

  static async getById(req: Request, res: Response) {
    const data = await QuestionService.getById(req.params.id);
    return sendSuccess(res, "Detalle de pregunta", data);
  }

  static async update(req: Request, res: Response) {
    const data = await QuestionService.update(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Pregunta actualizada", data);
  }

  static async softDelete(req: Request, res: Response) {
    await QuestionService.softDelete(req.params.id, req.user?.id);
    return sendSuccess(res, "Pregunta desactivada", null);
  }

  static async updateGeneratedStatus(req: Request, res: Response) {
    const data = await QuestionService.updateGeneratedStatus(req.params.id, req.body.status, req.user?.id);
    return sendSuccess(res, "Estado de generacion IA actualizado", data);
  }
}
