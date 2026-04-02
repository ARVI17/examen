import { z } from "zod";

export const createPerformanceLevelSchema = z.object({
  nombre: z.string().min(1).max(80),
  minimo: z.number().min(0).max(100),
  maximo: z.number().min(0).max(100),
  scope: z.string().min(1).max(60).optional(),
  is_active: z.boolean().optional()
}).refine((value) => value.minimo <= value.maximo, {
  message: "minimo no puede ser mayor que maximo"
}).transform((value) => ({
  nombre: value.nombre,
  minimo: value.minimo,
  maximo: value.maximo,
  scope: value.scope ?? "GLOBAL",
  isActive: value.is_active ?? true
}));

export const updatePerformanceLevelSchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  minimo: z.number().min(0).max(100).optional(),
  maximo: z.number().min(0).max(100).optional(),
  scope: z.string().min(1).max(60).optional(),
  is_active: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "Debe enviar al menos un campo"
}).transform((value) => ({
  nombre: value.nombre,
  minimo: value.minimo,
  maximo: value.maximo,
  scope: value.scope,
  isActive: value.is_active
}));

export const performanceLevelParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});
