import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { UsersService } from "./users.service";

export class UsersController {
  static async bulkCreate(req: Request, res: Response) {
    const data = await UsersService.bulkCreate(
      {
        fileBuffer: req.file?.buffer,
        csvText: typeof req.body?.csv === "string" ? req.body.csv : undefined,
        delimiter: typeof req.body?.delimiter === "string" ? req.body.delimiter : undefined
      },
      req.user!.id
    );

    return sendSuccess(res, "Carga masiva de usuarios procesada", data, 201);
  }

  static async bulkTemplate(_req: Request, res: Response) {
    const csv = [
      "name,email,password,role,is_active",
      "Docente Demo,docente.demo@saber11.local,Docente#2026!,DOCENTE,true",
      "Admin Demo,admin.demo@saber11.local,Admin#2026!,ADMIN,true"
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"users_bulk_template.csv\"");
    return res.status(200).send(`${csv}\n`);
  }

  static async create(req: Request, res: Response) {
    const data = await UsersService.create(req.body, req.user!.id);
    return sendSuccess(res, "Usuario creado", data, 201);
  }

  static async list(req: Request, res: Response) {
    const data = await UsersService.list(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de usuarios", data);
  }

  static async update(req: Request, res: Response) {
    const data = await UsersService.update(req.params.id, req.body, req.user!.id);
    return sendSuccess(res, "Usuario actualizado", data);
  }
}
