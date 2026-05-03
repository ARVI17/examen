import { DocumentTypeCode } from "@prisma/client";
import { z } from "zod";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  return value.trim();
};

const optionalString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
  }, z.string().max(max).optional());

const optionalNullableString = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }, z.string().max(max).nullable().optional());

const documentTypeSchema = z.nativeEnum(DocumentTypeCode, {
  errorMap: () => ({ message: "tipo_identificacion invalido" })
});

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha_nacimiento invalida (YYYY-MM-DD)");

const numeroDocumentoSchema = z
  .string()
  .min(3, "numero_identificacion es obligatorio")
  .max(40, "numero_identificacion excede longitud");

const studentBaseSchema = z
  .object({
    nombres: z.preprocess(normalizeString, z.string().min(1, "nombres es obligatorio").max(120)),
    apellidos: z.preprocess(normalizeString, z.string().min(1, "apellidos es obligatorio").max(120)),
    grado: z.preprocess(normalizeString, z.string().min(1, "grado es obligatorio").max(40)),
    tipo_identificacion: documentTypeSchema.optional(),
    tipoIdentificacion: documentTypeSchema.optional(),
    numero_identificacion: z.preprocess(normalizeString, numeroDocumentoSchema).optional(),
    numeroIdentificacion: z.preprocess(normalizeString, numeroDocumentoSchema).optional(),
    school_id: z.string().uuid().optional(),
    group_id: z.string().uuid().optional(),
    fecha_nacimiento: dateStringSchema.optional(),
    genero: optionalString(80),
    institucion: optionalString(180),
    jornada: optionalString(80),
    grupo: optionalString(80),
    departamento: optionalString(120),
    municipio: optionalString(120),
    email: optionalString(180),
    telefono: optionalString(60),
    acudiente_nombre: optionalString(180),
    acudiente_email: optionalString(180),
    acudiente_telefono: optionalString(60)
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
    numeroIdentificacion: value.numero_identificacion ?? value.numeroIdentificacion!,
    schoolId: value.school_id,
    groupId: value.group_id,
    fechaNacimiento: value.fecha_nacimiento ? new Date(value.fecha_nacimiento) : undefined,
    genero: value.genero,
    institucion: value.institucion,
    jornada: value.jornada,
    grupo: value.grupo,
    departamento: value.departamento,
    municipio: value.municipio,
    email: value.email?.toLowerCase(),
    telefono: value.telefono,
    acudienteNombre: value.acudiente_nombre,
    acudienteEmail: value.acudiente_email?.toLowerCase(),
    acudienteTelefono: value.acudiente_telefono
  }));

export const createStudentSchema = studentBaseSchema;

export const updateStudentSchema = z
  .object({
    nombres: optionalString(120),
    apellidos: optionalString(120),
    grado: optionalString(40),
    tipo_identificacion: documentTypeSchema.optional(),
    tipoIdentificacion: documentTypeSchema.optional(),
    school_id: z.string().uuid().optional().nullable(),
    group_id: z.string().uuid().optional().nullable(),
    fecha_nacimiento: dateStringSchema.optional().nullable(),
    genero: optionalNullableString(80),
    institucion: optionalNullableString(180),
    jornada: optionalNullableString(80),
    grupo: optionalNullableString(80),
    departamento: optionalNullableString(120),
    municipio: optionalNullableString(120),
    email: optionalNullableString(180),
    telefono: optionalNullableString(60),
    acudiente_nombre: optionalNullableString(180),
    acudiente_email: optionalNullableString(180),
    acudiente_telefono: optionalNullableString(60)
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar"
  })
  .transform((value) => ({
    nombres: value.nombres,
    apellidos: value.apellidos,
    grado: value.grado,
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion,
    schoolId: value.school_id === undefined ? undefined : value.school_id,
    groupId: value.group_id === undefined ? undefined : value.group_id,
    fechaNacimiento:
      value.fecha_nacimiento === undefined
        ? undefined
        : value.fecha_nacimiento === null
          ? null
          : new Date(value.fecha_nacimiento),
    genero: value.genero,
    institucion: value.institucion,
    jornada: value.jornada,
    grupo: value.grupo,
    departamento: value.departamento,
    municipio: value.municipio,
    email: value.email === null ? null : value.email?.toLowerCase(),
    telefono: value.telefono,
    acudienteNombre: value.acudiente_nombre,
    acudienteEmail: value.acudiente_email === null ? null : value.acudiente_email?.toLowerCase(),
    acudienteTelefono: value.acudiente_telefono
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
    school_id: z.string().uuid().optional(),
    group_id: z.string().uuid().optional(),
    institucion: z.string().optional(),
    grupo: z.string().optional(),
    include_deleted: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    numeroIdentificacion: value.numero_identificacion ?? value.numeroIdentificacion,
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion,
    schoolId: value.school_id,
    groupId: value.group_id,
    includeDeleted: value.include_deleted === "true"
  }));
