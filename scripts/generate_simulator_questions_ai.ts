import fs from "fs";
import path from "path";
import { PrismaClient, QuestionArea, QuestionDifficulty, QuestionGenerationStatus, QuestionType } from "@prisma/client";

const distance = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);

  for (let j = 0; j <= right.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + substitutionCost);
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
};

type CorpusChunk = {
  id: string;
  source_relative_path: string;
  source_logical_path: string;
  source_sha256: string;
  area_refinada: string;
  area_proyecto: string | null;
  categoria_proyecto: string;
  tipo_prueba_proyecto: string;
  grado_objetivo: string;
  ingest_priority: string;
  confidence: string;
  reason: string;
  chunk_index: number;
  chunk_chars: number;
  text_hash: string;
  text: string;
};

type GeneratedOption = {
  texto_opcion: string;
  es_correcta: boolean;
};

type GeneratedQuestion = {
  area: QuestionArea;
  competencia: string;
  componente: string;
  nivel_dificultad: QuestionDifficulty;
  nivel_cognitivo: string;
  enunciado: string;
  contexto_texto_base?: string;
  grado_objetivo: string;
  explicacion_respuesta: string;
  opciones: GeneratedOption[];
  fuente_chunk_ids: string[];
};

type GenerationPayload = {
  questions: GeneratedQuestion[];
};

type InvalidItem = {
  index: number;
  reason: string;
};

type ReviewItem = {
  index: number;
  area: QuestionArea;
  score: number;
  accepted: boolean;
  maxSimilarityExisting: number;
  maxSimilarityGenerated: number;
  reasons: string[];
  preview: string;
};

type AiProvider = "ollama" | "openai_compatible" | "openai";

const argv = process.argv.slice(2);

const hasFlag = (name: string) => argv.includes(`--${name}`);

const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }

  const [, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const parseSet = (raw: string) => {
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
};

const normalizeText = (value: string) => {
  return value
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const fixCommonMojibake = (value: string) => {
  const source = value || "";
  if (!source || !/[ÃÂâ€]/.test(source)) {
    return source;
  }

  const candidate = Buffer.from(source, "latin1").toString("utf8");
  const badPattern = /[ÃÂâ€]/g;
  const badSource = (source.match(badPattern) || []).length;
  const badCandidate = (candidate.match(badPattern) || []).length;

  return badCandidate < badSource ? candidate : source;
};

const sanitizeContentText = (value: string) => normalizeText(fixCommonMojibake(value));

const normalizeForSimilarity = (value: string) => {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const similarityScore = (left: string, right: string) => {
  const a = normalizeForSimilarity(left);
  const b = normalizeForSimilarity(right);
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const maxLen = Math.max(a.length, b.length, 1);
  const dist = distance(a, b);
  return Math.max(0, 1 - dist / maxLen);
};

const similarityScoreNormalized = (leftNormalized: string, rightNormalized: string) => {
  const a = leftNormalized.trim();
  const b = rightNormalized.trim();
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const maxLen = Math.max(a.length, b.length, 1);
  const dist = distance(a, b);
  return Math.max(0, 1 - dist / maxLen);
};

const areaList = new Set(Object.values(QuestionArea));
const difficultyList = new Set(Object.values(QuestionDifficulty));

const areaGuidance: Record<
  QuestionArea,
  {
    competencias: string[];
    componentes: string[];
    nivelesCognitivos: string[];
    distribucionSugerida?: string;
  }
> = {
  LECTURA_CRITICA: {
    competencias: [
      "Identificar y ubicar informacion local",
      "Relacionar e interpretar informacion",
      "Evaluar y reflexionar sobre contenido y forma del texto"
    ],
    componentes: ["Semantico", "Sintactico", "Pragmatico"],
    nivelesCognitivos: ["Comprension", "Analisis", "Evaluacion"],
    distribucionSugerida:
      "Afirmaciones: identificar/ubicar informacion local 25%, relacionar/interpretar 42%, evaluar/reflexionar 33%"
  },
  MATEMATICAS: {
    competencias: ["Interpretacion y representacion", "Formulacion y ejecucion", "Argumentacion"],
    componentes: ["Numerico variacional", "Geometrico metrico", "Aleatorio", "Algebraico"],
    nivelesCognitivos: ["Aplicacion", "Analisis", "Razonamiento cuantitativo"],
    distribucionSugerida: "Interpretacion/representacion 34%, Formulacion/ejecucion 43%, Argumentacion 23%"
  },
  SOCIALES_CIUDADANAS: {
    competencias: ["Pensamiento social", "Interpretacion y analisis de perspectivas", "Pensamiento sistemico y reflexivo"],
    componentes: ["Historia", "Geografia", "Constitucion y democracia", "Etica y ciudadania"],
    nivelesCognitivos: ["Comprension", "Analisis", "Evaluacion"],
    distribucionSugerida: "Pensamiento social 30%, Interpretacion/analisis de perspectivas 40%, Pensamiento reflexivo/sistemico 30%"
  },
  CIENCIAS_NATURALES: {
    competencias: ["Uso comprensivo del conocimiento cientifico", "Explicacion de fenomenos", "Indagacion"],
    componentes: ["Biologico", "Fisico", "Quimico", "Ciencia tecnologia y sociedad"],
    nivelesCognitivos: ["Comprension", "Aplicacion", "Analisis"],
    distribucionSugerida:
      "Competencias: uso comprensivo 30%, explicacion de fenomenos 30%, indagacion 40%; componentes: biologico/fisico/quimico 30% cada uno, CTS 10%"
  },
  INGLES: {
    competencias: ["Comunicativa lectora", "Comunicativa linguistica", "Pragmatica"],
    componentes: ["Vocabulary", "Grammar", "Reading comprehension", "Language use"],
    nivelesCognitivos: ["Literal", "Inferencial", "Critico"],
    distribucionSugerida:
      "Partes de la prueba: 1) completar avisos/anuncios cortos 11%, 2) conversaciones cortas 11%, 3) monologos/dialogos 11%, 4) lectura literal 18%, 5) lectura inferencial 16%, 6) uso gramatical en contexto 11%, 7) uso gramatical y lexical con 4 opciones 22%"
  }
};

const toSupportedArea = (value: string) => {
  const area = value.trim().toUpperCase() as QuestionArea;
  return areaList.has(area) ? area : null;
};

const toSupportedDifficulty = (value: string) => {
  const level = value.trim().toUpperCase() as QuestionDifficulty;
  return difficultyList.has(level) ? level : null;
};

const buildAreaGuidanceText = (areas: string[]) => {
  const supported = areas
    .map((area) => toSupportedArea(area))
    .filter(Boolean) as QuestionArea[];

  const unique = Array.from(new Set(supported));
  if (unique.length === 0) {
    return "Sin guia de areas (no se detectaron areas validas).";
  }

  return unique
    .map((area) => {
      const guide = areaGuidance[area];
      return [
        `- ${area}:`,
        `  competencias sugeridas: ${guide.competencias.join(", ")}`,
        `  componentes sugeridos: ${guide.componentes.join(", ")}`,
        `  niveles_cognitivos sugeridos: ${guide.nivelesCognitivos.join(", ")}`,
        guide.distribucionSugerida ? `  distribucion orientativa (guia ICFES): ${guide.distribucionSugerida}` : null
      ].join("\n");
    })
    .join("\n");
};

const buildSystemPrompt = () => {
  return [
    "Eres un docente senior experto en evaluacion Saber 11 (ICFES).",
    "Tu tarea es crear preguntas nuevas de alta calidad usando SOLO el contexto suministrado.",
    "Reglas obligatorias:",
    "1. No inventes datos fuera del contexto.",
    "2. Redacta en espanol claro y academico.",
    "3. Cada pregunta debe tener exactamente 4 opciones y una sola correcta.",
    "4. Las opciones incorrectas deben ser plausibles, pedagogicas y no absurdas.",
    "5. No uses 'todas las anteriores' ni 'ninguna de las anteriores'.",
    "6. Evita pistas de respuesta por longitud, literalidad o redaccion evidente.",
    "7. No repitas preguntas ni parafrasis cercanas entre si.",
    "8. Mantener nivel de grado 11.",
    "9. Cada pregunta debe incluir explicacion_respuesta con: fundamento, descarte de distractor y habilidad evaluada.",
    "10. Usa las areas permitidas: LECTURA_CRITICA, MATEMATICAS, SOCIALES_CIUDADANAS, CIENCIAS_NATURALES, INGLES.",
    "11. Devuelve unicamente JSON valido; no agregues texto fuera del JSON.",
    "12. fuente_chunk_ids debe incluir entre 1 y 3 IDs reales del contexto, sin inventar.",
    "13. competencia, componente y nivel_cognitivo deben ser especificos y coherentes con el area.",
    "14. Si el contexto no alcanza para la cantidad solicitada, devuelve menos preguntas en lugar de inventar.",
    "15. No incluyas contenido ofensivo, discriminatorio o ajeno al objetivo academico.",
    "16. No incluyas la letra de la respuesta (A/B/C/D) en el enunciado ni en la explicacion.",
    "17. El enunciado debe contener solo la situacion/pregunta; las opciones van exclusivamente en el arreglo opciones.",
    "18. Varia la posicion de la opcion correcta entre las 4 opciones; evita patron fijo.",
    "19. Manten estilo de evaluacion por competencias tipo Saber 11: lectura cuidadosa, distractores verosimiles y foco en razonamiento.",
    "20. Sigue enfoque de diseno centrado en evidencias: competencia, afirmacion implicita y evidencia observable en la respuesta.",
    "21. Cada item debe respetar formato de seleccion multiple con unica respuesta (enunciado/tarea/opciones).",
    "22. Si el area es INGLES, escribe enunciado y opciones en ingles; deja la explicacion_respuesta en espanol pedagogico.",
    "23. Evita calcos o copias literales del contexto: transforma el caso manteniendo la evidencia academica."
  ].join("\n");
};

const buildUserPrompt = (params: {
  targetCount: number;
  areas: string[];
  grade: string;
  chunks: CorpusChunk[];
}) => {
  const areaGuidanceText = buildAreaGuidanceText(params.areas);
  const validChunkIds = params.chunks.map((chunk) => chunk.id).filter(Boolean);

  const context = params.chunks
    .map((chunk) => {
      return [
        `### CHUNK ${chunk.id}`,
        `- area_origen: ${chunk.area_proyecto ?? chunk.area_refinada}`,
        `- categoria: ${chunk.categoria_proyecto}`,
        `- tipo_prueba: ${chunk.tipo_prueba_proyecto}`,
        `- ruta: ${chunk.source_logical_path}`,
        `- contenido:`,
        sanitizeContentText(chunk.text)
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Genera ${params.targetCount} preguntas tipo ICFES para grado ${params.grade}.`,
    `Areas objetivo: ${params.areas.join(", ")}.`,
    "Distribuye las preguntas de forma equilibrada entre las areas disponibles del contexto.",
    "Usa la guia pedagogica por area para elegir competencia/componente/nivel_cognitivo.",
    "En competencia/componente evita valores genericos como 'General'.",
    "Si una pregunta usa un contexto textual, llena contexto_texto_base; si no, deja cadena vacia.",
    "Evita casi-duplicados semanticos dentro del lote; cambia situacion, datos y razonamiento.",
    "No pongas opciones A/B/C/D dentro del enunciado: solo en el arreglo opciones.",
    "Distribuye la opcion correcta entre posiciones 1, 2, 3 y 4 de forma balanceada en el lote.",
    "En el area INGLES, prioriza lectura, vocabulario y uso gramatical en contexto con textos autenticos cortos.",
    "Usa solo IDs reales en fuente_chunk_ids y no repitas IDs innecesariamente.",
    `IDs validos de fuente_chunk_ids: ${validChunkIds.join(", ")}.`,
    "Devuelve JSON valido segun el schema.",
    "",
    "Guia pedagogica por area:",
    areaGuidanceText,
    "",
    "Contexto disponible:",
    context
  ].join("\n");
};

const selectChunks = (chunks: CorpusChunk[], params: { areas: Set<string>; chunkLimit: number; grade: string }) => {
  const filtered = chunks.filter((chunk) => {
    if (params.areas.size > 0) {
      const area = chunk.area_proyecto ?? chunk.area_refinada;
      if (!params.areas.has(area)) {
        return false;
      }
    }
    if (params.grade && chunk.grado_objetivo !== params.grade) {
      return false;
    }
    return true;
  });

  const weightByCategory: Record<string, number> = {
    EXAMENES: 5,
    SIMULACROS: 4,
    BANCOS_PREGUNTAS: 3,
    MATERIALES_APOYO: 2,
    CLAVES: 1
  };

  const sorted = filtered
    .slice()
    .sort((a, b) => {
      const weightA = (weightByCategory[a.categoria_proyecto] ?? 0) + Math.min(a.chunk_chars / 900, 2);
      const weightB = (weightByCategory[b.categoria_proyecto] ?? 0) + Math.min(b.chunk_chars / 900, 2);
      if (weightA !== weightB) {
        return weightB - weightA;
      }
      return a.source_relative_path.localeCompare(b.source_relative_path);
    });

  const selected: CorpusChunk[] = [];
  const bySource = new Map<string, number>();
  const selectedIds = new Set<string>();

  const areaGroups = new Map<string, CorpusChunk[]>();
  for (const chunk of sorted) {
    const areaKey = chunk.area_proyecto ?? chunk.area_refinada;
    if (!areaGroups.has(areaKey)) {
      areaGroups.set(areaKey, []);
    }
    areaGroups.get(areaKey)!.push(chunk);
  }

  const requestedAreas = params.areas.size > 0 ? Array.from(params.areas.values()) : Array.from(areaGroups.keys());
  const perAreaTarget = Math.max(1, Math.floor(params.chunkLimit / Math.max(1, requestedAreas.length)));

  for (const area of requestedAreas) {
    const pool = areaGroups.get(area) ?? [];
    for (const chunk of pool) {
      const used = bySource.get(chunk.source_relative_path) ?? 0;
      if (used >= 3 || selectedIds.has(chunk.id)) {
        continue;
      }
      selected.push(chunk);
      selectedIds.add(chunk.id);
      bySource.set(chunk.source_relative_path, used + 1);
      if (selected.length >= params.chunkLimit) {
        return selected;
      }

      const selectedInArea = selected.filter((item) => (item.area_proyecto ?? item.area_refinada) === area).length;
      if (selectedInArea >= perAreaTarget) {
        break;
      }
    }
  }

  for (const chunk of sorted) {
    const used = bySource.get(chunk.source_relative_path) ?? 0;
    if (used >= 3 || selectedIds.has(chunk.id)) {
      continue;
    }
    selected.push(chunk);
    selectedIds.add(chunk.id);
    bySource.set(chunk.source_relative_path, used + 1);
    if (selected.length >= params.chunkLimit) {
      break;
    }
  }

  return selected;
};

const parseJsonResponse = (raw: string): GenerationPayload => {
  const tryParse = (candidate: string) => {
    const parsed = JSON.parse(candidate) as GenerationPayload;
    if (!parsed || !Array.isArray(parsed.questions)) {
      throw new Error("La respuesta IA no contiene questions[]");
    }
    return parsed;
  };

  try {
    return tryParse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = raw.slice(start, end + 1);
      return tryParse(slice);
    }
    throw new Error("No se pudo parsear JSON desde la respuesta del modelo");
  }
};

const normalizeProvider = (value: string): AiProvider => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ollama") {
    return "ollama";
  }
  if (normalized === "openai_compatible" || normalized === "openai-compatible" || normalized === "compatible") {
    return "openai_compatible";
  }
  return "openai";
};

const buildOpenAiCompatibleBaseUrl = (provider: AiProvider) => {
  if (provider === "openai") {
    return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  }

  if (provider === "openai_compatible") {
    return process.env.AI_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || "http://localhost:11434/v1";
  }

  return process.env.OLLAMA_OPENAI_BASE_URL?.trim() || process.env.AI_BASE_URL?.trim() || "http://localhost:11434/v1";
};

const resolveOllamaHost = () => {
  return (process.env.OLLAMA_BASE_URL?.trim() || process.env.OLLAMA_HOST?.trim() || "http://localhost:11434").replace(/\/+$/, "");
};

const callOpenAiCompatible = async (params: {
  endpoint: string;
  apiKey?: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  provider: AiProvider;
}) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const basePayload = {
    model: params.model,
    temperature: params.temperature,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt }
    ]
  };

  const attempts: Array<{ payload: Record<string, unknown>; label: string }> = [
    {
      label: "json_schema",
      payload: {
        ...basePayload,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "icfes_question_set",
            strict: true,
            schema: params.schema
          }
        }
      }
    }
  ];

  if (params.provider !== "openai") {
    attempts.push({
      label: "json_object",
      payload: {
        ...basePayload,
        response_format: {
          type: "json_object"
        }
      }
    });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    const response = await fetch(params.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(attempt.payload)
    });

    if (!response.ok) {
      const body = await response.text();
      errors.push(`${attempt.label}:${response.status}:${body}`);
      continue;
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };

    const content = completion.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      const merged = content
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .join("")
        .trim();
      if (merged) {
        return merged;
      }
    }

    errors.push(`${attempt.label}:respuesta_sin_content`);
  }

  throw new Error(`No se pudo obtener respuesta valida desde endpoint compatible. Detalle: ${errors.join(" || ")}`);
};

const callOllamaNative = async (params: {
  host: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  autoPull: boolean;
}) => {
  const host = params.host.replace(/\/+$/, "");

  const runChat = async () => {
    const response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
      body: JSON.stringify({
        model: params.model,
        stream: false,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt }
        ],
        format: params.schema,
        options: {
          temperature: params.temperature
        }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama /api/chat fallo (${response.status}) ${body}`.trim());
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
    };

    const content = payload.message?.content;
    if (!content || !content.trim()) {
      throw new Error("Ollama devolvio respuesta sin contenido");
    }
    return content;
  };

  try {
    return await runChat();
  } catch (error) {
    if (!params.autoPull) {
      throw error;
    }

    const pullResponse = await fetch(`${host}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.model,
        stream: false
      })
    });
    if (!pullResponse.ok) {
      const body = await pullResponse.text().catch(() => "");
      throw new Error(`Ollama /api/pull fallo (${pullResponse.status}) ${body}`.trim());
    }
    return runChat();
  }
};

const validateGenerated = (payload: GenerationPayload) => {
  const valid: GeneratedQuestion[] = [];
  const invalid: InvalidItem[] = [];

  payload.questions.forEach((question, index) => {
    const area = toSupportedArea(String(question.area ?? ""));
    if (!area) {
      invalid.push({ index, reason: "area_invalida" });
      return;
    }

    const level = toSupportedDifficulty(String(question.nivel_dificultad ?? ""));
    if (!level) {
      invalid.push({ index, reason: "nivel_dificultad_invalido" });
      return;
    }

    const options = Array.isArray(question.opciones) ? question.opciones : [];
    if (options.length !== 4) {
      invalid.push({ index, reason: "cantidad_opciones_distinta_de_4" });
      return;
    }

    const correctCount = options.filter((option) => option?.es_correcta === true).length;
    if (correctCount !== 1) {
      invalid.push({ index, reason: "opcion_correcta_invalida" });
      return;
    }

    const stem = sanitizeContentText(question.enunciado ?? "");
    if (stem.length < 20) {
      invalid.push({ index, reason: "enunciado_muy_corto" });
      return;
    }

    const rawGrade = sanitizeContentText(question.grado_objetivo ?? "11").slice(0, 40);
    const normalizedGrade = /^\d{1,2}$/.test(rawGrade) ? rawGrade : "11";

    const sanitized: GeneratedQuestion = {
      area,
      competencia: sanitizeContentText(question.competencia ?? "").slice(0, 120) || "Interpretacion",
      componente: sanitizeContentText(question.componente ?? "").slice(0, 120) || "General",
      nivel_dificultad: level,
      nivel_cognitivo: sanitizeContentText(question.nivel_cognitivo ?? "").slice(0, 120) || "Analisis",
      enunciado: stem,
      contexto_texto_base: sanitizeContentText(question.contexto_texto_base ?? "").slice(0, 5000),
      grado_objetivo: normalizedGrade,
      explicacion_respuesta: sanitizeContentText(question.explicacion_respuesta ?? "").slice(0, 5000),
      opciones: options.map((option) => ({
        texto_opcion: sanitizeContentText(option.texto_opcion ?? "").slice(0, 500),
        es_correcta: Boolean(option.es_correcta)
      })),
      fuente_chunk_ids: Array.isArray(question.fuente_chunk_ids)
        ? question.fuente_chunk_ids.map((value) => sanitizeContentText(String(value))).filter(Boolean).slice(0, 10)
        : []
    };

    if (!sanitized.explicacion_respuesta || sanitized.explicacion_respuesta.length < 20) {
      invalid.push({ index, reason: "explicacion_muy_corta" });
      return;
    }

    valid.push(sanitized);
  });

  return { valid, invalid };
};

const readCorpus = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe corpus: ${filePath}`);
  }

  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => JSON.parse(line) as CorpusChunk);
};

const saveOutput = (outputPath: string, data: unknown) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
};

const createQuestionCode = (stamp: string, area: QuestionArea, index: number) => {
  return `AI-${area}-${stamp}-${String(index + 1).padStart(4, "0")}`;
};

const evaluateQuality = (params: {
  questions: GeneratedQuestion[];
  minQualityScore: number;
  similarityThreshold: number;
  existingByArea: Map<QuestionArea, string[]>;
}) => {
  const accepted: GeneratedQuestion[] = [];
  const rejected: Array<{ index: number; reasons: string[]; score: number }> = [];
  const review: ReviewItem[] = [];

  const acceptedByArea = new Map<QuestionArea, string[]>();

  const scoreOptionQuality = (question: GeneratedQuestion, reasons: string[]) => {
    let score = 0;

    const normalizedOptions = question.opciones.map((option) => normalizeForSimilarity(option.texto_opcion));
    const uniqueOptions = new Set(normalizedOptions);
    if (uniqueOptions.size < 4) {
      reasons.push("opciones_duplicadas");
      score -= 35;
    }

    const shortOptions = question.opciones.filter((option) => normalizeText(option.texto_opcion).length < 3).length;
    if (shortOptions > 0) {
      reasons.push("opciones_muy_cortas");
      score -= 20;
    }

    const longOptions = question.opciones.filter((option) => normalizeText(option.texto_opcion).length > 260).length;
    if (longOptions > 0) {
      reasons.push("opciones_muy_largas");
      score -= 10;
    }

    return score;
  };

  const scoreMetadataQuality = (question: GeneratedQuestion, reasons: string[]) => {
    let score = 0;
    const genericMetadata = new Set(["general", "examenes", "saber_11", "saber11", "icfes"]);

    const competenciaNormalized = normalizeForSimilarity(question.competencia ?? "");
    const componenteNormalized = normalizeForSimilarity(question.componente ?? "");
    const nivelCognitivoNormalized = normalizeForSimilarity(question.nivel_cognitivo ?? "");

    if (!competenciaNormalized || genericMetadata.has(competenciaNormalized)) {
      reasons.push("competencia_generica_o_vacia");
      score -= 10;
    }
    if (!componenteNormalized || genericMetadata.has(componenteNormalized)) {
      reasons.push("componente_generico_o_vacio");
      score -= 10;
    }
    if (!nivelCognitivoNormalized || nivelCognitivoNormalized.length < 4) {
      reasons.push("nivel_cognitivo_generico_o_vacio");
      score -= 8;
    }

    return score;
  };

  const scoreStemFormatQuality = (question: GeneratedQuestion, reasons: string[]) => {
    let score = 0;
    const stemText = question.enunciado ?? "";
    if (/(^|\n)\s*[A-D][\.\):]\s+/m.test(stemText)) {
      reasons.push("enunciado_incluye_opciones");
      score -= 25;
    }
    return score;
  };

  const scoreExplanationConsistency = (question: GeneratedQuestion, reasons: string[]) => {
    let score = 0;
    const explanation = normalizeText(question.explicacion_respuesta ?? "");
    const correctIndex = question.opciones.findIndex((option) => option.es_correcta === true);

    if (correctIndex < 0) {
      reasons.push("sin_opcion_correcta");
      return score - 25;
    }

    const letterMap = ["A", "B", "C", "D"];
    const expectedLetter = letterMap[correctIndex];
    const match = explanation.match(/respuesta\s+correcta\s+es\s+([A-D])/i);
    if (match && match[1]?.toUpperCase() !== expectedLetter) {
      reasons.push("explicacion_no_coincide_con_opcion_correcta");
      score -= 30;
    }

    return score;
  };

  const maxSimilarityAgainst = (normalizedStem: string, candidates: string[]) => {
    let maxSimilarity = 0;
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - normalizedStem.length) > 180) {
        continue;
      }
      const score = similarityScoreNormalized(normalizedStem, candidate);
      if (score > maxSimilarity) {
        maxSimilarity = score;
      }
    }
    return maxSimilarity;
  };

  params.questions.forEach((question, index) => {
    const reasons: string[] = [];
    let score = 100;

    const normalizedStem = normalizeForSimilarity(question.enunciado);
    const stemLength = normalizedStem.length;

    if (stemLength < 45) {
      reasons.push("enunciado_corto");
      score -= 20;
    }
    if (stemLength > 650) {
      reasons.push("enunciado_largo");
      score -= 15;
    }

    const explanationLength = normalizeText(question.explicacion_respuesta).length;
    if (explanationLength < 60) {
      reasons.push("explicacion_corta");
      score -= 20;
    }

    if (!question.fuente_chunk_ids || question.fuente_chunk_ids.length === 0) {
      reasons.push("sin_fuentes");
      score -= 10;
    }

    score += scoreOptionQuality(question, reasons);
    score += scoreMetadataQuality(question, reasons);
    score += scoreStemFormatQuality(question, reasons);
    score += scoreExplanationConsistency(question, reasons);

    const existing = params.existingByArea.get(question.area) ?? [];
    const maxSimilarityExisting = maxSimilarityAgainst(normalizedStem, existing);
    if (maxSimilarityExisting >= params.similarityThreshold) {
      reasons.push("muy_parecida_a_banco_existente");
      score -= 50;
    }

    const generatedCandidates = acceptedByArea.get(question.area) ?? [];
    const maxSimilarityGenerated = maxSimilarityAgainst(normalizedStem, generatedCandidates);
    if (maxSimilarityGenerated >= params.similarityThreshold) {
      reasons.push("muy_parecida_a_generada_en_lote");
      score -= 45;
    }

    const acceptedRow = score >= params.minQualityScore && maxSimilarityExisting < params.similarityThreshold && maxSimilarityGenerated < params.similarityThreshold;

    review.push({
      index,
      area: question.area,
      score,
      accepted: acceptedRow,
      maxSimilarityExisting: Number(maxSimilarityExisting.toFixed(4)),
      maxSimilarityGenerated: Number(maxSimilarityGenerated.toFixed(4)),
      reasons,
      preview: question.enunciado.slice(0, 180)
    });

    if (acceptedRow) {
      accepted.push(question);
      if (!acceptedByArea.has(question.area)) {
        acceptedByArea.set(question.area, []);
      }
      acceptedByArea.get(question.area)!.push(normalizedStem);
    } else {
      rejected.push({
        index,
        reasons,
        score
      });
    }
  });

  return {
    accepted,
    rejected,
    review
  };
};

const main = async () => {
  const corpusPath = path.resolve(
    process.cwd(),
    getArgValue("corpus", path.join("storage", "bancos_preguntas", "icfes", "ai", "corpus_chunks.jsonl"))
  );
  const outputPath = path.resolve(
    process.cwd(),
    getArgValue("output", path.join("storage", "bancos_preguntas", "icfes", "ai", "generated_questions.json"))
  );
  const reviewPath = path.resolve(process.cwd(), getArgValue("review-output", outputPath.replace(/\.json$/i, ".review.json")));

  const provider = normalizeProvider(getArgValue("provider", process.env.AI_PROVIDER || "ollama"));
  const defaultModel =
    provider === "ollama"
      ? process.env.OLLAMA_MODEL || process.env.AI_MODEL || "qwen2.5:3b-instruct-q4_K_M"
      : process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const model = getArgValue("model", defaultModel);
  const targetCount = Number(getArgValue("count", "20"));
  const chunkLimit = Number(getArgValue("chunks", "10"));
  const temperature = Number(getArgValue("temperature", "0.2"));
  const grade = getArgValue("grade", "11");
  const shouldApply = hasFlag("apply");
  const previewOnly = hasFlag("preview");
  const publish = getArgValue("publish", "false").toLowerCase() === "true";
  const dbCheck = getArgValue("db-check", "true").toLowerCase() === "true";
  const includeInactiveCheck = getArgValue("include-inactive-check", "false").toLowerCase() === "true";
  const minQualityScore = Number(getArgValue("min-quality-score", "75"));
  const similarityThreshold = Number(getArgValue("max-similarity", "0.88"));
  const openAiCompatibleBase = getArgValue("base-url", buildOpenAiCompatibleBaseUrl(provider)).replace(/\/+$/, "");
  const endpoint = `${openAiCompatibleBase}/chat/completions`;
  const explicitApiKey = getArgValue("api-key", "");
  const apiKey =
    explicitApiKey ||
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    (provider === "ollama" ? "ollama" : "");
  const ollamaHost =
    provider === "ollama"
      ? openAiCompatibleBase.replace(/\/v1$/i, "")
      : resolveOllamaHost();
  const ollamaAutoPull = getArgValue("ollama-auto-pull", "false").toLowerCase() === "true";

  const rawAreaSet = new Set(Array.from(parseSet(getArgValue("areas", ""))).map((value) => value.toUpperCase()));
  const sanitizedAreaSet = new Set(Array.from(rawAreaSet.values()).filter((value) => areaList.has(value as QuestionArea)));

  const corpus = readCorpus(corpusPath);
  const selectedChunks = selectChunks(corpus, {
    areas: sanitizedAreaSet,
    chunkLimit,
    grade
  });

  if (selectedChunks.length === 0) {
    throw new Error("No hay chunks disponibles para el filtro solicitado");
  }

  const selectedAreas = sanitizedAreaSet.size > 0
    ? Array.from(sanitizedAreaSet.values())
    : Array.from(new Set(selectedChunks.map((chunk) => chunk.area_proyecto ?? chunk.area_refinada).filter((value) => areaList.has(value as QuestionArea))));

  if (selectedAreas.length === 0) {
    throw new Error("No hay areas validas para generar preguntas.");
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    targetCount,
    areas: selectedAreas,
    grade,
    chunks: selectedChunks
  });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: targetCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            area: {
              type: "string",
              enum: [
                "LECTURA_CRITICA",
                "MATEMATICAS",
                "SOCIALES_CIUDADANAS",
                "CIENCIAS_NATURALES",
                "INGLES"
              ]
            },
            competencia: { type: "string" },
            componente: { type: "string" },
            nivel_dificultad: { type: "string", enum: ["BAJO", "MEDIO", "ALTO"] },
            nivel_cognitivo: { type: "string" },
            enunciado: { type: "string" },
            contexto_texto_base: { type: "string" },
            grado_objetivo: { type: "string" },
            explicacion_respuesta: { type: "string" },
            opciones: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  texto_opcion: { type: "string" },
                  es_correcta: { type: "boolean" }
                },
                required: ["texto_opcion", "es_correcta"]
              }
            },
            fuente_chunk_ids: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: [
            "area",
            "competencia",
            "componente",
            "nivel_dificultad",
            "nivel_cognitivo",
            "enunciado",
            "contexto_texto_base",
            "grado_objetivo",
            "explicacion_respuesta",
            "opciones",
            "fuente_chunk_ids"
          ]
        }
      }
    },
    required: ["questions"]
  };

  if (previewOnly) {
    const previewPath = outputPath.replace(/\.json$/i, ".preview.json");
    saveOutput(previewPath, {
      generatedAt: new Date().toISOString(),
      provider,
      model,
      endpoint,
      ollamaHost,
      targetCount,
      chunkLimit,
      grade,
      selectedAreas,
      quality: {
        minQualityScore,
        similarityThreshold,
        dbCheck,
        includeInactiveCheck,
        publish
      },
      selectedChunks: selectedChunks.map((chunk) => ({
        id: chunk.id,
        source_relative_path: chunk.source_relative_path,
        area: chunk.area_proyecto ?? chunk.area_refinada,
        categoria: chunk.categoria_proyecto,
        chunk_chars: chunk.chunk_chars
      })),
      prompts: {
        systemPrompt,
        userPrompt
      },
      schema
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          mode: "preview",
          provider,
          model,
          previewPath,
          selectedChunks: selectedChunks.length
        },
        null,
        2
      )
    );
    return;
  }

  let rawContent = "";
  if (provider === "ollama") {
    rawContent = await callOllamaNative({
      host: ollamaHost,
      model,
      temperature,
      systemPrompt,
      userPrompt,
      schema,
      autoPull: ollamaAutoPull
    });
  } else {
    if (!apiKey) {
      throw new Error("AI_API_KEY/OPENAI_API_KEY no configurada para proveedor compatible.");
    }
    rawContent = await callOpenAiCompatible({
      endpoint,
      apiKey,
      model,
      temperature,
      systemPrompt,
      userPrompt,
      schema,
      provider
    });
  }

  const parsed = parseJsonResponse(rawContent);
  const { valid, invalid } = validateGenerated(parsed);

  const prisma = shouldApply || dbCheck ? new PrismaClient() : null;
  const existingByArea = new Map<QuestionArea, string[]>();
  let generationId: string | null = null;

  try {
    if (prisma && dbCheck) {
      const existing = await prisma.question.findMany({
        where: {
          area: { in: selectedAreas as QuestionArea[] },
          gradoObjetivo: grade,
          estado: includeInactiveCheck ? undefined : true
        },
        select: {
          area: true,
          enunciado: true
        }
      });

      for (const item of existing) {
        if (!existingByArea.has(item.area)) {
          existingByArea.set(item.area, []);
        }
        existingByArea.get(item.area)!.push(normalizeForSimilarity(item.enunciado));
      }
    }

    const qualityResult = evaluateQuality({
      questions: valid,
      minQualityScore,
      similarityThreshold,
      existingByArea
    });

    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const acceptedQuestions = qualityResult.accepted;

    const output = {
      generatedAt: new Date().toISOString(),
      provider,
      model,
      endpoint: provider === "ollama" ? ollamaHost : endpoint,
      targetCount,
      selectedChunks: selectedChunks.length,
      selectedAreas,
      quality: {
        minQualityScore,
        similarityThreshold,
        dbCheck,
        publish
      },
      validCount: valid.length,
      invalidCount: invalid.length,
      qualityAcceptedCount: acceptedQuestions.length,
      qualityRejectedCount: qualityResult.rejected.length,
      invalid,
      questions: acceptedQuestions
    };

    saveOutput(outputPath, output);
    saveOutput(reviewPath, {
      generatedAt: new Date().toISOString(),
      quality: {
        minQualityScore,
        similarityThreshold
      },
      invalid,
      review: qualityResult.review,
      rejected: qualityResult.rejected
    });

    let created = 0;
    let skippedDuplicates = 0;
    let skippedBySimilarity = 0;

    if (shouldApply) {
      if (!prisma) {
        throw new Error("Prisma no inicializado para modo apply.");
      }

      if (acceptedQuestions.length > 0) {
        const generation = await prisma.questionGeneration.create({
          data: {
            provider,
            model,
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            context: {
              selectedAreas,
              grade,
              selectedChunks: selectedChunks.map((chunk) => ({
                id: chunk.id,
                source_relative_path: chunk.source_relative_path,
                area: chunk.area_proyecto ?? chunk.area_refinada
              })),
              quality: {
                minQualityScore,
                similarityThreshold
              }
            },
            rawOutput: parsed as unknown as object,
            validation: {
              invalid,
              rejected: qualityResult.rejected,
              review: qualityResult.review
            },
            status: publish ? QuestionGenerationStatus.PUBLICADA : QuestionGenerationStatus.GENERADA_IA
          }
        });
        generationId = generation.id;
      }

      const applyAreas = Array.from(new Set(acceptedQuestions.map((item) => item.area)));
      const applyGrades = Array.from(
        new Set(
          acceptedQuestions
            .map((item) => normalizeText(item.grado_objetivo || grade))
            .concat(grade)
            .filter(Boolean)
        )
      );

      const mapKey = (area: QuestionArea, gradeValue: string) => `${area}|${gradeValue}`;
      const similarityByKey = new Map<string, string[]>();
      const exactByKey = new Map<string, Set<string>>();

      if (applyAreas.length > 0 && applyGrades.length > 0) {
        const exactRows = await prisma.question.findMany({
          where: {
            area: { in: applyAreas },
            gradoObjetivo: { in: applyGrades }
          },
          select: {
            area: true,
            gradoObjetivo: true,
            enunciado: true
          }
        });

        const similarityRows = await prisma.question.findMany({
          where: {
            area: { in: applyAreas },
            gradoObjetivo: { in: applyGrades },
            estado: includeInactiveCheck ? undefined : true
          },
          select: {
            area: true,
            gradoObjetivo: true,
            enunciado: true
          }
        });

        for (const row of exactRows) {
          const key = mapKey(row.area, normalizeText(row.gradoObjetivo || grade) || grade);
          const normalized = normalizeForSimilarity(row.enunciado);
          if (!normalized) {
            continue;
          }
          if (!exactByKey.has(key)) {
            exactByKey.set(key, new Set<string>());
          }
          exactByKey.get(key)!.add(normalized);
        }

        for (const row of similarityRows) {
          const key = mapKey(row.area, normalizeText(row.gradoObjetivo || grade) || grade);
          const normalized = normalizeForSimilarity(row.enunciado);
          if (!normalized) {
            continue;
          }
          if (!similarityByKey.has(key)) {
            similarityByKey.set(key, []);
          }
          similarityByKey.get(key)!.push(normalized);
        }
      }

      for (let index = 0; index < acceptedQuestions.length; index += 1) {
        const question = acceptedQuestions[index];
        const code = createQuestionCode(stamp, question.area, index);
        const questionGrade = normalizeText(question.grado_objetivo || grade) || grade;
        const key = mapKey(question.area, questionGrade);
        const normalizedStem = normalizeForSimilarity(question.enunciado);

        if (!exactByKey.has(key)) {
          exactByKey.set(key, new Set<string>());
        }
        if (!similarityByKey.has(key)) {
          similarityByKey.set(key, []);
        }

        const exactSet = exactByKey.get(key)!;
        const similarityList = similarityByKey.get(key)!;

        if (exactSet.has(normalizedStem)) {
          skippedDuplicates += 1;
          continue;
        }

        let maxSimilarityExisting = 0;
        for (const existingStem of similarityList) {
          if (Math.abs(existingStem.length - normalizedStem.length) > 180) {
            continue;
          }
          const current = similarityScoreNormalized(normalizedStem, existingStem);
          if (current > maxSimilarityExisting) {
            maxSimilarityExisting = current;
          }
          if (maxSimilarityExisting >= similarityThreshold) {
            break;
          }
        }

        if (maxSimilarityExisting >= similarityThreshold) {
          skippedBySimilarity += 1;
          continue;
        }

        await prisma.question.create({
          data: {
            codigoInterno: code,
            generationId: generationId ?? undefined,
            isAiGenerated: true,
            area: question.area,
            competencia: question.competencia,
            componente: question.componente,
            nivelDificultad: question.nivel_dificultad,
            nivelCognitivo: question.nivel_cognitivo,
            enunciado: question.enunciado,
            contextoTextoBase: question.contexto_texto_base || null,
            tipoPregunta: QuestionType.SELECCION_UNICA,
            gradoObjetivo: questionGrade || "11",
            estado: publish,
            explicacionRespuesta: question.explicacion_respuesta,
            observacionesDocente: [
              "Generada por IA",
              `Modelo=${model}`,
              `GenerationId=${generationId ?? "NA"}`,
              `Estado=${publish ? "PUBLICADA" : "GENERADA_IA"}`,
              `ScoreMin=${minQualityScore}`,
              `FuenteChunks=${question.fuente_chunk_ids.join(",")}`
            ].join(" | "),
            options: {
              create: question.opciones.map((option, optionIndex) => ({
                textoOpcion: option.texto_opcion,
                esCorrecta: option.es_correcta,
                orden: optionIndex + 1
              }))
            }
          }
        });
        created += 1;
        exactSet.add(normalizedStem);
        similarityList.push(normalizedStem);
      }
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          outputPath,
          reviewPath,
          provider,
          model,
          endpoint: provider === "ollama" ? ollamaHost : endpoint,
          selectedChunks: selectedChunks.length,
          valid: valid.length,
          invalid: invalid.length,
          qualityAccepted: acceptedQuestions.length,
          qualityRejected: qualityResult.rejected.length,
          generationId,
          publish,
          applied: shouldApply,
          created,
          skippedDuplicates,
          skippedBySimilarity
        },
        null,
        2
      )
    );
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : "Error generando preguntas con IA"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
