import fs from "fs";
import path from "path";
import { createHash } from "crypto";

type ManifestItem = {
  source_relative_path: string;
  source_absolute_path: string;
  coleccion: string;
  area_refinada: string;
  area_proyecto: string | null;
  categoria_proyecto: string;
  tipo_prueba_proyecto: string;
  grado_objetivo: string;
  extension: string;
  size_bytes: number;
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

const pdfParse = require("pdf-parse") as (
  dataBuffer: Buffer,
  options?: { max?: number }
) => Promise<{ text: string; numpages?: number }>;

const mammoth = require("mammoth") as {
  extractRawText: (input: { path: string }) => Promise<{ value: string; messages: { type: string; message: string }[] }>;
};

const argv = process.argv.slice(2);

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
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
};

const normalizeWhitespace = (value: string) => {
  return value
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const normalizeChunkForHash = (value: string) => normalizeWhitespace(value).toLowerCase();

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const resolveSourcePath = (item: ManifestItem) => {
  const relative = item.source_relative_path.replace(/[\\/]+/g, path.sep);
  const candidates = new Set<string>();
  candidates.add(path.resolve(item.source_absolute_path));
  candidates.add(path.resolve(process.cwd(), "material", relative));
  candidates.add(path.resolve(process.cwd(), relative));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const extractFromPdf = async (filePath: string, maxPages: number, maxPdfBytes: number) => {
  const stats = fs.statSync(filePath);
  if (stats.size > maxPdfBytes) {
    return {
      text: "",
      skipped: true,
      reason: `PDF_TOO_LARGE_${stats.size}_BYTES`
    };
  }

  const buffer = fs.readFileSync(filePath);
  const parsed = await pdfParse(buffer, { max: maxPages });
  return {
    text: normalizeWhitespace(parsed.text ?? ""),
    skipped: false,
    reason: ""
  };
};

const extractFromDocx = async (filePath: string) => {
  const parsed = await mammoth.extractRawText({ path: filePath });
  const warning = parsed.messages?.map((message) => `${message.type}:${message.message}`).join("; ") ?? "";
  return {
    text: normalizeWhitespace(parsed.value ?? ""),
    skipped: false,
    reason: warning
  };
};

const extractFromTextFile = (filePath: string) => {
  const raw = fs.readFileSync(filePath, "utf-8");
  return normalizeWhitespace(raw);
};

const extractFromJson = (filePath: string) => {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  try {
    const parsed = JSON.parse(raw);
    return normalizeWhitespace(JSON.stringify(parsed, null, 2));
  } catch {
    return normalizeWhitespace(raw);
  }
};

const chunkText = (text: string, chunkSize: number, overlap: number) => {
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(cursor + chunkSize, text.length);

    if (end < text.length) {
      const windowStart = Math.max(cursor + Math.floor(chunkSize * 0.65), cursor + 1);
      const windowText = text.slice(windowStart, end + 160);
      const punctuationIndex = windowText.search(/[.!?]\s|\n{2,}/);
      if (punctuationIndex >= 0) {
        end = Math.min(windowStart + punctuationIndex + 1, text.length);
      }
    }

    const current = normalizeWhitespace(text.slice(cursor, end));
    if (current.length > 0) {
      chunks.push(current);
    }

    if (end >= text.length) {
      break;
    }

    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
};

const toJsonl = (rows: CorpusChunk[]) => rows.map((row) => JSON.stringify(row)).join("\n");

const renderMarkdownReport = (params: {
  selectedFiles: number;
  chunks: number;
  uniqueChunks: number;
  outputDir: string;
  skippedReasons: Map<string, number>;
  byArea: Map<string, number>;
  byCategory: Map<string, number>;
  byPriority: Map<string, number>;
}) => {
  const mapToLines = (source: Map<string, number>) =>
    Array.from(source.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `- ${name}: ${count}`)
      .join("\n");

  return [
    "# Corpus simulador ICFES",
    "",
    "## Resumen",
    `- Fecha: ${new Date().toISOString()}`,
    `- Archivos seleccionados: ${params.selectedFiles}`,
    `- Chunks generados: ${params.chunks}`,
    `- Chunks unicos: ${params.uniqueChunks}`,
    "",
    "## Chunks por area",
    mapToLines(params.byArea) || "- Sin datos",
    "",
    "## Chunks por categoria",
    mapToLines(params.byCategory) || "- Sin datos",
    "",
    "## Chunks por prioridad",
    mapToLines(params.byPriority) || "- Sin datos",
    "",
    "## Razones de descarte",
    mapToLines(params.skippedReasons) || "- Sin descartes",
    "",
    "## Archivos de salida",
    `- ${path.join(params.outputDir, "corpus_chunks.jsonl")}`,
    `- ${path.join(params.outputDir, "corpus_summary.json")}`,
    `- ${path.join(params.outputDir, "corpus_report.md")}`
  ].join("\n");
};

const main = async () => {
  const manifestPath = path.resolve(
    process.cwd(),
    getArgValue("manifest", path.join("storage", "bancos_preguntas", "icfes", "material_local", "manifest_material_local.json"))
  );
  const outputDir = path.resolve(
    process.cwd(),
    getArgValue("output-dir", path.join("storage", "bancos_preguntas", "icfes", "ai"))
  );

  const allowedPriorities = parseSet(getArgValue("priorities", "alta,media,baja"));
  const allowedCategories = parseSet(getArgValue("categories", "examenes,simulacros,bancos_preguntas,materiales_apoyo"));
  const allowedExtensions = parseSet(getArgValue("extensions", ".pdf,.docx,.txt,.csv,.json"));

  const includeMultiArea = getArgValue("include-multiarea", "true").toLowerCase() === "true";
  const minChars = Number(getArgValue("min-chars", "280"));
  const maxFiles = Number(getArgValue("max-files", "0"));
  const chunkSize = Number(getArgValue("chunk-size", "1300"));
  const overlap = Number(getArgValue("chunk-overlap", "180"));
  const maxPdfPages = Number(getArgValue("max-pdf-pages", "20"));
  const maxPdfMb = Number(getArgValue("max-pdf-mb", "120"));
  const maxPdfBytes = maxPdfMb * 1024 * 1024;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe manifiesto: ${manifestPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const raw = fs.readFileSync(manifestPath, "utf-8").replace(/^\uFEFF/, "");
  const manifest = JSON.parse(raw) as ManifestRoot;

  const baseSelection = manifest.files.filter((item) => {
    if (!allowedPriorities.has(item.ingest_priority.toLowerCase())) {
      return false;
    }
    if (!allowedCategories.has(item.categoria_proyecto.toLowerCase())) {
      return false;
    }
    if (!allowedExtensions.has(item.extension.toLowerCase())) {
      return false;
    }
    if (!includeMultiArea && item.area_refinada === "MULTI_AREA") {
      return false;
    }
    return true;
  });

  const selected = maxFiles > 0 ? baseSelection.slice(0, maxFiles) : baseSelection;

  const chunks: CorpusChunk[] = [];
  const seenChunkHashes = new Set<string>();
  const skippedReasons = new Map<string, number>();
  const byArea = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byPriority = new Map<string, number>();

  let extractedFiles = 0;

  for (const item of selected) {
    const sourcePath = resolveSourcePath(item);
    if (!sourcePath) {
      skippedReasons.set("SOURCE_NOT_FOUND", (skippedReasons.get("SOURCE_NOT_FOUND") ?? 0) + 1);
      continue;
    }

    const extension = item.extension.toLowerCase();
    let extractedText = "";
    let extractWarning = "";

    try {
      if (extension === ".pdf") {
        const extracted = await extractFromPdf(sourcePath, maxPdfPages, maxPdfBytes);
        if (extracted.skipped) {
          skippedReasons.set(extracted.reason, (skippedReasons.get(extracted.reason) ?? 0) + 1);
          continue;
        }
        extractedText = extracted.text;
      } else if (extension === ".docx") {
        const extracted = await extractFromDocx(sourcePath);
        extractedText = extracted.text;
        extractWarning = extracted.reason;
      } else if (extension === ".txt" || extension === ".csv") {
        extractedText = extractFromTextFile(sourcePath);
      } else if (extension === ".json") {
        extractedText = extractFromJson(sourcePath);
      } else {
        skippedReasons.set("UNSUPPORTED_EXTENSION", (skippedReasons.get("UNSUPPORTED_EXTENSION") ?? 0) + 1);
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? `EXTRACT_ERROR:${error.message}` : "EXTRACT_ERROR";
      skippedReasons.set(message, (skippedReasons.get(message) ?? 0) + 1);
      continue;
    }

    if (extractedText.length < minChars) {
      skippedReasons.set("TEXT_TOO_SHORT", (skippedReasons.get("TEXT_TOO_SHORT") ?? 0) + 1);
      continue;
    }

    extractedFiles += 1;
    const itemChunks = chunkText(extractedText, chunkSize, overlap);

    itemChunks.forEach((chunk, index) => {
      const normalizedHash = sha256(normalizeChunkForHash(chunk));
      if (seenChunkHashes.has(normalizedHash)) {
        skippedReasons.set("DUPLICATE_CHUNK_HASH", (skippedReasons.get("DUPLICATE_CHUNK_HASH") ?? 0) + 1);
        return;
      }
      seenChunkHashes.add(normalizedHash);

      const area = item.area_proyecto ?? item.area_refinada;
      byArea.set(area, (byArea.get(area) ?? 0) + 1);
      byCategory.set(item.categoria_proyecto, (byCategory.get(item.categoria_proyecto) ?? 0) + 1);
      byPriority.set(item.ingest_priority, (byPriority.get(item.ingest_priority) ?? 0) + 1);

      chunks.push({
        id: `${item.sha256.slice(0, 12)}-${index + 1}`,
        source_relative_path: item.source_relative_path,
        source_logical_path: `material/${item.source_relative_path.replace(/\\/g, "/")}`,
        source_sha256: item.sha256,
        area_refinada: item.area_refinada,
        area_proyecto: item.area_proyecto,
        categoria_proyecto: item.categoria_proyecto,
        tipo_prueba_proyecto: item.tipo_prueba_proyecto,
        grado_objetivo: item.grado_objetivo,
        ingest_priority: item.ingest_priority,
        confidence: item.confidence,
        reason: extractWarning ? `${item.reason}; ${extractWarning}` : item.reason,
        chunk_index: index + 1,
        chunk_chars: chunk.length,
        text_hash: normalizedHash,
        text: chunk
      });
    });
  }

  const corpusPath = path.join(outputDir, "corpus_chunks.jsonl");
  const summaryPath = path.join(outputDir, "corpus_summary.json");
  const reportPath = path.join(outputDir, "corpus_report.md");

  fs.writeFileSync(corpusPath, `${toJsonl(chunks)}\n`, "utf-8");

  const summary = {
    generatedAt: new Date().toISOString(),
    manifestPath,
    filters: {
      priorities: Array.from(allowedPriorities.values()),
      categories: Array.from(allowedCategories.values()),
      extensions: Array.from(allowedExtensions.values()),
      includeMultiArea,
      minChars,
      maxFiles,
      chunkSize,
      overlap,
      maxPdfPages,
      maxPdfMb
    },
    totals: {
      filesInManifest: manifest.files.length,
      filesSelected: selected.length,
      filesExtracted: extractedFiles,
      chunksGenerated: chunks.length,
      uniqueChunkHashes: seenChunkHashes.size
    },
    byArea: Array.from(byArea.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count),
    byCategory: Array.from(byCategory.entries())
      .map(([categoria, count]) => ({ categoria, count }))
      .sort((a, b) => b.count - a.count),
    byPriority: Array.from(byPriority.entries())
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => b.count - a.count),
    skippedReasons: Array.from(skippedReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  };

  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");

  const markdown = renderMarkdownReport({
    selectedFiles: selected.length,
    chunks: chunks.length,
    uniqueChunks: seenChunkHashes.size,
    outputDir,
    skippedReasons,
    byArea,
    byCategory,
    byPriority
  });

  fs.writeFileSync(reportPath, `${markdown}\n`, "utf-8");

  console.log(
    JSON.stringify(
      {
        success: true,
        manifestPath,
        outputDir,
        totals: summary.totals,
        outputs: {
          corpusPath,
          summaryPath,
          reportPath
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
        message: error instanceof Error ? error.message : "Error generando corpus para simulador"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
