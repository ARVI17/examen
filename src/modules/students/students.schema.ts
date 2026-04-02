import { DocumentTypeCode } from "@prisma/client";
import { z } from "zod";

const documentTypeSchema = z.nativeEnum(DocumentTypeCode, {
  errorMap: () => ({ message: "tipo_identificacion invalido" })
});

const numeroDocumentoSchema = z
  .string()
  .min(3, "numero_identificacion es obligatorio")
  .max(40, "numero_identificacion excede longitud");

const studentBaseSchema = z
  .object({
    nombres: z.string().min(1, "nombres es obligatorio").max(120),
    apellidos: z.string().min(1, "apellidos es obligatorio").max(120),
    grado: z.string().min(1, "grado es obligatorio").max(40),
    tipo_identificacion: documentTypeSchema.optional(),
    tipoIdentificacion: documentTypeSchema.optional(),
    numero_identificacion: numeroDocumentoSchema.optional(),
    numeroIdentificacion: numeroDocumentoSchema.optional()
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
    nombres: value.nombres,
    apellidos: value.apellidos,
    grado: value.grado,
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion!,
    numeroIdentificacion: value.numero_identificacion ?? value.numeroIdentificacion!
  }));

export const createStudentSchema = studentBaseSchema;

export const updateStudentSchema = z
  .object({
    nombres: z.string().min(1).max(120).optional(),
    apellidos: z.string().min(1).max(120).optional(),
    grado: z.string().min(1).max(40).optional(),
    tipo_identificacion: documentTypeSchema.optional(),
    tipoIdentificacion: documentTypeSchema.optional()
  })
  .refine(
    (value) =>
      value.nombres !== undefined ||
      value.apellidos !== undefined ||
      value.grado !== undefined ||
      value.tipo_identificacion !== undefined ||
      value.tipoIdentificacion !== undefined,
    {
      message: "Debe enviar al menos un campo para actualizar"
    }
  )
  .transform((value) => ({
    nombres: value.nombres,
    apellidos: value.apellidos,
    grado: value.grado,
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion
  }));

export const studentParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const studentDocumentParamsSchema = z.object({
  numero_identificacion: numeroDocumentoSchema
});

export const listStudentsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    nombres: z.string().optional(),
    apellidos: z.string().optional(),
    grado: z.string().optional(),
    numero_identificacion: z.string().optional(),
    numeroIdentificacion: z.string().optional(),
    tipo_identificacion: documentTypeSchema.optional(),
    tipoIdentificacion: documentTypeSchema.optional(),
    include_deleted: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    numeroIdentificacion: value.numero_identificacion ?? value.numeroIdentificacion,
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion,
    includeDeleted: value.include_deleted === "true"
  }));
