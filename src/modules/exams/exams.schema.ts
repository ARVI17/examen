import { ExamStatus, QuestionArea } from "@prisma/client";
import { z } from "zod";
import { EXAM_TYPE_VALUES, GRADE_OBJECTIVE_REGEX } from "./exams.constants";
import { isSupportedExamType, normalizeExamType, normalizeGradoObjetivo, normalizeSpaces } from "./exams.utils";

const normalizeStringInput = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  return normalizeSpaces(value);
};

const requiredNormalizedString = (max: number) =>
  z.preprocess(normalizeStringInput, z.string().min(1).max(max));

const optionalNormalizedString = (max: number) =>
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

const requiredExamTypeSchema = z
  .preprocess(normalizeStringInput, z.string().min(1).max(80))
  .transform((value) => normalizeExamType(value))
  .refine((value) => isSupportedExamType(value), {
    message: `tipo_prueba invalido. Valores permitidos: ${EXAM_TYPE_VALUES.join(", ")}`
  });

const optionalExamTypeSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    return normalizeStringInput(value);
  }, z.string().min(1).max(80).optional())
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return normalizeExamType(value);
  })
  .refine((value) => value === undefined || isSupportedExamType(value), {
    message: `tipo_prueba invalido. Valores permitidos: ${EXAM_TYPE_VALUES.join(", ")}`
  });

const requiredGradeSchema = z
  .preprocess(normalizeStringInput, z.string().min(1).max(40))
  .transform((value) => normalizeGradoObjetivo(value))
  .refine((value) => GRADE_OBJECTIVE_REGEX.test(value), {
    message: "grado_objetivo invalido. Ejemplos validos: 11, 10A, 9B"
  });

const optionalGradeSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    return normalizeStringInput(value);
  }, z.string().min(1).max(40).optional())
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return normalizeGradoObjetivo(value);
  })
  .refine((value) => value === undefined || GRADE_OBJECTIVE_REGEX.test(value), {
    message: "grado_objetivo invalido. Ejemplos validos: 11, 10A, 9B"
  });

export const createExamSchema = z
  .object({
    nombre: requiredNormalizedString(180),
    descripcion: optionalNormalizedString(3000),
    tipo_prueba: requiredExamTypeSchema,
    grado_objetivo: requiredGradeSchema,
    estado: z.nativeEnum(ExamStatus).optional(),
    tiempo_limite_minutos: z.number().int().positive(),
    total_preguntas: z.number().int().nonnegative().optional(),
    puntaje_maximo: z.number().positive(),
    instrucciones: optionalNormalizedString(5000),
    fecha_publicacion: z.string().datetime().optional()
  })
  .refine(
    (value) => value.total_preguntas === undefined || value.total_preguntas <= value.puntaje_maximo,
    {
      message: "puntaje_maximo debe ser mayor o igual a total_preguntas",
      path: ["puntaje_maximo"]
    }
  )
  .transform((value) => ({
    nombre: value.nombre,
    descripcion: value.descripcion,
    tipoPrueba: value.tipo_prueba,
    gradoObjetivo: value.grado_objetivo,
    estado: value.estado ?? ExamStatus.DRAFT,
    tiempoLimiteMinutos: value.tiempo_limite_minutos,
    totalPreguntas: value.total_preguntas ?? 0,
    puntajeMaximo: value.puntaje_maximo,
    instrucciones: value.instrucciones,
    fechaPublicacion: value.fecha_publicacion ? new Date(value.fecha_publicacion) : undefined
  }));

export const updateExamSchema = z
  .object({
    nombre: optionalNormalizedString(180),
    descripcion: optionalNormalizedString(3000),
    tipo_prueba: optionalExamTypeSchema,
    grado_objetivo: optionalGradeSchema,
    estado: z.nativeEnum(ExamStatus).optional(),
    tiempo_limite_minutos: z.number().int().positive().optional(),
    total_preguntas: z.number().int().nonnegative().optional(),
    puntaje_maximo: z.number().positive().optional(),
    instrucciones: optionalNormalizedString(5000),
    fecha_publicacion: z.string().datetime().optional().nullable()
  })
  .refine(
    (value) =>
      value.total_preguntas === undefined ||
      value.puntaje_maximo === undefined ||
      value.total_preguntas <= value.puntaje_maximo,
    {
      message: "puntaje_maximo debe ser mayor o igual a total_preguntas",
      path: ["puntaje_maximo"]
    }
  )
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar"
  })
  .transform((value) => ({
    nombre: value.nombre,
    descripcion: value.descripcion,
    tipoPrueba: value.tipo_prueba,
    gradoObjetivo: value.grado_objetivo,
    estado: value.estado,
    tiempoLimiteMinutos: value.tiempo_limite_minutos,
    totalPreguntas: value.total_preguntas,
    puntajeMaximo: value.puntaje_maximo,
    instrucciones: value.instrucciones,
    fechaPublicacion:
      value.fecha_publicacion === undefined
        ? undefined
        : value.fecha_publicacion === null
          ? null
          : new Date(value.fecha_publicacion)
  }));

export const examParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const listExamsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    estado: z.nativeEnum(ExamStatus).optional(),
    tipo_prueba: optionalExamTypeSchema,
    grado_objetivo: optionalGradeSchema
  })
  .transform((value) => ({
    ...value,
    tipoPrueba: value.tipo_prueba,
    gradoObjetivo: value.grado_objetivo
  }));

export const addExamQuestionsSchema = z
  .object({
    questions: z.array(
      z.object({
        pregunta_id: z.string().uuid(),
        orden: z.number().int().positive().optional(),
        puntaje_pregunta: z.number().positive().optional(),
        area: z.nativeEnum(QuestionArea).optional(),
        metadata: z.record(z.any()).optional()
      })
    )
  })
  .refine((value) => value.questions.length > 0, {
    message: "Debe enviar al menos una pregunta"
  })
  .transform((value) => ({
    questions: value.questions.map((question) => ({
      questionId: question.pregunta_id,
      orden: question.orden,
      puntajePregunta: question.puntaje_pregunta,
      area: question.area,
      metadata: question.metadata
    }))
  }));
