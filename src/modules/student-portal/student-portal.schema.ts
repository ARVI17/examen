import { z } from "zod";

export const studentStartAttemptSchema = z
  .object({
    prueba_id: z.string().uuid().optional(),
    pruebaId: z.string().uuid().optional(),
    strict_mode: z.boolean().optional(),
    strictMode: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.prueba_id && !value.pruebaId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "prueba_id es obligatorio" });
    }
  })
  .transform((value) => ({
    pruebaId: value.prueba_id ?? value.pruebaId!,
    strictMode: value.strict_mode ?? value.strictMode
  }));

export const studentAttemptParamsSchema = z.object({
  id: z.string().uuid("id invalido")
});

export const studentAnswerSchema = z
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
