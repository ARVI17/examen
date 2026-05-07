import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { RoleCode } from "@prisma/client";
import logger from "../common/logger";
import { config } from "../config";
import { AppError } from "../common/errors/AppError";
import { createAuditLog } from "../common/utils/audit";
import { AuthRepository } from "../modules/auth/auth.repository";
import { StudentAuthRepository } from "../modules/student-auth/student-auth.repository";

type AuthTokenPayload = {
  id: string;
  email: string;
  role: RoleCode;
  kind?: string;
};

type CachedAuthContext = {
  email: string;
  role: RoleCode;
  isActive: boolean;
  scope: {
    schoolIds: string[];
    groupIds: string[];
  };
  expiresAt: number;
};

type StudentTokenPayload = {
  kind: "student";
  studentId: string;
  tipoIdentificacion: string;
  numeroIdentificacion: string;
};

const authContextCache = new Map<string, CachedAuthContext>();

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const getCachedAuthContext = (userId: string) => {
  const cached = authContextCache.get(userId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    authContextCache.delete(userId);
    return null;
  }

  return cached;
};

const cacheAuthContext = (userId: string, context: Omit<CachedAuthContext, "expiresAt">) => {
  if (config.authContextCacheTtlSeconds <= 0) {
    return;
  }

  authContextCache.set(userId, {
    ...context,
    expiresAt: Date.now() + config.authContextCacheTtlSeconds * 1000
  });
};

const resolveAuthenticatedUser = async (userId: string) => {
  const cached = getCachedAuthContext(userId);
  if (cached) {
    return cached;
  }

  const user = await AuthRepository.findUserById(userId);
  if (!user || !user.isActive) {
    authContextCache.delete(userId);
    return null;
  }

  const context = {
    email: user.email,
    role: user.role.code,
    isActive: user.isActive,
    scope: {
      schoolIds: unique(
        user.scopeAssignments
          .map((scope) => scope.schoolId ?? scope.group?.schoolId ?? "")
          .filter((value): value is string => Boolean(value))
      ),
      groupIds: unique(
        user.scopeAssignments
          .map((scope) => scope.groupId ?? "")
          .filter((value): value is string => Boolean(value))
      )
    }
  } as const;

  cacheAuthContext(userId, context);
  return context;
};

const verifyAuthToken = (token: string) => {
  for (const secret of config.jwtVerificationSecrets) {
    try {
      return jwt.verify(token, secret) as AuthTokenPayload;
    } catch {
      continue;
    }
  }

  throw new AppError("Token invalido o expirado", 401, "UNAUTHORIZED");
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    void createAuditLog({
      entidad: "auth",
      entidadId: "missing_token",
      accion: "AUTHENTICATION_FAILED",
      datos: {
        reason: "missing_bearer_token",
        path: req.originalUrl ?? req.url,
        method: req.method,
        ip: req.ip ?? null
      }
    });
    throw new AppError("Token no proporcionado", 401, "UNAUTHORIZED");
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    const payload = verifyAuthToken(token);
    if (payload.kind === "student") {
      throw new AppError("Token de estudiante no valido para rutas administrativas", 401, "UNAUTHORIZED");
    }
    if (!payload.role || !payload.id) {
      throw new AppError("Token invalido o expirado", 401, "UNAUTHORIZED");
    }
    const authContext = await resolveAuthenticatedUser(payload.id);

    if (!authContext?.isActive) {
      void createAuditLog({
        entidad: "auth",
        entidadId: payload.id,
        accion: "AUTHENTICATION_FAILED",
        userId: payload.id,
        datos: {
          reason: "inactive_or_missing_user",
          path: req.originalUrl ?? req.url,
          method: req.method,
          ip: req.ip ?? null
        }
      });
      throw new AppError("Usuario no autorizado o inactivo", 401, "UNAUTHORIZED");
    }

    req.user = {
      id: payload.id,
      email: authContext.email,
      role: authContext.role,
      scope: authContext.scope
    };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.warn(
      {
        path: req.originalUrl ?? req.url,
        method: req.method,
        ip: req.ip ?? null
      },
      "Token invalido en autenticacion"
    );
    void createAuditLog({
      entidad: "auth",
      entidadId: "invalid_token",
      accion: "AUTHENTICATION_FAILED",
      datos: {
        reason: "token_invalid_or_expired",
        path: req.originalUrl ?? req.url,
        method: req.method,
        ip: req.ip ?? null
      }
    });
    throw new AppError("Token invalido o expirado", 401, "UNAUTHORIZED");
  }
};

export const authorize = (...roles: RoleCode[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Usuario no autenticado", 401, "UNAUTHORIZED");
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        {
          userId: req.user.id,
          role: req.user.role,
          requiredRoles: roles,
          path: req.originalUrl ?? req.url,
          method: req.method,
          ip: req.ip ?? null
        },
        "Acceso denegado por rol"
      );
      void createAuditLog({
        entidad: "authorization",
        entidadId: req.user.id,
        accion: "ACCESS_DENIED",
        userId: req.user.id,
        datos: {
          role: req.user.role,
          requiredRoles: roles,
          path: req.originalUrl ?? req.url,
          method: req.method,
          ip: req.ip ?? null
        }
      });
      throw new AppError("No autorizado para esta accion", 403, "FORBIDDEN");
    }

    next();
  };
};

const verifyStudentToken = (token: string) => {
  for (const secret of config.jwtVerificationSecrets) {
    try {
      const payload = jwt.verify(token, secret) as StudentTokenPayload;
      if (payload?.kind === "student" && payload.studentId) {
        return payload;
      }
    } catch {
      continue;
    }
  }

  throw new AppError("Token invalido o expirado", 401, "UNAUTHORIZED");
};

export const authenticateStudent = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Token no proporcionado", 401, "UNAUTHORIZED");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const payload = verifyStudentToken(token);
  const student = await StudentAuthRepository.findById(payload.studentId);

  if (!student || student.isDeleted) {
    throw new AppError("Sesion de estudiante invalida", 401, "INVALID_STUDENT_SESSION");
  }

  req.studentSession = {
    studentId: student.id,
    tipoIdentificacion: student.tipoIdentificacion,
    numeroIdentificacion: student.numeroIdentificacion,
    nombres: student.nombres,
    apellidos: student.apellidos,
    grado: student.grado,
    schoolId: student.schoolId,
    groupId: student.groupId
  };

  next();
};
