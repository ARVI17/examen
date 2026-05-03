import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { StudentService } from "./students.service";

export class StudentController {
  static async bulkCreate(req: Request, res: Response) {
    const data = await StudentService.bulkCreate(
      {
        fileBuffer: req.file?.buffer,
        csvText: typeof req.body?.csv === "string" ? req.body.csv : undefined,
        delimiter: typeof req.body?.delimiter === "string" ? req.body.delimiter : undefined
      },
      req.user?.id
    );

    return sendSuccess(res, "Carga masiva de estudiantes procesada", data, 201);
  }

  static async bulkTemplate(_req: Request, res: Response) {
    const csv = [
      "nombres,apellidos,tipo_identificacion,numero_identificacion,grado,grupo,institucion,email",
      "Ana,Perez,TI,TI-9001,11,11-A,Colegio Demo,ana.perez@example.com",
      "Luis,Rojas,CC,CC-9002,11,11-B,Colegio Demo,luis.rojas@example.com"
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"students_bulk_template.csv\"");
    return res.status(200).send(`${csv}\n`);
  }

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
