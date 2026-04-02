import dotenv from "dotenv";
import path from "path";

dotenv.config();

const parsedPort = Number(process.env.PORT ?? 4000);
const parsedRateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);
const parsedRateLimitMax = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120);
const parsedAuthRateLimitWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60000);
const parsedAuthRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? 20);
const parsedAuthWrongByIp = Number(process.env.AUTH_LOGIN_MAX_WRONG_BY_IP ?? 50);
const parsedAuthWrongByUserIp = Number(process.env.AUTH_LOGIN_MAX_WRONG_BY_USER_IP ?? 8);
const parsedAuthBlockDurationSeconds = Number(process.env.AUTH_LOGIN_BLOCK_DURATION_SECONDS ?? 900);
const parsedAuthContextCacheTtlSeconds = Number(process.env.AUTH_CONTEXT_CACHE_TTL_SECONDS ?? 0);
const parsedFileMaxSizeMb = Number(process.env.FILE_MAX_SIZE_MB ?? 20);
const fileMaxSizeBytes = Math.max(1, parsedFileMaxSizeMb || 20) * 1024 * 1024;

const rawCorsOrigins = process.env.CORS_ORIGINS ?? "*";
const corsOrigins = rawCorsOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const rawTrustProxy = (process.env.TRUST_PROXY ?? "false").trim().toLowerCase();
const trustProxy = rawTrustProxy === "true" || rawTrustProxy === "1";

const rawCorsAllowPrivateNetwork = (process.env.CORS_ALLOW_PRIVATE_NETWORK ?? "false").trim().toLowerCase();
const corsAllowPrivateNetwork = rawCorsAllowPrivateNetwork === "true" || rawCorsAllowPrivateNetwork === "1";

const host = (process.env.HOST ?? "0.0.0.0").trim();
const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? "").trim();
const publicHostname = (process.env.PUBLIC_HOSTNAME ?? "").trim();

const fileAllowedMimeTypes = (process.env.FILE_ALLOWED_MIME_TYPES ??
  [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/json",
    "text/csv",
    "image/png",
    "image/jpeg"
  ].join(","))
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const fileAllowedExtensions = (process.env.FILE_ALLOWED_EXTENSIONS ??
  [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".json",
    ".csv",
    ".png",
    ".jpg",
    ".jpeg"
  ].join(","))
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "storage");

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host,
  publicBaseUrl,
  publicHostname,
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000,
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigins,
  corsAllowPrivateNetwork,
  trustProxy,
  rateLimitWindowMs: Number.isFinite(parsedRateLimitWindowMs) ? parsedRateLimitWindowMs : 60000,
  rateLimitMaxRequests: Number.isFinite(parsedRateLimitMax) ? parsedRateLimitMax : 120,
  authRateLimitWindowMs: Number.isFinite(parsedAuthRateLimitWindowMs) ? parsedAuthRateLimitWindowMs : 60000,
  authRateLimitMaxRequests: Number.isFinite(parsedAuthRateLimitMax) ? parsedAuthRateLimitMax : 20,
  authLoginMaxWrongByIp: Number.isFinite(parsedAuthWrongByIp) ? parsedAuthWrongByIp : 50,
  authLoginMaxWrongByUserIp: Number.isFinite(parsedAuthWrongByUserIp) ? parsedAuthWrongByUserIp : 8,
  authLoginBlockDurationSeconds: Number.isFinite(parsedAuthBlockDurationSeconds)
    ? parsedAuthBlockDurationSeconds
    : 900,
  authContextCacheTtlSeconds: Number.isFinite(parsedAuthContextCacheTtlSeconds)
    ? Math.max(0, parsedAuthContextCacheTtlSeconds)
    : 0,
  storageRoot,
  fileMaxSizeBytes,
  fileAllowedMimeTypes,
  fileAllowedExtensions
};

export const assertRequiredConfig = () => {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL no esta configurada.");
  }

  if (!config.jwtSecret) {
    throw new Error("JWT_SECRET no esta configurada.");
  }
};
