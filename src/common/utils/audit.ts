import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { config } from "../../config";

type AuditPayload = {
  entidad: string;
  entidadId: string;
  accion: string;
  datos: unknown;
  userId?: string;
};

export const createAuditLog = async (payload: AuditPayload) => {
  try {
    await prisma.auditLog.create({
      data: {
        entidad: payload.entidad,
        entidadId: payload.entidadId,
        accion: payload.accion,
        datos: payload.datos as Prisma.InputJsonValue,
        userId: payload.userId
      }
    });
  } catch (error) {
    if (config.nodeEnv === "development") {
      console.error("No se pudo guardar audit log:", error);
    }
  }
};
