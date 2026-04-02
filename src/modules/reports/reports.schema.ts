import { FileCategory, QuestionArea } from "@prisma/client";
import { z } from "zod";

export const studentReportParamsSchema = z.object({
  numero_identificacion: z.string().min(3).max(40)
});

export const examReportParamsSchema = z.object({
  examId: z.string().uuid("examId invalido")
});

export const reportsFilterQuerySchema = z.object({
  grado: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export const filesCoverageQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    year_from: z.coerce.number().int().min(2000).max(2100).optional(),
    year_to: z.coerce.number().int().min(2000).max(2100).optional(),
    categoria: z.nativeEnum(FileCategory).optional(),
    area: z.nativeEnum(QuestionArea).optional(),
    tipo_prueba: z.string().min(1).max(120).optional(),
    activo: z.union([z.literal("true"), z.literal("false")]).optional(),
    include_deleted: z.union([z.literal("true"), z.literal("false")]).optional(),
    only_saber11: z.union([z.literal("true"), z.literal("false")]).optional(),
    q: z.string().min(1).max(120).optional()
  })
  .superRefine((value, ctx) => {
    if (value.year_from && value.year_to && value.year_from > value.year_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "year_from no puede ser mayor que year_to"
      });
    }
  })
  .transform((value) => ({
    ...value,
    yearFrom: value.year_from,
    yearTo: value.year_to,
    tipoPrueba: value.tipo_prueba,
    includeDeleted: value.include_deleted === "true",
    onlySaber11: value.only_saber11 === undefined ? true : value.only_saber11 === "true",
    activo: value.activo === undefined ? undefined : value.activo === "true"
  }));
