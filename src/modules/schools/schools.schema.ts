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

const optionalDate = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed;
}, z.date().optional());

const optionalSector = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const normalized = normalizeSpaces(String(value ?? "")).toUpperCase();
    if (!normalized) {
      return undefined;
    }
    if (normalized.includes("NO OFICIAL") || normalized.includes("PRIV")) {
      return "NO OFICIAL";
    }
    if (normalized.includes("OFICIAL") || normalized.includes("PUB")) {
      return "OFICIAL";
    }
    return normalized;
  }, z.enum(["OFICIAL", "NO OFICIAL"]).optional());

export const schoolParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const groupParamsSchema = z.object({
  groupId: z.string().uuid("groupId invalido")
});

export const createSchoolSchema = z.object({
  code: optionalString(80),
  name: z.preprocess((value) => normalizeSpaces(String(value ?? "")), z.string().min(2).max(180)),
  establecimiento: optionalString(220),
  sede: optionalString(220),
  departamento: optionalString(120),
  municipio: optionalString(120),
  departamento_codigo: optionalString(8),
  departamentoCodigo: optionalString(8),
  municipio_codigo: optionalString(8),
  municipioCodigo: optionalString(8),
  sector_original: optionalString(120),
  sectorOriginal: optionalString(120),
  sector_normalizado: optionalSector,
  sectorNormalizado: optionalSector,
  zona: optionalString(40),
  direccion: optionalString(260),
  codigo_dane: optionalString(40),
  codigoDane: optionalString(40),
  estado_fuente: optionalString(80),
  estadoFuente: optionalString(80),
  fuente: optionalString(200),
  fecha_fuente: optionalDate,
  fechaFuente: optionalDate,
  search_label: optionalString(400),
  searchLabel: optionalString(400),
  nombre_normalizado: optionalString(240),
  nombreNormalizado: optionalString(240),
  description: optionalString(3000),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
}).transform((value) => ({
  code: value.code,
  name: value.name,
  establecimiento: value.establecimiento,
  sede: value.sede,
  departamento: value.departamento,
  municipio: value.municipio,
  departamentoCodigo: value.departamento_codigo ?? value.departamentoCodigo,
  municipioCodigo: value.municipio_codigo ?? value.municipioCodigo,
  sectorOriginal: value.sector_original ?? value.sectorOriginal,
  sectorNormalizado: value.sector_normalizado ?? value.sectorNormalizado,
  zona: value.zona,
  direccion: value.direccion,
  codigoDane: value.codigo_dane ?? value.codigoDane,
  estadoFuente: value.estado_fuente ?? value.estadoFuente,
  fuente: value.fuente,
  fechaFuente: value.fecha_fuente ?? value.fechaFuente,
  searchLabel: value.search_label ?? value.searchLabel,
  nombreNormalizado: value.nombre_normalizado ?? value.nombreNormalizado,
  description: value.description,
  isActive: value.is_active ?? value.isActive ?? true
}));

export const updateSchoolSchema = z
  .object({
    code: optionalString(80),
    name: optionalString(180),
    establecimiento: optionalString(220),
    sede: optionalString(220),
    departamento: optionalString(120),
    municipio: optionalString(120),
    departamento_codigo: optionalString(8),
    departamentoCodigo: optionalString(8),
    municipio_codigo: optionalString(8),
    municipioCodigo: optionalString(8),
    sector_original: optionalString(120),
    sectorOriginal: optionalString(120),
    sector_normalizado: optionalSector,
    sectorNormalizado: optionalSector,
    zona: optionalString(40),
    direccion: optionalString(260),
    codigo_dane: optionalString(40),
    codigoDane: optionalString(40),
    estado_fuente: optionalString(80),
    estadoFuente: optionalString(80),
    fuente: optionalString(200),
    fecha_fuente: optionalDate,
    fechaFuente: optionalDate,
    search_label: optionalString(400),
    searchLabel: optionalString(400),
    nombre_normalizado: optionalString(240),
    nombreNormalizado: optionalString(240),
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
    establecimiento: value.establecimiento,
    sede: value.sede,
    departamento: value.departamento,
    municipio: value.municipio,
    departamentoCodigo: value.departamento_codigo ?? value.departamentoCodigo,
    municipioCodigo: value.municipio_codigo ?? value.municipioCodigo,
    sectorOriginal: value.sector_original ?? value.sectorOriginal,
    sectorNormalizado: value.sector_normalizado ?? value.sectorNormalizado,
    zona: value.zona,
    direccion: value.direccion,
    codigoDane: value.codigo_dane ?? value.codigoDane,
    estadoFuente: value.estado_fuente ?? value.estadoFuente,
    fuente: value.fuente,
    fechaFuente: value.fecha_fuente ?? value.fechaFuente,
    searchLabel: value.search_label ?? value.searchLabel,
    nombreNormalizado: value.nombre_normalizado ?? value.nombreNormalizado,
    description: value.description,
    isActive: value.is_active ?? value.isActive
  }));

export const listSchoolsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(1).max(120).optional(),
    departamento: z.string().trim().min(1).max(120).optional(),
    municipio: z.string().trim().min(1).max(120).optional(),
    codigo_dane: z.string().trim().min(1).max(40).optional(),
    codigoDane: z.string().trim().min(1).max(40).optional(),
    sector_normalizado: z.enum(["OFICIAL", "NO OFICIAL"]).optional(),
    sectorNormalizado: z.enum(["OFICIAL", "NO OFICIAL"]).optional(),
    is_active: z.union([z.literal("true"), z.literal("false")]).optional(),
    isActive: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    codigoDane: value.codigo_dane ?? value.codigoDane,
    sectorNormalizado: value.sector_normalizado ?? value.sectorNormalizado,
    isActive:
      value.is_active === undefined && value.isActive === undefined
        ? undefined
        : (value.is_active ?? value.isActive) === "true"
  }));

export const listSchoolDepartmentsQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional()
});

export const listSchoolMunicipalitiesQuerySchema = z.object({
  departamento: z.string().trim().min(1).max(120),
  q: z.string().trim().min(1).max(120).optional()
});

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
