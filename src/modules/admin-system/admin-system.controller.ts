import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { AdminSystemService } from "./admin-system.service";

export class AdminSystemController {
  static async status(req: Request, res: Response) {
    const data = await AdminSystemService.status(req.user);
    return sendSuccess(res, "Estado general del sistema", data);
  }

  static async lan(req: Request, res: Response) {
    const data = await AdminSystemService.lan(req.user);
    return sendSuccess(res, "Estado LAN", data);
  }

  static async health(req: Request, res: Response) {
    const data = await AdminSystemService.health(req.user);
    return sendSuccess(res, "Chequeo de salud administrativo", data);
  }

  static async schoolsImportDryRun(req: Request, res: Response) {
    const data = await AdminSystemService.schoolsImportDryRun(req.body, req.user);
    return sendSuccess(res, "Dry-run de importacion de colegios ejecutado", data);
  }

  static async schoolsImportApply(req: Request, res: Response) {
    const data = await AdminSystemService.schoolsImportApply(req.body, req.user);
    return sendSuccess(res, "Importacion de colegios ejecutada", data);
  }

  static async backup(req: Request, res: Response) {
    const data = await AdminSystemService.createBackup(req.body, req.user);
    return sendSuccess(res, "Operacion de backup procesada", data);
  }

  static async localProductionPrepare(req: Request, res: Response) {
    const data = await AdminSystemService.localProductionPrepare(req.body, req.user);
    return sendSuccess(res, "Preparacion local procesada", data);
  }

  static async operations(req: Request, res: Response) {
    const data = await AdminSystemService.operations(req.user);
    return sendSuccess(res, "Operaciones administrativas recientes", data);
  }

  static async checklist(req: Request, res: Response) {
    const data = await AdminSystemService.checklist(req.user);
    return sendSuccess(res, "Checklist operativo", data);
  }

  static async updateChecklist(req: Request, res: Response) {
    const data = await AdminSystemService.updateChecklist(req.params.itemId, req.body, req.user);
    return sendSuccess(res, "Checklist actualizado", data);
  }
}
