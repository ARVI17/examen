import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import logger from "./logger";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.nodeEnv === "development" ? ["error", "warn"] : ["error"]
  });

if (config.slowQueryWarnMs > 0) {
  prisma.$use(async (params, next) => {
    const startedAt = Date.now();

    try {
      return await next(params);
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= config.slowQueryWarnMs) {
        logger.warn(
          {
            model: params.model ?? null,
            action: params.action,
            durationMs
          },
          "Slow query detectada"
        );
      }
    }
  });
}

if (config.nodeEnv !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
