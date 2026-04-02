import { FileCategory, QuestionArea } from "@prisma/client";
import { z } from "zod";

const optionalBoolean = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    return value === "true";
  });

export const fileIdParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const uploadFileBodySchema = z
  .object({
    categoria: z.nativeEnum(FileCategory),
    descripcion: z.string().max(5000).optional(),
    grado_objetivo: z.string().max(40).optional(),
    area: z.nativeEnum(QuestionArea).optional(),
    tipo_prueba: z.string().max(80).optional()
  })
  .transform((value) => ({
    categoria: value.categoria,
    descripcion: value.descripcion,
    gradoObjetivo: value.grado_objetivo,
    area: value.area,
    tipoPrueba: value.tipo_prueba
  }));

export const updateFileBodySchema = z
  .object({
    categoria: z.nativeEnum(FileCategory).optional(),
    descripcion: z.string().max(5000).optional(),
    grado_objetivo: z.string().max(40).optional(),
    area: z.nativeEnum(QuestionArea).optional(),
    tipo_prueba: z.string().max(80).optional(),
    activo: optionalBoolean,
    is_current: optionalBoolean
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar"
  })
  .transform((value) => ({
    categoria: value.categoria,
    descripcion: value.descripcion,
    gradoObjetivo: value.grado_objetivo,
    area: value.area,
    tipoPrueba: value.tipo_prueba,
    activo: value.activo,
    isCurrent: value.is_current
  }));

export const newVersionBodySchema = z
  .object({
    categoria: z.nativeEnum(FileCategory).optional(),
    descripcion: z.string().max(5000).optional(),
    grado_objetivo: z.string().max(40).optional(),
    area: z.nativeEnum(QuestionArea).optional(),
    tipo_prueba: z.string().max(80).optional()
  })
  .transform((value) => ({
    categoria: value.categoria,
    descripcion: value.descripcion,
    gradoObjetivo: value.grado_objetivo,
    area: value.area,
    tipoPrueba: value.tipo_prueba
  }));

export const duplicateFileBodySchema = z
  .object({
    nombre_original: z.string().max(255).optional(),
    categoria: z.nativeEnum(FileCategory).optional(),
    descripcion: z.string().max(5000).optional(),
    grado_objetivo: z.string().max(40).optional(),
    area: z.nativeEnum(QuestionArea).optional(),
    tipo_prueba: z.string().max(80).optional()
  })
  .transform((value) => ({
    nombreOriginal: value.nombre_original,
    categoria: value.categoria,
    descripcion: value.descripcion,
    gradoObjetivo: value.grado_objetivo,
    area: value.area,
    tipoPrueba: value.tipo_prueba
  }));

const baseListFilesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  categoria: z.nativeEnum(FileCategory).optional(),
  grado_objetivo: z.string().optional(),
  area: z.nativeEnum(QuestionArea).optional(),
  tipo_prueba: z.string().optional(),
  nombre: z.string().optional(),
  version: z.coerce.number().int().positive().optional(),
  parent_file_id: z.string().uuid().optional(),
  activo: optionalBoolean,
  include_deleted: optionalBoolean,
  sort_by: z.enum(["created_at", "updated_at", "nombre_original"]).optional(),
  sort_order: z.enum(["asc", "desc"]).optional()
});

const toListFilters = (value: z.infer<typeof baseListFilesQuerySchema>) => ({
  page: value.page,
  limit: value.limit,
  categoria: value.categoria,
  gradoObjetivo: value.grado_objetivo,
  area: value.area,
  tipoPrueba: value.tipo_prueba,
  nombre: value.nombre,
  version: value.version,
  parentFileId: value.parent_file_id,
  activo: value.activo,
  includeDeleted: value.include_deleted ?? false,
  sortBy: value.sort_by ?? "created_at",
  sortOrder: value.sort_order ?? "desc"
});

export const listFilesQuerySchema = baseListFilesQuerySchema.transform(toListFilters);

export const searchFilesQuerySchema = baseListFilesQuerySchema
  .extend({
    q: z.string().min(1, "q es obligatorio")
  })
  .transform((value) => ({
    ...toListFilters(value),
    q: value.q
  }));

export const downloadByQuerySchema = z
  .object({
    nombre: z.string().optional(),
    categoria: z.nativeEnum(FileCategory).optional(),
    ruta_logica: z.string().optional()
  })
  .refine((value) => !!value.nombre || !!value.categoria || !!value.ruta_logica, {
    message: "Debe enviar al menos uno de: nombre, categoria o ruta_logica"
  })
  .transform((value) => ({
    nombre: value.nombre,
    categoria: value.categoria,
    rutaLogica: value.ruta_logica
  }));
