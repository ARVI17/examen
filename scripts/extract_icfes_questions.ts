import fs from "fs";
import path from "path";
import { QuestionArea } from "@prisma/client";

type ManifestRow = {
  year: string;
  area: string;
  kind: string;
  source_url: string;
  local_path: string;
  size_bytes: number;
  sha256: string;
  downloaded_at: string;
};

type ParsedOption = {
  label: "A" | "B" | "C" | "D";
  text: string;
};

type ParsedQuestion = {
  sourceYear: number;
  areaSlug: string;
  sourceKind: string;
  sourcePath: string;
  sourceUrl: string;
  questionNumber: number;
  stem: string;
  options: ParsedOption[];
  correctOption: "A" | "B" | "C" | "D" | null;
};

type ParsedDataset = {
  generatedAt: string;
  sourceManifestPath: string;
  totals: {
    sourceFiles: number;
    rowsInManifest: number;
    parsedQuestions: number;
    answeredQuestions: number;
    skippedBlocks: number;
  };
  files: {
    year: number;
    area: string;
    kind: string;
    sourcePath: string;
    sourceUrl: string;
    totalQuestions: number;
    answeredQuestions: number;
    skippedBlocks: number;
  }[];
  questions: ParsedQuestion[];
};

type ParsedBlockResult = {
  questions: ParsedQuestion[];
  skipped: number;
};

const pdfParse = require("pdf-parse") as (dataBuffer: Buffer) => Promise<{ text: string }>;

const argv = process.argv.slice(2);
const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }

  const [_, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const toAbsolutePath = (inputPath: string) => {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  return path.resolve(process.cwd(), inputPath);
};

const manifestPath = toAbsolutePath(
  getArgValue(
    "manifest",
    path.join("storage", "bancos_preguntas", "icfes", "cuadernillos", "manifest_cuadernillos_practica.json")
  )
);

const outputPath = toAbsolutePath(
  getArgValue(
    "output",
    path.join("storage", "bancos_preguntas", "icfes", "cuadernillos", "parsed", "questions_dataset.json")
  )
);

const normalizeWhitespace = (value: string) => {
  return value
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const compactSentence = (value: string) => {
  return normalizeWhitespace(value).replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
};

const normalizeOptionLabel = (value: string): "A" | "B" | "C" | "D" | null => {
  const upper = value.toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
    return upper;
  }

  return null;
};

const safeReadManifest = (filePath: string): ManifestRow[] => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el manifiesto: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("El manifiesto de cuadernillos no es un arreglo.");
  }

  return parsed as ManifestRow[];
};

const resolveExistingFilePath = (inputPath: string) => {
  const candidates = new Set<string>();
  const normalized = String(inputPath).replace(/\\/g, "/");

  candidates.add(path.resolve(inputPath));

  const examenMarker = "/examen/";
  const examenIndex = normalized.toLowerCase().indexOf(examenMarker);
  if (examenIndex >= 0) {
    const relative = normalized.slice(examenIndex + examenMarker.length);
    candidates.add(path.resolve(process.cwd(), relative));
    candidates.add(path.resolve("/app", relative));
  }

  const storageMarker = "/storage/";
  const storageIndex = normalized.toLowerCase().indexOf(storageMarker);
  if (storageIndex >= 0) {
    const relativeStorage = normalized.slice(storageIndex + 1);
    candidates.add(path.resolve(process.cwd(), relativeStorage));
    candidates.add(path.resolve("/app", relativeStorage));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.normalize(candidate);
    }
  }

  return null;
};

const readPdfText = async (absoluteFilePath: string) => {
  const fileBuffer = fs.readFileSync(absoluteFilePath);
  const parsed = await pdfParse(fileBuffer);
  return normalizeWhitespace(parsed.text ?? "");
};

const parseAnswerMap = (text: string) => {
  const answerMap = new Map<number, { label: "A" | "B" | "C" | "D"; weight: number }>();
  const conflicts = new Set<number>();
  const normalized = normalizeWhitespace(text);

  const applyMatch = (questionNumberRaw: string, labelRaw: string, weight: number) => {
    const questionNumber = Number(questionNumberRaw);
    const label = normalizeOptionLabel(labelRaw);

    if (!Number.isFinite(questionNumber) || questionNumber <= 0 || questionNumber > 500 || !label) {
      return;
    }

    if (conflicts.has(questionNumber)) {
      return;
    }

    const current = answerMap.get(questionNumber);
    if (!current) {
      answerMap.set(questionNumber, { label, weight });
      return;
    }

    if (current.label !== label) {
      conflicts.add(questionNumber);
      answerMap.delete(questionNumber);
      return;
    }

    if (weight > current.weight) {
      answerMap.set(questionNumber, { label, weight });
    }
  };

  const highConfidenceRegex =
    /(?:pregunta|item)\s*(\d{1,3})[\s\S]{0,220}?(?:respuesta(?:\s+correcta)?|opci(?:o|\u00f3)n(?:\s+correcta)?|clave)\s*[:\-]?\s*([A-D])/gi;
  let match: RegExpExecArray | null = highConfidenceRegex.exec(normalized);
  while (match) {
    applyMatch(match[1], match[2], 3);
    match = highConfidenceRegex.exec(normalized);
  }

  const mediumConfidenceRegex = /(?:^|\n)\s*(\d{1,3})\s*[:\-]\s*([A-D])\s*(?=\n|$)/gim;
  match = mediumConfidenceRegex.exec(normalized);
  while (match) {
    applyMatch(match[1], match[2], 2);
    match = mediumConfidenceRegex.exec(normalized);
  }

  const lowConfidenceRegex = /(?:^|\n)\s*(\d{1,3})\s+([A-D])\s*(?=\n|$)/gim;
  match = lowConfidenceRegex.exec(normalized);
  while (match) {
    applyMatch(match[1], match[2], 1);
    match = lowConfidenceRegex.exec(normalized);
  }

  const finalMap = new Map<number, "A" | "B" | "C" | "D">();
  for (const [questionNumber, value] of answerMap.entries()) {
    if (!conflicts.has(questionNumber)) {
      finalMap.set(questionNumber, value.label);
    }
  }

  return finalMap;
};

const parseQuestionsFromText = (payload: {
  text: string;
  year: number;
  area: string;
  kind: string;
  sourcePath: string;
  sourceUrl: string;
  answerMap: Map<number, "A" | "B" | "C" | "D">;
}): ParsedBlockResult => {
  const normalized = normalizeWhitespace(payload.text);
  const starts: Array<{ number: number; index: number }> = [];
  const startRegex = /(?:^|\n)\s*(\d{1,3})\s*[.)]\s+/g;

  let startMatch: RegExpExecArray | null = startRegex.exec(normalized);
  while (startMatch) {
    starts.push({
      number: Number(startMatch[1]),
      index: startMatch.index
    });
    startMatch = startRegex.exec(normalized);
  }

  const questions: ParsedQuestion[] = [];
  let skipped = 0;
  const seenNumbers = new Set<number>();

  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i];
    const next = starts[i + 1];
    const rawBlock = normalized.slice(current.index, next ? next.index : normalized.length);
    const block = normalizeWhitespace(rawBlock);

    if (!block) {
      skipped += 1;
      continue;
    }

    const optionRegex = /(?:^|\n)\s*([A-D])\s*[.)]\s+([\s\S]*?)(?=(?:\n\s*[A-D]\s*[.)]\s+)|$)/g;
    const options: ParsedOption[] = [];
    let optionMatch: RegExpExecArray | null = optionRegex.exec(block);

    while (optionMatch) {
      const label = normalizeOptionLabel(optionMatch[1]);
      const text = compactSentence(optionMatch[2] ?? "");
      if (label && text) {
        options.push({ label, text });
      }
      optionMatch = optionRegex.exec(block);
    }

    const labels = options.map((item) => item.label);
    const hasCoreOptions = labels.includes("A") && labels.includes("B");
    if (!hasCoreOptions || options.length < 2) {
      skipped += 1;
      continue;
    }

    const firstOptionMatch = /(?:^|\n)\s*[A-D]\s*[.)]\s+/m.exec(block);
    const stemRaw = firstOptionMatch ? block.slice(0, firstOptionMatch.index) : block;
    const stem = compactSentence(stemRaw.replace(/^\s*\d{1,3}\s*[.)]\s*/, ""));

    if (!stem || stem.length < 8) {
      skipped += 1;
      continue;
    }

    if (seenNumbers.has(current.number)) {
      skipped += 1;
      continue;
    }

    seenNumbers.add(current.number);

    questions.push({
      sourceYear: payload.year,
      areaSlug: payload.area,
      sourceKind: payload.kind,
      sourcePath: payload.sourcePath,
      sourceUrl: payload.sourceUrl,
      questionNumber: current.number,
      stem,
      options,
      correctOption: payload.answerMap.get(current.number) ?? null
    });
  }

  return {
    questions,
    skipped
  };
};

const keepPracticeLikeRows = (rows: ManifestRow[]) => {
  return rows.filter((row) => {
    const normalizedKind = row.kind.toLowerCase();
    return normalizedKind.includes("practica") || normalizedKind.includes("cuadernillo");
  });
};

const buildAnswerMapByYearArea = async (rows: ManifestRow[]) => {
  const mapByKey = new Map<string, Map<number, "A" | "B" | "C" | "D">>();
  const explainedRows = rows.filter((row) => row.kind.toLowerCase().includes("explicad"));

  for (const row of explainedRows) {
    const absolutePath = resolveExistingFilePath(row.local_path);
    if (!absolutePath) {
      continue;
    }

    try {
      const text = await readPdfText(absolutePath);
      const answerMap = parseAnswerMap(text);
      const key = `${row.year}__${row.area}`;
      mapByKey.set(key, answerMap);
    } catch {
      continue;
    }
  }

  return mapByKey;
};

const ensureOutputFolder = (filePath: string) => {
  const folder = path.dirname(filePath);
  fs.mkdirSync(folder, { recursive: true });
};

const mapAreaSlugToEnum = (value: string) => {
  const slug = value.trim().toLowerCase();
  const map: Record<string, QuestionArea> = {
    lectura_critica: QuestionArea.LECTURA_CRITICA,
    matematicas: QuestionArea.MATEMATICAS,
    sociales_ciudadanas: QuestionArea.SOCIALES_CIUDADANAS,
    ciencias_naturales: QuestionArea.CIENCIAS_NATURALES,
    ingles: QuestionArea.INGLES
  };

  return map[slug] ?? null;
};

const main = async () => {
  const manifestRows = safeReadManifest(manifestPath);
  const practiceRows = keepPracticeLikeRows(manifestRows);
  const answerMaps = await buildAnswerMapByYearArea(manifestRows);

  const parsedQuestions: ParsedQuestion[] = [];
  const perFileStats: ParsedDataset["files"] = [];
  let skippedBlocks = 0;

  for (const row of practiceRows) {
    const absolutePath = resolveExistingFilePath(row.local_path);
    if (!absolutePath) {
      continue;
    }

    if (!mapAreaSlugToEnum(row.area)) {
      continue;
    }

    const yearNumber = Number(row.year);
    if (!Number.isFinite(yearNumber) || yearNumber <= 0) {
      continue;
    }

    const text = await readPdfText(absolutePath);
    const answerMap = answerMaps.get(`${row.year}__${row.area}`) ?? new Map<number, "A" | "B" | "C" | "D">();

    const parsed = parseQuestionsFromText({
      text,
      year: yearNumber,
      area: row.area,
      kind: row.kind,
      sourcePath: absolutePath,
      sourceUrl: row.source_url,
      answerMap
    });

    const answeredCount = parsed.questions.filter((question) => Boolean(question.correctOption)).length;
    skippedBlocks += parsed.skipped;
    parsedQuestions.push(...parsed.questions);

    perFileStats.push({
      year: yearNumber,
      area: row.area,
      kind: row.kind,
      sourcePath: absolutePath,
      sourceUrl: row.source_url,
      totalQuestions: parsed.questions.length,
      answeredQuestions: answeredCount,
      skippedBlocks: parsed.skipped
    });
  }

  const dataset: ParsedDataset = {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: manifestPath,
    totals: {
      sourceFiles: perFileStats.length,
      rowsInManifest: manifestRows.length,
      parsedQuestions: parsedQuestions.length,
      answeredQuestions: parsedQuestions.filter((question) => Boolean(question.correctOption)).length,
      skippedBlocks
    },
    files: perFileStats,
    questions: parsedQuestions
  };

  ensureOutputFolder(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), "utf-8");

  console.log(
    JSON.stringify(
      {
        success: true,
        outputPath,
        totals: dataset.totals
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
        message: error instanceof Error ? error.message : "No se pudo extraer preguntas ICFES"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
