import dotenv from "dotenv";
import path from "path";

dotenv.config();

const parsedPort = Number(process.env.PORT ?? 4000);
const parsedRateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);
const parsedRateLimitMax = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120);
const parsedPublicSimulatorRateLimitWindowMs = Number(process.env.PUBLIC_SIMULATOR_RATE_LIMIT_WINDOW_MS ?? 60000);
const parsedPublicSimulatorRateLimitMax = Number(process.env.PUBLIC_SIMULATOR_RATE_LIMIT_MAX_REQUESTS ?? 1800);
const parsedAuthRateLimitWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60000);
const parsedAuthRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? 20);
const parsedAdminRateLimitWindowMs = Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS ?? 60000);
const parsedAdminRateLimitMax = Number(process.env.ADMIN_RATE_LIMIT_MAX_REQUESTS ?? 80);
const parsedAuthWrongByIp = Number(process.env.AUTH_LOGIN_MAX_WRONG_BY_IP ?? 50);
const parsedAuthWrongByUserIp = Number(process.env.AUTH_LOGIN_MAX_WRONG_BY_USER_IP ?? 8);
const parsedAuthBlockDurationSeconds = Number(process.env.AUTH_LOGIN_BLOCK_DURATION_SECONDS ?? 900);
const parsedAuthContextCacheTtlSeconds = Number(process.env.AUTH_CONTEXT_CACHE_TTL_SECONDS ?? 0);
const parsedSlowRequestWarnMs = Number(process.env.SLOW_REQUEST_WARN_MS ?? 1500);
const parsedSlowQueryWarnMs = Number(process.env.SLOW_QUERY_WARN_MS ?? 800);
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
const rawJwtSecrets = (process.env.JWT_SECRETS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const jwtVerificationSecrets = Array.from(new Set([...rawJwtSecrets, process.env.JWT_SECRET ?? ""].filter(Boolean)));
const jwtSigningSecret = jwtVerificationSecrets[0] ?? "";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host,
  publicBaseUrl,
  publicHostname,
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000,
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: jwtSigningSecret,
  jwtSigningSecret,
  jwtVerificationSecrets,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigins,
  corsAllowPrivateNetwork,
  trustProxy,
  rateLimitWindowMs: Number.isFinite(parsedRateLimitWindowMs) ? parsedRateLimitWindowMs : 60000,
  rateLimitMaxRequests: Number.isFinite(parsedRateLimitMax) ? parsedRateLimitMax : 120,
  publicSimulatorRateLimitWindowMs: Number.isFinite(parsedPublicSimulatorRateLimitWindowMs)
    ? parsedPublicSimulatorRateLimitWindowMs
    : 60000,
  publicSimulatorRateLimitMaxRequests: Number.isFinite(parsedPublicSimulatorRateLimitMax)
    ? parsedPublicSimulatorRateLimitMax
    : 1800,
  authRateLimitWindowMs: Number.isFinite(parsedAuthRateLimitWindowMs) ? parsedAuthRateLimitWindowMs : 60000,
  authRateLimitMaxRequests: Number.isFinite(parsedAuthRateLimitMax) ? parsedAuthRateLimitMax : 20,
  adminRateLimitWindowMs: Number.isFinite(parsedAdminRateLimitWindowMs) ? parsedAdminRateLimitWindowMs : 60000,
  adminRateLimitMaxRequests: Number.isFinite(parsedAdminRateLimitMax) ? parsedAdminRateLimitMax : 80,
  authLoginMaxWrongByIp: Number.isFinite(parsedAuthWrongByIp) ? parsedAuthWrongByIp : 50,
  authLoginMaxWrongByUserIp: Number.isFinite(parsedAuthWrongByUserIp) ? parsedAuthWrongByUserIp : 8,
  authLoginBlockDurationSeconds: Number.isFinite(parsedAuthBlockDurationSeconds)
    ? parsedAuthBlockDurationSeconds
    : 900,
  authContextCacheTtlSeconds: Number.isFinite(parsedAuthContextCacheTtlSeconds)
    ? Math.max(0, parsedAuthContextCacheTtlSeconds)
    : 0,
  storageRoot,
  slowRequestWarnMs: Number.isFinite(parsedSlowRequestWarnMs) ? Math.max(0, parsedSlowRequestWarnMs) : 1500,
  slowQueryWarnMs: Number.isFinite(parsedSlowQueryWarnMs) ? Math.max(0, parsedSlowQueryWarnMs) : 800,
  fileMaxSizeBytes,
  fileAllowedMimeTypes,
  fileAllowedExtensions
};

export const assertRequiredConfig = () => {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL no esta configurada.");
  }

  if (!config.jwtSigningSecret) {
    throw new Error("JWT_SECRET o JWT_SECRETS no estan configuradas.");
  }
};
