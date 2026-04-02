import { randomUUID } from "crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { config } from "../config";

const logger = pino({
  level: config.nodeEnv === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "passwordHash"
    ],
    remove: true
  }
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const requestIdHeader = req.headers["x-request-id"];

    if (typeof requestIdHeader === "string" && requestIdHeader.trim().length > 0) {
      return requestIdHeader;
    }

    return randomUUID();
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) {
      return "error";
    }

    if (res.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers["user-agent"]
      };
    }
  }
});

export default logger;
