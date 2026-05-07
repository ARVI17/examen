import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { ExamService } from "./exams.service";

export class ExamController {
  static async create(req: Request, res: Response) {
    const data = await ExamService.create(req.body, req.user?.id);
    return sendSuccess(res, "Prueba creada", data, 201);
  }

  static async list(req: Request, res: Response) {
    const data = await ExamService.list(req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Listado de pruebas", data);
  }

  static async listPublic(req: Request, res: Response) {
    const data = await ExamService.listPublic(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de pruebas disponibles", data);
  }

  static async getById(req: Request, res: Response) {
    const data = await ExamService.getById(req.params.id, req.user);
    return sendSuccess(res, "Detalle de prueba", data);
  }

  static async update(req: Request, res: Response) {
    const data = await ExamService.update(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Prueba actualizada", data);
  }

  static async softDelete(req: Request, res: Response) {
    await ExamService.softDelete(req.params.id, req.user?.id);
    return sendSuccess(res, "Prueba inactivada", null);
  }

  static async addQuestions(req: Request, res: Response) {
    const data = await ExamService.addQuestions(req.params.id, req.body.questions, req.user?.id);
    return sendSuccess(res, "Preguntas agregadas a la prueba", data, 201);
  }

  static async listQuestions(req: Request, res: Response) {
    const data = await ExamService.listQuestions(req.params.id, req.user);
    return sendSuccess(res, "Preguntas de la prueba", data);
  }

  static async createAssignment(req: Request, res: Response) {
    const data = await ExamService.createAssignment(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Asignacion creada", data, 201);
  }

  static async listAssignments(req: Request, res: Response) {
    const data = await ExamService.listAssignments(req.params.id, req.user);
    return sendSuccess(res, "Asignaciones de prueba", data);
  }
}
