import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { StudentPortalService } from "./student-portal.service";

export class StudentPortalController {
  static async home(req: Request, res: Response) {
    const data = await StudentPortalService.home(req.studentSession!);
    return sendSuccess(res, "Portal estudiante", data);
  }

  static async listExams(req: Request, res: Response) {
    const data = await StudentPortalService.listExams(req.studentSession!);
    return sendSuccess(res, "Pruebas disponibles", data);
  }

  static async startAttempt(req: Request, res: Response) {
    const data = await StudentPortalService.startAttempt(req.studentSession!, req.body);
    return sendSuccess(res, "Intento iniciado", data, 201);
  }

  static async getAttempt(req: Request, res: Response) {
    const data = await StudentPortalService.getAttempt(req.studentSession!, req.params.id);
    return sendSuccess(res, "Intento estudiante", data);
  }

  static async answerAttempt(req: Request, res: Response) {
    const data = await StudentPortalService.answerAttempt(req.studentSession!, req.params.id, req.body);
    return sendSuccess(res, "Respuesta registrada", data, 201);
  }

  static async submitAttempt(req: Request, res: Response) {
    const data = await StudentPortalService.submitAttempt(req.studentSession!, req.params.id);
    return sendSuccess(res, "Intento enviado y calificado", data);
  }

  static async completeSessionOne(req: Request, res: Response) {
    const data = await StudentPortalService.completeSessionOne(req.studentSession!, req.params.id);
    return sendSuccess(res, "Jornada 1 completada", data);
  }

  static async listResults(req: Request, res: Response) {
    const data = await StudentPortalService.listResults(req.studentSession!);
    return sendSuccess(res, "Resultados del estudiante", data);
  }

  static async getResult(req: Request, res: Response) {
    const data = await StudentPortalService.getResultByAttempt(req.studentSession!, req.params.id);
    return sendSuccess(res, "Resultado del intento", data);
  }
}
