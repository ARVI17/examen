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
