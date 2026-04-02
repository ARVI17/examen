import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { StudentService } from "./students.service";

export class StudentController {
  static async create(req: Request, res: Response) {
    const data = await StudentService.createOrFind(req.body, req.user?.id);

    return sendSuccess(
      res,
      data.reused ? "Estudiante existente reutilizado" : "Estudiante registrado",
      data,
      data.reused ? 200 : 201
    );
  }

  static async list(req: Request, res: Response) {
    const data = await StudentService.list(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de estudiantes", data);
  }

  static async getById(req: Request, res: Response) {
    const data = await StudentService.getById(req.params.id);
    return sendSuccess(res, "Detalle de estudiante", data);
  }

  static async getByDocument(req: Request, res: Response) {
    const data = await StudentService.getByDocument(req.params.numero_identificacion);
    return sendSuccess(res, "Detalle de estudiante", data);
  }

  static async update(req: Request, res: Response) {
    const data = await StudentService.update(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Estudiante actualizado", data);
  }

  static async softDelete(req: Request, res: Response) {
    await StudentService.softDelete(req.params.id, req.user?.id);
    return sendSuccess(res, "Estudiante eliminado logicamente", null);
  }

  static async historyById(req: Request, res: Response) {
    const data = await StudentService.historyById(req.params.id);
    return sendSuccess(res, "Historial por id", data);
  }

  static async historyByDocument(req: Request, res: Response) {
    const data = await StudentService.historyByDocument(req.params.numero_identificacion);
    return sendSuccess(res, "Historial por documento", data);
  }
}
