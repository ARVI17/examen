import { z } from "zod";

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const optionalString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }
    const normalized = normalizeSpaces(value);
    return normalized.length ? normalized : undefined;
  }, z.string().max(max).optional());

export const schoolParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const groupParamsSchema = z.object({
  groupId: z.string().uuid("groupId invalido")
});

export const createSchoolSchema = z.object({
  code: optionalString(80),
  name: z.preprocess((value) => normalizeSpaces(String(value ?? "")), z.string().min(2).max(180)),
  description: optionalString(3000),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
}).transform((value) => ({
  code: value.code,
  name: value.name,
  description: value.description,
  isActive: value.is_active ?? value.isActive ?? true
}));

export const updateSchoolSchema = z
  .object({
    code: optionalString(80),
    name: optionalString(180),
    description: optionalString(3000),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar"
  })
  .transform((value) => ({
    code: value.code,
    name: value.name,
    description: value.description,
    isActive: value.is_active ?? value.isActive
  }));

export const listSchoolsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(1).max(120).optional(),
    is_active: z.union([z.literal("true"), z.literal("false")]).optional(),
    isActive: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    isActive:
      value.is_active === undefined && value.isActive === undefined
        ? undefined
        : (value.is_active ?? value.isActive) === "true"
  }));

export const createSchoolGroupSchema = z
  .object({
    code: optionalString(80),
    name: z.preprocess((value) => normalizeSpaces(String(value ?? "")), z.string().min(1).max(120)),
    grade: optionalString(40),
    academic_year: z.coerce.number().int().min(2000).max(2100).optional(),
    academicYear: z.coerce.number().int().min(2000).max(2100).optional(),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .transform((value) => ({
    code: value.code,
    name: value.name,
    grade: value.grade,
    academicYear: value.academic_year ?? value.academicYear,
    isActive: value.is_active ?? value.isActive ?? true
  }));

export const updateSchoolGroupSchema = z
  .object({
    code: optionalString(80),
    name: optionalString(120),
    grade: optionalString(40),
    academic_year: z.coerce.number().int().min(2000).max(2100).optional(),
    academicYear: z.coerce.number().int().min(2000).max(2100).optional(),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar"
  })
  .transform((value) => ({
    code: value.code,
    name: value.name,
    grade: value.grade,
    academicYear: value.academic_year ?? value.academicYear,
    isActive: value.is_active ?? value.isActive
  }));

export const listSchoolGroupsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(1).max(120).optional(),
    grade: z.string().trim().min(1).max(40).optional(),
    academic_year: z.coerce.number().int().min(2000).max(2100).optional(),
    academicYear: z.coerce.number().int().min(2000).max(2100).optional(),
    is_active: z.union([z.literal("true"), z.literal("false")]).optional(),
    isActive: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    academicYear: value.academic_year ?? value.academicYear,
    isActive:
      value.is_active === undefined && value.isActive === undefined
        ? undefined
        : (value.is_active ?? value.isActive) === "true"
  }));

