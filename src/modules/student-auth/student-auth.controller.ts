import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { StudentAuthService } from "./student-auth.service";

export class StudentAuthController {
  static async login(req: Request, res: Response) {
    const data = await StudentAuthService.login(req.body);
    return sendSuccess(res, "Login estudiante exitoso", data);
  }

  static async me(req: Request, res: Response) {
    const data = await StudentAuthService.me(req.studentSession!.studentId);
    return sendSuccess(res, "Sesion estudiante activa", data);
  }
}
