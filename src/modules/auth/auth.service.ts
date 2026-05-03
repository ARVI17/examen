import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { RoleCode } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { config } from "../../config";
import { AuthRepository } from "./auth.repository";
import { AuthSecurityService } from "./auth-security.service";
import { LoginInput, RegisterInput } from "./auth.types";

export class AuthService {
  static async register(payload: RegisterInput, actorId?: string) {
    const normalizedEmail = payload.email.toLowerCase();
    const existingUser = await AuthRepository.findUserByEmail(normalizedEmail);

    if (existingUser) {
      throw new AppError("El correo ya esta registrado", 409, "USER_EXISTS");
    }

    const role = await AuthRepository.findRoleByCode(payload.role ?? RoleCode.DOCENTE);

    if (!role) {
      throw new AppError("Rol no configurado en catalogo", 500, "ROLE_NOT_CONFIGURED");
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = await AuthRepository.createUser({
      name: payload.name,
      email: normalizedEmail,
      passwordHash,
      roleId: role.id
    });

    await createAuditLog({
      entidad: "users",
      entidadId: user.id,
      accion: "REGISTER",
      userId: actorId ?? user.id,
      datos: {
        email: user.email,
        role: user.role.code,
        createdBy: actorId ?? user.id
      }
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.code,
      createdAt: user.createdAt
    };
  }

  static async login(payload: LoginInput, context: { ip: string }) {
    const normalizedEmail = payload.email.toLowerCase();

    await AuthSecurityService.ensureLoginAllowed(normalizedEmail, context.ip);

    const user = await AuthRepository.findUserByEmail(normalizedEmail);

    if (!user || !user.isActive) {
      await AuthSecurityService.registerFailedAttempt(normalizedEmail, context.ip);
      throw new AppError("Credenciales invalidas", 401, "INVALID_CREDENTIALS");
    }

    const validPassword = await bcrypt.compare(payload.password, user.passwordHash);

    if (!validPassword) {
      await AuthSecurityService.registerFailedAttempt(normalizedEmail, context.ip);
      throw new AppError("Credenciales invalidas", 401, "INVALID_CREDENTIALS");
    }

    await AuthSecurityService.clearSuccessfulAttempt(normalizedEmail, context.ip);

    const signOptions: SignOptions = {
      expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"]
    };

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role.code
      },
      config.jwtSigningSecret,
      signOptions
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.code
      }
    };
  }

  static async me(userId: string) {
    const user = await AuthRepository.findUserById(userId);

    if (!user || !user.isActive) {
      throw new AppError("Usuario no encontrado", 404, "NOT_FOUND");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.code,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
