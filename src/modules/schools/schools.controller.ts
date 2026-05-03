import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { SchoolsService } from "./schools.service";

export class SchoolsController {
  static async createSchool(req: Request, res: Response) {
    const data = await SchoolsService.createSchool(req.body, req.user?.id);
    return sendSuccess(res, "Colegio creado", data, 201);
  }

  static async listSchools(req: Request, res: Response) {
    const data = await SchoolsService.listSchools(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de colegios", data);
  }

  static async getSchoolById(req: Request, res: Response) {
    const data = await SchoolsService.getSchoolById(req.params.id);
    return sendSuccess(res, "Detalle de colegio", data);
  }

  static async updateSchool(req: Request, res: Response) {
    const data = await SchoolsService.updateSchool(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Colegio actualizado", data);
  }

  static async createGroup(req: Request, res: Response) {
    const data = await SchoolsService.createGroup(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Grupo creado", data, 201);
  }

  static async listGroups(req: Request, res: Response) {
    const data = await SchoolsService.listGroupsBySchool(req.params.id, req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de grupos", data);
  }

  static async updateGroup(req: Request, res: Response) {
    const data = await SchoolsService.updateGroup(req.params.groupId, req.body, req.user?.id);
    return sendSuccess(res, "Grupo actualizado", data);
  }
}

