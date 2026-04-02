import { QuestionArea, QuestionDifficulty, QuestionType } from "@prisma/client";
import { z } from "zod";

const optionSchema = z.object({
  texto_opcion: z.string().min(1).max(500),
  es_correcta: z.boolean(),
  orden: z.number().int().positive().optional()
});

const validateSingleCorrectOption = (options: z.infer<typeof optionSchema>[], ctx: z.RefinementCtx) => {
  if (options.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Una pregunta debe tener minimo 2 opciones"
    });
    return;
  }

  const correctCount = options.filter((option) => option.es_correcta).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Una pregunta debe tener exactamente 1 opcion correcta"
    });
  }
};

export const createQuestionSchema = z
  .object({
    codigo_interno: z.string().min(3).max(80),
    area: z.nativeEnum(QuestionArea),
    competencia: z.string().min(1).max(120),
    componente: z.string().min(1).max(120),
    nivel_dificultad: z.nativeEnum(QuestionDifficulty),
    nivel_cognitivo: z.string().min(1).max(120),
    enunciado: z.string().min(1),
    contexto_texto_base: z.string().max(5000).optional(),
    tipo_pregunta: z.nativeEnum(QuestionType).default(QuestionType.SELECCION_UNICA),
    grado_objetivo: z.string().min(1).max(40),
    estado: z.boolean().optional(),
    explicacion_respuesta: z.string().max(5000).optional(),
    observaciones_docente: z.string().max(5000).optional(),
    opciones: z.array(optionSchema)
  })
  .superRefine((value, ctx) => {
    validateSingleCorrectOption(value.opciones, ctx);
  })
  .transform((value) => ({
    codigoInterno: value.codigo_interno,
    area: value.area,
    competencia: value.competencia,
    componente: value.componente,
    nivelDificultad: value.nivel_dificultad,
    nivelCognitivo: value.nivel_cognitivo,
    enunciado: value.enunciado,
    contextoTextoBase: value.contexto_texto_base,
    tipoPregunta: value.tipo_pregunta,
    gradoObjetivo: value.grado_objetivo,
    estado: value.estado ?? true,
    explicacionRespuesta: value.explicacion_respuesta,
    observacionesDocente: value.observaciones_docente,
    options: value.opciones
  }));

export const updateQuestionSchema = z
  .object({
    area: z.nativeEnum(QuestionArea).optional(),
    competencia: z.string().min(1).max(120).optional(),
    componente: z.string().min(1).max(120).optional(),
    nivel_dificultad: z.nativeEnum(QuestionDifficulty).optional(),
    nivel_cognitivo: z.string().min(1).max(120).optional(),
    enunciado: z.string().min(1).optional(),
    contexto_texto_base: z.string().max(5000).optional(),
    tipo_pregunta: z.nativeEnum(QuestionType).optional(),
    grado_objetivo: z.string().min(1).max(40).optional(),
    estado: z.boolean().optional(),
    explicacion_respuesta: z.string().max(5000).optional(),
    observaciones_docente: z.string().max(5000).optional(),
    opciones: z.array(optionSchema).optional()
  })
  .superRefine((value, ctx) => {
    if (value.opciones) {
      validateSingleCorrectOption(value.opciones, ctx);
    }

    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe enviar al menos un campo para actualizar"
      });
    }
  })
  .transform((value) => ({
    area: value.area,
    competencia: value.competencia,
    componente: value.componente,
    nivelDificultad: value.nivel_dificultad,
    nivelCognitivo: value.nivel_cognitivo,
    enunciado: value.enunciado,
    contextoTextoBase: value.contexto_texto_base,
    tipoPregunta: value.tipo_pregunta,
    gradoObjetivo: value.grado_objetivo,
    estado: value.estado,
    explicacionRespuesta: value.explicacion_respuesta,
    observacionesDocente: value.observaciones_docente,
    options: value.opciones
  }));

export const questionParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const listQuestionsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    area: z.nativeEnum(QuestionArea).optional(),
    competencia: z.string().optional(),
    nivel_dificultad: z.nativeEnum(QuestionDifficulty).optional(),
    grado_objetivo: z.string().optional(),
    estado: z.union([z.literal("true"), z.literal("false")]).optional()
  })
  .transform((value) => ({
    ...value,
    nivelDificultad: value.nivel_dificultad,
    gradoObjetivo: value.grado_objetivo,
    estado: value.estado === undefined ? undefined : value.estado === "true"
  }));
