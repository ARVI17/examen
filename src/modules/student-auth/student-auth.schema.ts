import { DocumentTypeCode } from "@prisma/client";
import { z } from "zod";

const normalize = (value: unknown) => (typeof value === "string" ? value.trim() : value);

export const studentLoginSchema = z
  .object({
    tipo_identificacion: z.nativeEnum(DocumentTypeCode).optional(),
    tipoIdentificacion: z.nativeEnum(DocumentTypeCode).optional(),
    numero_identificacion: z.preprocess(normalize, z.string().min(2).max(40)).optional(),
    numeroIdentificacion: z.preprocess(normalize, z.string().min(2).max(40)).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.tipo_identificacion && !value.tipoIdentificacion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "tipo_identificacion es obligatorio" });
    }
    if (!value.numero_identificacion && !value.numeroIdentificacion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "numero_identificacion es obligatorio" });
    }
  })
  .transform((value) => ({
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion!,
    numeroIdentificacion: (value.numero_identificacion ?? value.numeroIdentificacion!).trim()
  }));
