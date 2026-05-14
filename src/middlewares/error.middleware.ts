import fs from "fs";
import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { AppError } from "../common/errors/AppError";
import logger from "../common/logger";
import { config } from "../config";

const cleanupUploadedFile = (req: Request) => {
  const uploadedPath = req.file?.path;

  if (!uploadedPath) {
    return;
  }

  try {
    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  } catch {
    // Sin impacto funcional: es una limpieza defensiva.
  }
};

const isMalformedJsonError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const withMeta = error as {
    name?: string;
    message?: string;
    status?: number;
    statusCode?: number;
    type?: string;
    body?: unknown;
    expose?: boolean;
  };

  const hasJsonMessage = typeof withMeta.message === "string" && withMeta.message.toLowerCase().includes("json");

  if (withMeta.type === "entity.parse.failed") {
    return true;
  }

  const status = withMeta.status ?? withMeta.statusCode;
  const looksLikeSyntax = withMeta.name === "SyntaxError";
  const hasBodyPayload = "body" in withMeta;

  return hasJsonMessage && (status === 400 || looksLikeSyntax || withMeta.expose === true || hasBodyPayload);
};

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.id || req.headers["x-request-id"] || null;
  cleanupUploadedFile(req);

  if (isMalformedJsonError(error)) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
      error: {
        code: "INVALID_JSON",
        details: null,
        requestId
      }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: {
        code: error.code,
        details: error.details ?? null,
        requestId
      }
    });
  }

  if (error instanceof multer.MulterError) {
    const multerCodeMap: Record<string, { status: number; message: string; code: string }> = {
      LIMIT_FILE_SIZE: {
        status: 400,
        message: "El archivo supera el tamano maximo permitido",
        code: "FILE_TOO_LARGE"
      },
      LIMIT_UNEXPECTED_FILE: {
        status: 400,
        message: "Campo de archivo no valido",
        code: "UNEXPECTED_FILE_FIELD"
      }
    };

    const mapped = multerCodeMap[error.code] ?? {
      status: 400,
      message: "Error de carga de archivo",
      code: "UPLOAD_ERROR"
    };

    return res.status(mapped.status).json({
      success: false,
      message: mapped.message,
      error: {
        code: mapped.code,
        details: config.nodeEnv === "development" ? error.message : null,
        requestId
      }
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Conflicto de datos unicos",
        error: {
          code: "UNIQUE_CONSTRAINT_ERROR",
          details: error.meta ?? null,
          requestId
        }
      });
    }

    if (error.code === "P2003") {
      return res.status(409).json({
        success: false,
        message: "Conflicto de integridad relacional",
        error: {
          code: "RELATION_CONSTRAINT_ERROR",
          details: error.meta ?? null,
          requestId
        }
      });
    }

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Registro no encontrado",
        error: {
          code: "NOT_FOUND",
          details: error.meta ?? null,
          requestId
        }
      });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      message: "Payload invalido para la base de datos",
      error: {
        code: "PRISMA_VALIDATION_ERROR",
        details: config.nodeEnv === "development" ? error.message : null,
        requestId
      }
    });
  }

  logger.error({ err: error, requestId }, "Unhandled error");

  const fallbackMessage = error instanceof Error ? error.message : "Error interno del servidor";

  return res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      details: config.nodeEnv === "development" ? fallbackMessage : null,
      requestId
    }
  });
};
