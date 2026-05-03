import { FileCategory, QuestionArea } from "@prisma/client";
import { z } from "zod";

export const studentReportParamsSchema = z.object({
  numero_identificacion: z.string().min(3).max(40)
});

export const examReportParamsSchema = z.object({
  examId: z.string().uuid("examId invalido")
});

export const schoolReportParamsSchema = z.object({
  schoolId: z.string().uuid("schoolId invalido")
});

export const groupReportParamsSchema = z.object({
  groupId: z.string().uuid("groupId invalido")
});

export const reportsFilterQuerySchema = z
  .object({
    grado: z.string().optional(),
    school_id: z.string().uuid().optional(),
    group_id: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .transform((value) => ({
    ...value,
    schoolId: value.school_id,
    groupId: value.group_id
  }));

export const classroomSummaryQuerySchema = z
  .object({
    grado: z.string().optional(),
    grupo: z.string().optional(),
    institucion: z.string().optional(),
    school_id: z.string().uuid().optional(),
    group_id: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(5000).optional()
  })
  .transform((value) => ({
    ...value,
    schoolId: value.school_id,
    groupId: value.group_id,
    limit: value.limit ?? 3000
  }));

export const questionReadinessQuerySchema = z
  .object({
    grado_objetivo: z.string().optional(),
    target_per_area: z.coerce.number().int().positive().optional()
  })
  .transform((value) => ({
    gradoObjetivo: value.grado_objetivo,
    targetPerArea: value.target_per_area ?? 120
  }));

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

