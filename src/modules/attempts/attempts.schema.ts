import { DocumentTypeCode } from "@prisma/client";
import { z } from "zod";

const studentPayloadSchema = z
  .object({
    nombres: z.string().min(1).max(120),
    apellidos: z.string().min(1).max(120),
    tipo_identificacion: z.nativeEnum(DocumentTypeCode).optional(),
    tipoIdentificacion: z.nativeEnum(DocumentTypeCode).optional(),
    numero_identificacion: z.string().min(3).max(40).optional(),
    numeroIdentificacion: z.string().min(3).max(40).optional(),
    grado: z.string().min(1).max(40)
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
    tipoIdentificacion: value.tipo_identificacion ?? value.tipoIdentificacion!,
    numeroIdentificacion: value.numero_identificacion ?? value.numeroIdentificacion!,
    grado: value.grado
  }));

export const startAttemptSchema = z
  .object({
    prueba_id: z.string().uuid().optional(),
    pruebaId: z.string().uuid().optional(),
    estudiante: studentPayloadSchema
  })
  .superRefine((value, ctx) => {
    if (!value.prueba_id && !value.pruebaId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prueba_id es obligatorio" });
    }
  })
  .transform((value) => ({
    pruebaId: value.prueba_id ?? value.pruebaId!,
    estudiante: value.estudiante
  }));

export const answerAttemptSchema = z
  .object({
    pregunta_id: z.string().uuid().optional(),
    preguntaId: z.string().uuid().optional(),
    opcion_id_seleccionada: z.string().uuid().optional(),
    opcionIdSeleccionada: z.string().uuid().optional(),
    tiempo_respuesta_segundos: z.number().int().nonnegative().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.pregunta_id && !value.preguntaId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "pregunta_id es obligatorio" });
    }

    if (!value.opcion_id_seleccionada && !value.opcionIdSeleccionada) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "opcion_id_seleccionada es obligatorio" });
    }
  })
  .transform((value) => ({
    preguntaId: value.pregunta_id ?? value.preguntaId!,
    opcionIdSeleccionada: value.opcion_id_seleccionada ?? value.opcionIdSeleccionada!,
    tiempoRespuestaSegundos: value.tiempo_respuesta_segundos
  }));

export const attemptParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const attemptExamParamsSchema = z.object({
  examId: z.string().uuid("examId invalido")
});

export const attemptStudentParamsSchema = z.object({
  numero_identificacion: z.string().min(3).max(40)
});
