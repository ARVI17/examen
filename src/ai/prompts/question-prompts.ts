export type PromptGenerateQuestionInput = {
  area: string;
  materia?: string;
  tema?: string;
  dificultad?: string;
  contexto: string;
  fuente: string;
  evitarDuplicados?: string[];
};

export const buildGenerateQuestionPrompt = (input: PromptGenerateQuestionInput) => {
  const duplicatesBlock =
    input.evitarDuplicados && input.evitarDuplicados.length > 0
      ? `\nPreguntas a evitar (por posible duplicado):\n- ${input.evitarDuplicados.join("\n- ")}`
      : "";

  return [
    "Tarea: generar UNA pregunta de seleccion unica para simulador academico.",
    "Reglas obligatorias:",
    "1) Usa SOLO el contexto entregado; no inventes datos externos.",
    "2) Redacta enunciado claro, sin ambiguedad.",
    "3) Entrega exactamente 4 opciones.",
    "4) Marca exactamente una opcion correcta.",
    "5) Incluye explicacion breve y verificable en el contexto.",
    "6) Incluye tema, materia y dificultad.",
    "7) Incluye la fuente utilizada.",
    "8) Responde unicamente JSON valido con esta estructura:",
    '{"enunciado":"","opciones":[{"texto_opcion":"","es_correcta":false}],"explicacion":"","tema":"","materia":"","dificultad":"","fuente":"","estado":"BORRADOR","metadatos":{"modelo":"","version":"","notas":""}}',
    "",
    `Area: ${input.area}`,
    `Materia: ${input.materia ?? "NO_ESPECIFICADA"}`,
    `Tema: ${input.tema ?? "NO_ESPECIFICADO"}`,
    `Dificultad objetivo: ${input.dificultad ?? "MEDIO"}`,
    `Fuente: ${input.fuente}`,
    "",
    "Contexto:",
    input.contexto,
    duplicatesBlock
  ].join("\n");
};

export type PromptValidateQuestionInput = {
  contexto: string;
  preguntaJson: string;
};

export const buildValidateQuestionPrompt = (input: PromptValidateQuestionInput) => {
  return [
    "Tarea: validar calidad de pregunta para simulador.",
    "Debes revisar:",
    "1) Claridad del enunciado.",
    "2) Existencia de una sola respuesta correcta.",
    "3) Coherencia con la fuente/contexto.",
    "4) Dificultad razonable para el tema.",
    "5) Riesgo de duplicado o similitud alta.",
    "Responde solo JSON valido con esta estructura:",
    '{"estado_sugerido":"aprobar|corregir|rechazar","hallazgos":[""],"nivel_riesgo":"bajo|medio|alto","resumen":""}',
    "",
    "Contexto de referencia:",
    input.contexto,
    "",
    "Pregunta a validar (JSON):",
    input.preguntaJson
  ].join("\n");
};

