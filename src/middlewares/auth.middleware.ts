import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { RoleCode } from "@prisma/client";
import { config } from "../config";
import { AppError } from "../common/errors/AppError";
import { AuthRepository } from "../modules/auth/auth.repository";

type AuthTokenPayload = {
  id: string;
  email: string;
  role: RoleCode;
};

type CachedAuthContext = {
  email: string;
  role: RoleCode;
  isActive: boolean;
  expiresAt: number;
};

const authContextCache = new Map<string, CachedAuthContext>();

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
    isActive: user.isActive
  } as const;

  cacheAuthContext(userId, context);
  return context;
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Token no proporcionado", 401, "UNAUTHORIZED");
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    const authContext = await resolveAuthenticatedUser(payload.id);

    if (!authContext?.isActive) {
      throw new AppError("Usuario no autorizado o inactivo", 401, "UNAUTHORIZED");
    }

    req.user = {
      id: payload.id,
      email: authContext.email,
      role: authContext.role
    };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Token invalido o expirado", 401, "UNAUTHORIZED");
  }
};

export const authorize = (...roles: RoleCode[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Usuario no autenticado", 401, "UNAUTHORIZED");
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError("No autorizado para esta accion", 403, "FORBIDDEN");
    }

    next();
  };
};
