import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import { Request } from "express";
import swaggerUi from "swagger-ui-express";
import { AppError } from "./common/errors/AppError";
import logger from "./common/logger";
import prisma from "./common/prisma";
import { httpLogger } from "./common/logger";
import { getLanUrls } from "./common/utils/network";
import { config } from "./config";
import { openApiDocument } from "./docs/openapi";
import { errorHandler } from "./middlewares/error.middleware";
import { apiRateLimiter } from "./middlewares/rate-limit.middleware";
import { sanitizeRequest } from "./middlewares/sanitize.middleware";
import apiRoutes from "./routes";

const app = express();

app.disable("x-powered-by");

if (config.trustProxy) {
  app.set("trust proxy", 1);
}

const allowAnyOrigin = config.corsOrigins.includes("*");
const privateNetworkOriginRegex =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/i;

const getRequestProtocol = (req: Request) => {
  const forwarded = req.headers["x-forwarded-proto"];

  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]?.trim() || req.protocol;
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(",")[0]?.trim() || req.protocol;
  }

  return req.protocol;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const buildPreferredBaseUrl = (req: Request) => {
  const protocol = getRequestProtocol(req);
  const host = req.get("host") ?? `localhost:${config.port}`;
  const requestBaseUrl = `${protocol}://${host}`;

  if (config.publicBaseUrl) {
    return {
      requestBaseUrl,
      preferredBaseUrl: trimTrailingSlash(config.publicBaseUrl)
    };
  }

  if (config.publicHostname) {
    const normalizedHost = config.publicHostname.trim();
    const preferredBaseUrl = (() => {
      if (/^https?:\/\//i.test(normalizedHost)) {
        return trimTrailingSlash(normalizedHost);
      }

      if (normalizedHost.includes(":")) {
        return trimTrailingSlash(`${protocol}://${normalizedHost}`);
      }

      return trimTrailingSlash(`${protocol}://${normalizedHost}:${config.port}`);
    })();

    return {
      requestBaseUrl,
      preferredBaseUrl
    };
  }

  return {
    requestBaseUrl,
    preferredBaseUrl: requestBaseUrl
  };
};

app.use(httpLogger);
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(
  cors({
    origin: allowAnyOrigin
      ? true
      : (origin, callback) => {
          if (!origin || config.corsOrigins.includes(origin)) {
            return callback(null, true);
          }

          if (config.corsAllowPrivateNetwork && privateNetworkOriginRegex.test(origin)) {
            return callback(null, true);
          }

          return callback(new AppError("Origen CORS no permitido", 403, "CORS_NOT_ALLOWED"));
        }
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeRequest);
app.use(apiRateLimiter);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (durationMs >= config.slowRequestWarnMs) {
      logger.warn(
        {
          requestId: req.id,
          method: req.method,
          url: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2))
        },
        "Slow request detectada"
      );
    }
  });

  next();
});
app.use("/admin", express.static(path.resolve(process.cwd(), "public", "admin")));
app.use("/simulador", express.static(path.resolve(process.cwd(), "public", "simulador")));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Saber11 backend activo",
    data: {
      status: "ok",
      connectionInfoUrl: "/connection-info",
      adminWebUrl: "/admin",
      simulatorWebUrl: "/simulador"
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Health check ok",
    data: {
      uptimeSeconds: Math.floor(process.uptime())
    }
  });
});

app.get("/connection-info", (req, res) => {
  const { requestBaseUrl, preferredBaseUrl } = buildPreferredBaseUrl(req);
  const localUrls = [`http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`];
  const lanUrls = getLanUrls(config.port);

  res.json({
    success: true,
    message: "Informacion de conexion para web",
    data: {
      preferredBaseUrl,
      requestBaseUrl,
      apiBaseUrl: `${requestBaseUrl}/api`,
      docsUrl: `${requestBaseUrl}/api/docs`,
      healthUrl: `${requestBaseUrl}/health`,
      preferredApiBaseUrl: `${preferredBaseUrl}/api`,
      adminWebUrl: `${requestBaseUrl}/admin`,
      simulatorWebUrl: `${requestBaseUrl}/simulador`,
      preferredAdminWebUrl: `${preferredBaseUrl}/admin`,
      preferredSimulatorWebUrl: `${preferredBaseUrl}/simulador`,
      localUrls,
      lanUrls,
      sharedLanUrls: lanUrls,
      generatedAt: new Date().toISOString()
    }
  });
});

app.get("/health/ready", async (_req, res) => {
  const startedAt = process.hrtime.bigint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    return res.json({
      success: true,
      message: "Readiness check ok",
      data: {
        database: "up",
        dbResponseMs: Number(durationMs.toFixed(2)),
        uptimeSeconds: Math.floor(process.uptime())
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Readiness check fallo por base de datos");
    return res.status(503).json({
      success: false,
      message: "Readiness check failed",
      error: {
        code: "READINESS_DB_UNAVAILABLE",
        details: null
      }
    });
  }
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/api", apiRoutes);

app.use((_req, _res, next) => {
  next(new AppError("Ruta no encontrada", 404, "NOT_FOUND"));
});

app.use(errorHandler);

export default app;

