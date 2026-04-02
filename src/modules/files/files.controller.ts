import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { FilesService } from "./files.service";
import { FileDownloadQuery } from "./files.types";
import { requireUploadedFile } from "./files.upload";

export class FilesController {
  static async upload(req: Request, res: Response) {
    requireUploadedFile(req);
    const data = await FilesService.upload(req.file as Express.Multer.File, req.body, req.user?.id);
    return sendSuccess(res, "Archivo cargado", data, 201);
  }

  static async list(req: Request, res: Response) {
    const data = await FilesService.list(req.query as Record<string, unknown>);
    return sendSuccess(res, "Listado de archivos", data);
  }

  static async search(req: Request, res: Response) {
    const data = await FilesService.search(req.query as Record<string, unknown>);
    return sendSuccess(res, "Busqueda de archivos", data);
  }

  static async getById(req: Request, res: Response) {
    const data = await FilesService.getById(req.params.id);
    return sendSuccess(res, "Detalle de archivo", data);
  }

  static async downloadById(req: Request, res: Response) {
    const { asset, absolutePath } = await FilesService.resolveDownloadById(req.params.id);
    res.setHeader("Content-Type", asset.tipoMime);
    return res.download(absolutePath, asset.nombreOriginal);
  }

  static async downloadByQuery(req: Request, res: Response) {
    const { asset, absolutePath } = await FilesService.resolveDownloadByQuery(req.query as FileDownloadQuery);
    res.setHeader("Content-Type", asset.tipoMime);
    return res.download(absolutePath, asset.nombreOriginal);
  }

  static async update(req: Request, res: Response) {
    const data = await FilesService.update(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Archivo actualizado", data);
  }

  static async softDelete(req: Request, res: Response) {
    await FilesService.softDelete(req.params.id, req.user?.id);
    return sendSuccess(res, "Archivo eliminado logicamente", null);
  }

  static async newVersion(req: Request, res: Response) {
    requireUploadedFile(req);
    const data = await FilesService.newVersion(
      req.params.id,
      req.file as Express.Multer.File,
      req.body,
      req.user?.id
    );
    return sendSuccess(res, "Nueva version creada", data, 201);
  }

  static async duplicate(req: Request, res: Response) {
    const data = await FilesService.duplicate(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, "Archivo duplicado", data, 201);
  }
}
