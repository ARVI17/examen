import { RoleCode } from "@prisma/client";
import { z } from "zod";

const normalizedEmailSchema = z
  .string()
  .trim()
  .min(5, "email invalido")
  .max(180, "email invalido")
  .email("email invalido")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(10, "password debe tener minimo 10 caracteres")
  .max(120, "password excede longitud")
  .regex(/[a-z]/, "password debe incluir minuscula")
  .regex(/[A-Z]/, "password debe incluir mayuscula")
  .regex(/[0-9]/, "password debe incluir numero")
  .regex(/[^A-Za-z0-9]/, "password debe incluir simbolo");

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: normalizedEmailSchema,
    password: passwordSchema,
    role: z.nativeEnum(RoleCode).optional(),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional(),
    scope_school_ids: z.array(z.string().uuid("scope_school_ids invalido")).optional(),
    scope_group_ids: z.array(z.string().uuid("scope_group_ids invalido")).optional(),
    scopeSchoolIds: z.array(z.string().uuid("scopeSchoolIds invalido")).optional(),
    scopeGroupIds: z.array(z.string().uuid("scopeGroupIds invalido")).optional()
  })
  .transform((value) => ({
    name: value.name,
    email: value.email,
    password: value.password,
    role: value.role,
    isActive: value.is_active ?? value.isActive ?? true,
    scopeSchoolIds: value.scope_school_ids ?? value.scopeSchoolIds,
    scopeGroupIds: value.scope_group_ids ?? value.scopeGroupIds
  }));

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: normalizedEmailSchema.optional(),
    password: passwordSchema.optional(),
    role: z.nativeEnum(RoleCode).optional(),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional(),
    scope_school_ids: z.array(z.string().uuid("scope_school_ids invalido")).optional(),
    scope_group_ids: z.array(z.string().uuid("scope_group_ids invalido")).optional(),
    scopeSchoolIds: z.array(z.string().uuid("scopeSchoolIds invalido")).optional(),
    scopeGroupIds: z.array(z.string().uuid("scopeGroupIds invalido")).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar"
  })
  .transform((value) => ({
    name: value.name,
    email: value.email,
    password: value.password,
    role: value.role,
    isActive: value.is_active ?? value.isActive,
    scopeSchoolIds: value.scope_school_ids ?? value.scopeSchoolIds,
    scopeGroupIds: value.scope_group_ids ?? value.scopeGroupIds
  }));

export const userParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const updateUserScopesSchema = z
  .object({
    scope_school_ids: z.array(z.string().uuid("scope_school_ids invalido")).optional(),
    scope_group_ids: z.array(z.string().uuid("scope_group_ids invalido")).optional(),
    scopeSchoolIds: z.array(z.string().uuid("scopeSchoolIds invalido")).optional(),
    scopeGroupIds: z.array(z.string().uuid("scopeGroupIds invalido")).optional()
  })
  .transform((value) => ({
    scopeSchoolIds: value.scope_school_ids ?? value.scopeSchoolIds ?? [],
    scopeGroupIds: value.scope_group_ids ?? value.scopeGroupIds ?? []
  }));

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(1).max(140).optional(),
    role: z.nativeEnum(RoleCode).optional(),
    is_active: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    isActive: value.is_active === undefined ? undefined : value.is_active === "true"
  }));
