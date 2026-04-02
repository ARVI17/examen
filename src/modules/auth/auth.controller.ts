import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { AuthService } from "./auth.service";

export class AuthController {
  static async register(req: Request, res: Response) {
    const data = await AuthService.register(req.body, req.user?.id);
    return sendSuccess(res, "Usuario registrado", data, 201);
  }

  static async login(req: Request, res: Response) {
    const data = await AuthService.login(req.body, { ip: req.ip || "unknown" });
    return sendSuccess(res, "Login exitoso", data);
  }

  static async me(req: Request, res: Response) {
    const data = await AuthService.me(req.user!.id);
    return sendSuccess(res, "Usuario autenticado", data);
  }
}
