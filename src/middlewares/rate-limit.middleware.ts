import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { config } from "../config";

const normalizeIp = (req: Request) => {
  const ip = (req.ip ?? "unknown").replace(/^::ffff:/, "");
  return ipKeyGenerator(ip);
};

export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: normalizeIp,
  skip: (req) => {
    const routePath = req.path ?? "";
    return (
      routePath.startsWith("/api/exams/public") ||
      routePath === "/api/auth/login" ||
      routePath === "/api/student-auth/login" ||
      routePath === "/api/auth/register"
    );
  },
  message: {
    success: false,
    message: "Demasiadas solicitudes. Intenta nuevamente en unos segundos.",
    error: {
      code: "TOO_MANY_REQUESTS",
      details: null
    }
  }
});

export const authRouteRateLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: normalizeIp,
  message: {
    success: false,
    message: "Demasiados intentos sobre autenticacion.",
    error: {
      code: "AUTH_RATE_LIMITED",
      details: null
    }
  }
});

export const publicSimulatorRateLimiter = rateLimit({
  windowMs: config.publicSimulatorRateLimitWindowMs,
  max: config.publicSimulatorRateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: normalizeIp,
  message: {
    success: false,
    message: "Demasiadas solicitudes en simulador. Intenta nuevamente en unos segundos.",
    error: {
      code: "PUBLIC_SIMULATOR_RATE_LIMITED",
      details: null
    }
  }
});

export const adminRouteRateLimiter = rateLimit({
  windowMs: config.adminRateLimitWindowMs,
  max: config.adminRateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: normalizeIp,
  message: {
    success: false,
    message: "Demasiadas solicitudes en rutas administrativas. Intenta nuevamente en unos segundos.",
    error: {
      code: "ADMIN_RATE_LIMITED",
      details: null
    }
  }
});
