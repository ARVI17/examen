import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { PerformanceLevelService } from "./performance-levels.service";

export class PerformanceLevelController {
  static async create(req: Request, res: Response) {
    const data = await PerformanceLevelService.create(req.body, req.user?.id);
    return sendSuccess(res, "Nivel de desempeno creado", data, 201);
  }

  static async list(_req: Request, res: Response) {
    const data = await PerformanceLevelService.list();
    return sendSuccess(res, "Niveles de desempeno", data);
  }

  static async update(req: Request, res: Response) {
    const data = await PerformanceLevelService.update(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Nivel de desempeno actualizado", data);
  }
}
