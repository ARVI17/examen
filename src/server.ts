import app from "./app";
import logger from "./common/logger";
import prisma from "./common/prisma";
import { getLanUrls } from "./common/utils/network";
import { assertRequiredConfig, config } from "./config";

const bootstrap = async () => {
  assertRequiredConfig();

  app.listen(config.port, config.host, () => {
    const localUrl = `http://localhost:${config.port}`;
    const lanUrls = getLanUrls(config.port);

    logger.info(
      {
        host: config.host,
        port: config.port,
        localUrl,
        lanUrls
      },
      "API ejecutandose"
    );
  });
};

const gracefulShutdown = async (reason?: string, exitCode = 0) => {
  if (reason) {
    logger.warn({ reason }, "Cerrando servicio");
  }

  await prisma.$disconnect();
  process.exit(exitCode);
};

bootstrap().catch(async (error) => {
  logger.error({ err: error }, "No se pudo iniciar el servidor");
  await prisma.$disconnect();
  process.exit(1);
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void gracefulShutdown("uncaughtException", 1);
});

