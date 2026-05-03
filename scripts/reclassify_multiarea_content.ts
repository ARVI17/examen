import fs from "fs";
import path from "path";
import { PrismaClient, QuestionArea } from "@prisma/client";

type ManifestItem = {
  source_relative_path: string;
  source_absolute_path: string;
  coleccion: string;
  area_refinada: string;
  area_proyecto: QuestionArea | null;
  categoria_proyecto: string;
  tipo_prueba_proyecto: string;
  grado_objetivo: string;
  extension: string;
  size_bytes: number;
  size_kb: number;
  sha256: string;
  confidence: string;
  reason: string;
  ingest_priority: string;
  descripcion_sugerida: string;
};

type ManifestRoot = {
  generated_at: string;
  source_root: string | null;
  total_files: number;
  files: ManifestItem[];
};

type Confidence = "alta" | "media" | "baja";

type ScoreDetail = {
  term: string;
  occurrences: number;
  weight: number;
  source: "text" | "path";
};

type AreaScore = {
  area: QuestionArea;
  score: number;
  details: ScoreDetail[];
};

type EvaluationRow = {
  source_relative_path: string;
  extension: string;
  size_bytes: number;
  extraction_status: "ok" | "skipped" | "error";
  extraction_error: string;
  text_chars: number;
  top_area: QuestionArea | "MULTI_AREA" | "";
  top_score: number;
  second_area: QuestionArea | "MULTI_AREA" | "";
  second_score: number;
  margin: number;
  ratio: number;
  decision: "RECLASSIFY" | "KEEP_MULTI_AREA" | "UNSUPPORTED" | "ERROR";
  suggested_area_refined: string;
  suggested_area_project: QuestionArea | null;
  suggested_confidence: Confidence;
  reason: string;
  top_hits: string;
  excerpt: string;
};

type Suggestion = {
  source_relative_path: string;
  source_logical_path: string;
  area: QuestionArea;
  confidence: Confidence;
  reason: string;
  topScore: number;
  secondScore: number;
  margin: number;
  ratio: number;
};

const pdfParse = require("pdf-parse") as (
  dataBuffer: Buffer,
  options?: { max?: number }
) => Promise<{ text: string; numpages?: number }>;

const mammoth = require("mammoth") as {
  extractRawText: (input: { path: string } | { buffer: Buffer }) => Promise<{
    value: string;
    messages: { type: string; message: string }[];
  }>;
};

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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizePlain = (value: string) => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const countOccurrences = (text: string, term: string) => {
  if (!term || !text) {
    return 0;
  }

  const normalizedTerm = normalizePlain(term);
  if (!normalizedTerm) {
    return 0;
  }

  const isPhrase = normalizedTerm.includes(" ");
  const pattern = isPhrase
    ? new RegExp(`(?:^|\\s)${escapeRegExp(normalizedTerm)}(?:$|\\s)`, "g")
    : new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "g");

  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

const sanitizeText = (value: string, maxChars: number) => {
  return value
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
};

const csvEscape = (value: unknown) => {
  const str = String(value ?? "");
  const escaped = str.replace(/"/g, "\"\"");
  return `"${escaped}"`;
};

const confidenceRank: Record<Confidence, number> = {
  baja: 1,
  media: 2,
  alta: 3
};

const parseConfidence = (value: string): Confidence => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "alta" || normalized === "media" || normalized === "baja") {
    return normalized;
  }
  return "alta";
};

const isConfidenceAtLeast = (value: Confidence, expected: Confidence) => {
  return confidenceRank[value] >= confidenceRank[expected];
};

const TERM_WEIGHTS: Record<QuestionArea, Array<{ term: string; weight: number }>> = {
  MATEMATICAS: [
    { term: "matematicas", weight: 4 },
    { term: "algebra", weight: 3 },
    { term: "geometria", weight: 3 },
    { term: "trigonometria", weight: 4 },
    { term: "estadistica", weight: 3 },
    { term: "probabilidad", weight: 3 },
    { term: "ecuacion", weight: 3 },
    { term: "funcion", weight: 2 },
    { term: "razonamiento cuantitativo", weight: 4 },
    { term: "porcentaje", weight: 2 },
    { term: "fraccion", weight: 2 },
    { term: "perimetro", weight: 2 },
    { term: "area del triangulo", weight: 3 },
    { term: "logaritmo", weight: 3 },
    { term: "seno", weight: 2 },
    { term: "coseno", weight: 2 },
    { term: "tangente", weight: 2 },
    { term: "derivada", weight: 2 }
  ],
  LECTURA_CRITICA: [
    { term: "lectura critica", weight: 5 },
    { term: "comprension lectora", weight: 4 },
    { term: "texto anterior", weight: 3 },
    { term: "de acuerdo con el texto", weight: 3 },
    { term: "idea principal", weight: 3 },
    { term: "tesis", weight: 3 },
    { term: "argumento", weight: 2 },
    { term: "inferir", weight: 2 },
    { term: "proposito comunicativo", weight: 3 },
    { term: "narrador", weight: 2 },
    { term: "parrafo", weight: 2 },
    { term: "enunciador", weight: 2 },
    { term: "intencion del autor", weight: 3 }
  ],
  SOCIALES_CIUDADANAS: [
    { term: "sociales y ciudadanas", weight: 5 },
    { term: "competencias ciudadanas", weight: 5 },
    { term: "democracia", weight: 4 },
    { term: "constitucion", weight: 4 },
    { term: "estado", weight: 2 },
    { term: "gobierno", weight: 2 },
    { term: "ciudadania", weight: 3 },
    { term: "derechos humanos", weight: 4 },
    { term: "historia", weight: 2 },
    { term: "geografia", weight: 3 },
    { term: "conflicto armado", weight: 4 },
    { term: "participacion ciudadana", weight: 4 },
    { term: "economia", weight: 2 }
  ],
  CIENCIAS_NATURALES: [
    { term: "ciencias naturales", weight: 5 },
    { term: "biologia", weight: 4 },
    { term: "quimica", weight: 4 },
    { term: "fisica", weight: 4 },
    { term: "ecosistema", weight: 3 },
    { term: "celula", weight: 3 },
    { term: "atomo", weight: 3 },
    { term: "molecula", weight: 3 },
    { term: "reaccion quimica", weight: 4 },
    { term: "tabla periodica", weight: 4 },
    { term: "genetica", weight: 3 },
    { term: "energia", weight: 2 },
    { term: "movimiento", weight: 2 },
    { term: "aceleracion", weight: 2 },
    { term: "fuerza", weight: 2 }
  ],
  INGLES: [
    { term: "english", weight: 4 },
    { term: "ingles", weight: 4 },
    { term: "reading comprehension", weight: 5 },
    { term: "according to the text", weight: 4 },
    { term: "choose the correct answer", weight: 4 },
    { term: "present perfect", weight: 4 },
    { term: "simple past", weight: 4 },
    { term: "vocabulary", weight: 3 },
    { term: "grammar", weight: 3 },
    { term: "verb", weight: 2 },
    { term: "adjective", weight: 2 },
    { term: "noun", weight: 2 }
  ]
};

const PATH_HINTS: Record<QuestionArea, string[]> = {
  MATEMATICAS: ["matematic", "algebra", "trigonom", "geometri", "cuantitativo"],
  LECTURA_CRITICA: ["lectura", "comprension", "texto", "filosofia"],
  SOCIALES_CIUDADANAS: ["social", "ciudad", "historia", "geografia", "democracia"],
  CIENCIAS_NATURALES: ["ciencia", "quimica", "fisica", "biologia", "naturales", "ambiente"],
  INGLES: ["ingles", "english", "grammar", "vocabulary"]
};

const sourceLogicalPath = (relativePath: string) => `material/${relativePath.replace(/\\/g, "/")}`;

const normalizeRelativeFilePath = (value: string) => {
  return value.replace(/[\\/]+/g, path.sep);
};

const resolveSourcePath = (item: ManifestItem) => {
  const normalizedRelative = normalizeRelativeFilePath(item.source_relative_path);
  const candidates = new Set<string>();
  candidates.add(path.resolve(item.source_absolute_path));
  candidates.add(path.resolve(process.cwd(), "material", normalizedRelative));
  candidates.add(path.resolve(process.cwd(), normalizedRelative));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const extractTextFromPdf = async (sourcePath: string, maxPages: number, maxTextChars: number, maxPdfBytes: number) => {
  const stats = fs.statSync(sourcePath);
  if (stats.size > maxPdfBytes) {
    return {
      status: "skipped" as const,
      text: "",
      error: `PDF_TOO_LARGE_${stats.size}_BYTES`
    };
  }

  const buffer = fs.readFileSync(sourcePath);
  const parsed = await pdfParse(buffer, { max: maxPages });
  const cleaned = sanitizeText(parsed.text ?? "", maxTextChars);
  return {
    status: "ok" as const,
    text: cleaned,
    error: ""
  };
};

const extractTextFromDocx = async (sourcePath: string, maxTextChars: number) => {
  const result = await mammoth.extractRawText({ path: sourcePath });
  const cleaned = sanitizeText(result.value ?? "", maxTextChars);
  const warning = result.messages?.map((message) => `${message.type}:${message.message}`).join("; ") ?? "";

  return {
    status: "ok" as const,
    text: cleaned,
    error: warning
  };
};

const calculateScores = (text: string, relativePath: string): AreaScore[] => {
  const normalizedText = normalizePlain(text);
  const normalizedPath = normalizePlain(relativePath);

  const results: AreaScore[] = [];

  for (const area of Object.keys(TERM_WEIGHTS) as QuestionArea[]) {
    let score = 0;
    const details: ScoreDetail[] = [];

    for (const entry of TERM_WEIGHTS[area]) {
      const occurrences = clamp(countOccurrences(normalizedText, entry.term), 0, 80);
      if (occurrences <= 0) {
        continue;
      }

      score += occurrences * entry.weight;
      details.push({
        term: entry.term,
        occurrences,
        weight: entry.weight,
        source: "text"
      });
    }

    for (const hint of PATH_HINTS[area]) {
      const occurrences = clamp(countOccurrences(normalizedPath, hint), 0, 8);
      if (occurrences <= 0) {
        continue;
      }

      score += occurrences;
      details.push({
        term: hint,
        occurrences,
        weight: 1,
        source: "path"
      });
    }

    results.push({ area, score, details });
  }

  return results.sort((a, b) => b.score - a.score);
};

const evaluateRow = (item: ManifestItem, text: string, extractionError: string): EvaluationRow => {
  const scores = calculateScores(text, item.source_relative_path);
  const top = scores[0];
  const second = scores[1];

  const topScore = top?.score ?? 0;
  const secondScore = second?.score ?? 0;
  const margin = topScore - secondScore;
  const ratio = topScore > 0 ? topScore / Math.max(1, secondScore) : 0;
  const activeStrongAreas = scores.filter((score) => score.score >= 10).length;
  const textChars = text.length;

  let decision: EvaluationRow["decision"] = "KEEP_MULTI_AREA";
  let suggestedAreaRefined = "MULTI_AREA";
  let suggestedAreaProject: QuestionArea | null = null;
  let suggestedConfidence: Confidence = "baja";
  let reason = "sin_evidencia_suficiente";

  if (topScore <= 0 || textChars < 120) {
    reason = textChars < 120 ? "texto_insuficiente" : "sin_score";
  } else if (activeStrongAreas >= 3 && secondScore >= 10) {
    reason = "mezcla_fuerte_multi_area";
  } else if (margin < 2 || ratio < 1.2) {
    reason = "diferencia_baja_entre_areas";
  } else {
    suggestedAreaRefined = top.area;
    suggestedAreaProject = top.area;
    decision = "RECLASSIFY";

    if (topScore >= 24 && margin >= 8 && ratio >= 1.8) {
      suggestedConfidence = "alta";
    } else if (topScore >= 14 && margin >= 4 && ratio >= 1.35) {
      suggestedConfidence = "media";
    } else {
      suggestedConfidence = "baja";
    }

    reason = `contenido_interno:${top.area}:top=${topScore}:second=${secondScore}:margin=${margin}:ratio=${ratio.toFixed(2)}`;
  }

  const topHits = top?.details
    ?.sort((a, b) => b.occurrences * b.weight - a.occurrences * a.weight)
    ?.slice(0, 8)
    ?.map((detail) => `${detail.source}:${detail.term}x${detail.occurrences}`)
    ?.join(" | ");

  const excerpt = sanitizeText(text.replace(/\s+/g, " "), 260);

  return {
    source_relative_path: item.source_relative_path,
    extension: item.extension,
    size_bytes: Number(item.size_bytes),
    extraction_status: "ok",
    extraction_error: extractionError,
    text_chars: textChars,
    top_area: top?.area ?? "",
    top_score: topScore,
    second_area: second?.area ?? "",
    second_score: secondScore,
    margin,
    ratio,
    decision,
    suggested_area_refined: suggestedAreaRefined,
    suggested_area_project: suggestedAreaProject,
    suggested_confidence: suggestedConfidence,
    reason,
    top_hits: topHits ?? "",
    excerpt
  };
};

const buildManifestDescription = (item: ManifestItem, suggestion: Suggestion) => {
  return [
    `Origen=${sourceLogicalPath(item.source_relative_path)}`,
    `Clasif=contenido_interno_${suggestion.area.toLowerCase()}`,
    `Confidence=${suggestion.confidence}`,
    `TopScore=${suggestion.topScore}`,
    `SecondScore=${suggestion.secondScore}`,
    `Margin=${suggestion.margin}`,
    `Ratio=${suggestion.ratio.toFixed(2)}`
  ].join(" | ");
};

const writeCsv = (filePath: string, headers: string[], rows: Array<Record<string, unknown>>) => {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
};

const writeJson = (filePath: string, payload: unknown) => {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
};

const upsertUltraMetadata = (description: string | null | undefined, suggestion: Suggestion) => {
  const parts = (description ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(
      (part) =>
        !/^UltraArea=/i.test(part) &&
        !/^UltraConfidence=/i.test(part) &&
        !/^UltraTopScore=/i.test(part) &&
        !/^UltraSecondScore=/i.test(part) &&
        !/^UltraMargin=/i.test(part) &&
        !/^UltraRatio=/i.test(part)
    );

  parts.push(`UltraArea=${suggestion.area}`);
  parts.push(`UltraConfidence=${suggestion.confidence}`);
  parts.push(`UltraTopScore=${suggestion.topScore}`);
  parts.push(`UltraSecondScore=${suggestion.secondScore}`);
  parts.push(`UltraMargin=${suggestion.margin}`);
  parts.push(`UltraRatio=${suggestion.ratio.toFixed(2)}`);

  return parts.join(" | ");
};

const renderReportMarkdown = (params: {
  rows: EvaluationRow[];
  suggestions: Suggestion[];
  appliedManifest: number;
  appliedDb: number;
  manifestPath: string;
  outputDir: string;
  refinedManifestPath: string;
  appliedManifestPath: string | null;
  minConfidence: Confidence;
}) => {
  const total = params.rows.length;
  const eligible = params.rows.filter((row) => [".pdf", ".docx"].includes(row.extension.toLowerCase())).length;
  const ok = params.rows.filter((row) => row.extraction_status === "ok").length;
  const skipped = params.rows.filter((row) => row.extraction_status === "skipped").length;
  const errors = params.rows.filter((row) => row.extraction_status === "error").length;
  const reclassified = params.rows.filter((row) => row.decision === "RECLASSIFY").length;

  const byArea = new Map<string, number>();
  for (const suggestion of params.suggestions) {
    byArea.set(suggestion.area, (byArea.get(suggestion.area) ?? 0) + 1);
  }

  const byAreaLines = Array.from(byArea.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([area, count]) => `- ${area}: ${count}`)
    .join("\n");

  const noChange = total - reclassified;

  return [
    "# Fase ultra-profunda MULTI_AREA (contenido interno)",
    "",
    "## Resumen",
    `- Fecha: ${new Date().toISOString()}`,
    `- Manifest base: ${params.manifestPath}`,
    `- Total MULTI_AREA evaluados: ${total}`,
    `- Elegibles (PDF/DOCX): ${eligible}`,
    `- Extraccion OK: ${ok}`,
    `- Extraccion omitida: ${skipped}`,
    `- Extraccion con error: ${errors}`,
    `- Reclasificados por contenido: ${reclassified}`,
    `- Mantienen MULTI_AREA: ${noChange}`,
    `- Umbral de aplicacion: ${params.minConfidence}`,
    "",
    "## Sugerencias por area",
    byAreaLines || "- Sin sugerencias aplicables",
    "",
    "## Aplicacion",
    `- Cambios aplicados al manifiesto: ${params.appliedManifest}`,
    `- Cambios aplicados en DB: ${params.appliedDb}`,
    `- Manifest refinado (salida): ${params.refinedManifestPath}`,
    `- Manifest aplicado (si aplica): ${params.appliedManifestPath ?? "No aplicado"}`,
    "",
    "## Archivos de salida",
    `- ${path.join(params.outputDir, "RECLASIFICACION_MULTI_AREA_ULTRA_DETALLE.csv")}`,
    `- ${path.join(params.outputDir, "RECLASIFICACION_MULTI_AREA_ULTRA_APLICABLE.csv")}`,
    `- ${path.join(params.outputDir, "RECLASIFICACION_MULTI_AREA_ULTRA_REPORTE.md")}`
  ].join("\n");
};

const main = async () => {
  const manifestPath = path.resolve(
    process.cwd(),
    getArgValue("manifest", path.join("storage", "bancos_preguntas", "icfes", "material_local", "manifest_material_local.json"))
  );
  const outputDir = path.resolve(process.cwd(), getArgValue("output-dir", path.join("material", "00. ORGANIZADO")));
  const refinedManifestPath = path.resolve(
    process.cwd(),
    getArgValue("out-manifest", path.join("material", "00. ORGANIZADO", "MANIFEST_MATERIAL_PARA_PROYECTO.ultra.json"))
  );
  const maxPages = clamp(Number(getArgValue("max-pages", "18")), 1, 100);
  const maxTextChars = clamp(Number(getArgValue("max-text-chars", "180000")), 1000, 1_000_000);
  const maxPdfMb = clamp(Number(getArgValue("max-pdf-mb", "120")), 10, 2000);
  const maxPdfBytes = maxPdfMb * 1024 * 1024;
  const minConfidence = parseConfidence(getArgValue("min-confidence", "alta"));
  const shouldApplyManifest = hasFlag("apply");
  const shouldApplyDb = hasFlag("apply-db");
  const limit = Number(getArgValue("limit", "0"));

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe manifiesto: ${manifestPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const raw = fs.readFileSync(manifestPath, "utf-8").replace(/^\uFEFF/, "");
  const manifest = JSON.parse(raw) as ManifestRoot;

  if (!manifest?.files || !Array.isArray(manifest.files)) {
    throw new Error("Manifiesto invalido: se esperaba campo files[]");
  }

  const sourceRows = manifest.files.filter((item) => item.area_refinada === "MULTI_AREA");
  const targetRows = limit > 0 ? sourceRows.slice(0, limit) : sourceRows;
  const evaluations: EvaluationRow[] = [];

  for (const item of targetRows) {
    const extension = (item.extension ?? "").toLowerCase();

    if (extension !== ".pdf" && extension !== ".docx") {
      evaluations.push({
        source_relative_path: item.source_relative_path,
        extension: item.extension,
        size_bytes: Number(item.size_bytes),
        extraction_status: "skipped",
        extraction_error: "UNSUPPORTED_EXTENSION",
        text_chars: 0,
        top_area: "",
        top_score: 0,
        second_area: "",
        second_score: 0,
        margin: 0,
        ratio: 0,
        decision: "UNSUPPORTED",
        suggested_area_refined: "MULTI_AREA",
        suggested_area_project: null,
        suggested_confidence: "baja",
        reason: "extension_no_soportada_para_extraccion",
        top_hits: "",
        excerpt: ""
      });
      continue;
    }

    const absolutePath = resolveSourcePath(item);
    if (!absolutePath) {
      evaluations.push({
        source_relative_path: item.source_relative_path,
        extension: item.extension,
        size_bytes: Number(item.size_bytes),
        extraction_status: "error",
        extraction_error: "SOURCE_NOT_FOUND",
        text_chars: 0,
        top_area: "",
        top_score: 0,
        second_area: "",
        second_score: 0,
        margin: 0,
        ratio: 0,
        decision: "ERROR",
        suggested_area_refined: "MULTI_AREA",
        suggested_area_project: null,
        suggested_confidence: "baja",
        reason: "archivo_origen_no_encontrado",
        top_hits: "",
        excerpt: ""
      });
      continue;
    }

    try {
      let extracted: { status: "ok" | "skipped"; text: string; error: string };
      if (extension === ".pdf") {
        extracted = await extractTextFromPdf(absolutePath, maxPages, maxTextChars, maxPdfBytes);
      } else {
        extracted = await extractTextFromDocx(absolutePath, maxTextChars);
      }

      if (extracted.status === "skipped") {
        evaluations.push({
          source_relative_path: item.source_relative_path,
          extension: item.extension,
          size_bytes: Number(item.size_bytes),
          extraction_status: "skipped",
          extraction_error: extracted.error,
          text_chars: 0,
          top_area: "",
          top_score: 0,
          second_area: "",
          second_score: 0,
          margin: 0,
          ratio: 0,
          decision: "KEEP_MULTI_AREA",
          suggested_area_refined: "MULTI_AREA",
          suggested_area_project: null,
          suggested_confidence: "baja",
          reason: "extraccion_omitida",
          top_hits: "",
          excerpt: ""
        });
        continue;
      }

      evaluations.push(evaluateRow(item, extracted.text, extracted.error));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error no controlado en extraccion";
      evaluations.push({
        source_relative_path: item.source_relative_path,
        extension: item.extension,
        size_bytes: Number(item.size_bytes),
        extraction_status: "error",
        extraction_error: message,
        text_chars: 0,
        top_area: "",
        top_score: 0,
        second_area: "",
        second_score: 0,
        margin: 0,
        ratio: 0,
        decision: "ERROR",
        suggested_area_refined: "MULTI_AREA",
        suggested_area_project: null,
        suggested_confidence: "baja",
        reason: "error_extraccion",
        top_hits: "",
        excerpt: ""
      });
    }
  }

  const suggestions: Suggestion[] = evaluations
    .filter((row) => row.decision === "RECLASSIFY" && row.suggested_area_project)
    .filter((row) => isConfidenceAtLeast(row.suggested_confidence, minConfidence))
    .map((row) => ({
      source_relative_path: row.source_relative_path,
      source_logical_path: sourceLogicalPath(row.source_relative_path),
      area: row.suggested_area_project as QuestionArea,
      confidence: row.suggested_confidence,
      reason: row.reason,
      topScore: row.top_score,
      secondScore: row.second_score,
      margin: row.margin,
      ratio: row.ratio
    }));

  const suggestionByPath = new Map(suggestions.map((suggestion) => [suggestion.source_relative_path, suggestion]));

  const refinedManifest: ManifestRoot = {
    ...manifest,
    generated_at: new Date().toISOString(),
    files: manifest.files.map((item) => {
      const suggestion = suggestionByPath.get(item.source_relative_path);
      if (!suggestion) {
        return item;
      }

      return {
        ...item,
        area_refinada: suggestion.area,
        area_proyecto: suggestion.area,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        descripcion_sugerida: buildManifestDescription(item, suggestion)
      };
    })
  };

  const detailCsvPath = path.join(outputDir, "RECLASIFICACION_MULTI_AREA_ULTRA_DETALLE.csv");
  const applicableCsvPath = path.join(outputDir, "RECLASIFICACION_MULTI_AREA_ULTRA_APLICABLE.csv");
  const reportPath = path.join(outputDir, "RECLASIFICACION_MULTI_AREA_ULTRA_REPORTE.md");

  writeCsv(
    detailCsvPath,
    [
      "source_relative_path",
      "extension",
      "size_bytes",
      "extraction_status",
      "extraction_error",
      "text_chars",
      "top_area",
      "top_score",
      "second_area",
      "second_score",
      "margin",
      "ratio",
      "decision",
      "suggested_area_refined",
      "suggested_area_project",
      "suggested_confidence",
      "reason",
      "top_hits",
      "excerpt"
    ],
    evaluations.map((row) => ({
      ...row,
      ratio: row.ratio.toFixed(2)
    }))
  );

  writeCsv(
    applicableCsvPath,
    ["source_relative_path", "source_logical_path", "area", "confidence", "reason", "topScore", "secondScore", "margin", "ratio"],
    suggestions.map((suggestion) => ({
      ...suggestion,
      ratio: suggestion.ratio.toFixed(2)
    }))
  );

  writeJson(refinedManifestPath, refinedManifest);

  let appliedManifestCount = 0;
  let appliedManifestPath: string | null = null;

  if (shouldApplyManifest) {
    writeJson(manifestPath, refinedManifest);
    appliedManifestPath = manifestPath;
    appliedManifestCount = suggestions.length;

    const mirrorManifestPath = path.resolve(process.cwd(), "material", "00. ORGANIZADO", "MANIFEST_MATERIAL_PARA_PROYECTO.json");
    try {
      writeJson(mirrorManifestPath, refinedManifest);
    } catch {
      // Sin impacto funcional si la copia espejo no existe o no es accesible.
    }
  }

  let appliedDbCount = 0;
  let missingDbRows = 0;

  if (shouldApplyDb) {
    const prisma = new PrismaClient();

    try {
      for (const suggestion of suggestions) {
        const existing = await prisma.fileAsset.findFirst({
          where: {
            rutaLogica: suggestion.source_logical_path
          }
        });

        if (!existing) {
          missingDbRows += 1;
          continue;
        }

        await prisma.fileAsset.update({
          where: { id: existing.id },
          data: {
            area: suggestion.area,
            descripcion: upsertUltraMetadata(existing.descripcion, suggestion)
          }
        });
        appliedDbCount += 1;
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  const reportContent = renderReportMarkdown({
    rows: evaluations,
    suggestions,
    appliedManifest: appliedManifestCount,
    appliedDb: appliedDbCount,
    manifestPath,
    outputDir,
    refinedManifestPath,
    appliedManifestPath,
    minConfidence
  });

  fs.writeFileSync(reportPath, `${reportContent}\n`, "utf-8");

  console.log(
    JSON.stringify(
      {
        success: true,
        manifestPath,
        outputDir,
        totalFilesInManifest: manifest.files.length,
        totalMultiArea: sourceRows.length,
        processedMultiArea: targetRows.length,
        extraction: {
          ok: evaluations.filter((row) => row.extraction_status === "ok").length,
          skipped: evaluations.filter((row) => row.extraction_status === "skipped").length,
          error: evaluations.filter((row) => row.extraction_status === "error").length
        },
        decisions: {
          reclassify: evaluations.filter((row) => row.decision === "RECLASSIFY").length,
          keepMultiArea: evaluations.filter((row) => row.decision === "KEEP_MULTI_AREA").length,
          unsupported: evaluations.filter((row) => row.decision === "UNSUPPORTED").length,
          error: evaluations.filter((row) => row.decision === "ERROR").length
        },
        suggestions: {
          minConfidence,
          total: suggestions.length
        },
        applied: {
          manifest: appliedManifestCount,
          db: appliedDbCount,
          dbMissingRows: missingDbRows
        },
        outputs: {
          detailCsvPath,
          applicableCsvPath,
          reportPath,
          refinedManifestPath
        }
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : "Error ejecutando reclasificacion ultra-profunda"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
