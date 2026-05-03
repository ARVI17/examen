import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import mammoth from "mammoth";
import xlsx from "node-xlsx";
import { createWorker } from "tesseract.js";
import {
  Prisma,
  PrismaClient,
  QuestionArea,
  QuestionDifficulty,
  QuestionSourceType,
  QuestionType
} from "@prisma/client";

const pdfParse = require("pdf-parse") as (dataBuffer: Buffer) => Promise<{ text?: string }>;

type OptionLabel = "A" | "B" | "C" | "D";

type ParsedQuestion = {
  stem: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  explanation?: string;
  area?: QuestionArea;
  difficulty?: QuestionDifficulty;
  subjectCode?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
};

type ParsedTextQuestion = {
  questionNumber: number;
  stem: string;
  options: Array<{ label: OptionLabel; text: string }>;
  correctLabel: OptionLabel | null;
};

type KeyContext = {
  logicalPath: string;
  year: string | null;
  area: QuestionArea | null;
  answers: Map<number, OptionLabel>;
};

type KeyDocumentKind = "key_table" | "question_statement" | "uncertain";

type KeyDocumentClassification = {
  kind: KeyDocumentKind;
  confidence: number;
  answerPairs: number;
  questionStarts: number;
  optionLines: number;
  keyTerms: number;
};

type OcrProfile = "key" | "question";

const prisma = new PrismaClient();
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

const shouldApply = hasFlag("apply");
const enableImageKeyOcr = !hasFlag("no-ocr-keys-images");
const enableImageQuestionOcr = !hasFlag("no-ocr-question-images");
const limit = Number(getArgValue("limit", "0"));
const defaultGrade = getArgValue("grade", "11");
const maxTextChars = Number(getArgValue("max-text-chars", "800000"));
const logPath = path.resolve(
  process.cwd(),
  getArgValue("log", path.join("storage", "reportes", "ingestion_kb_log.json"))
);

const baseDirectories = [path.resolve(process.cwd(), "storage"), path.resolve(process.cwd(), "material")];

const keyImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const baseTextExtractionExtensions = [".json", ".jsonl", ".txt", ".md", ".csv", ".pdf", ".docx", ".xls", ".xlsx"];
const textExtractionExtensions = new Set([
  ...baseTextExtractionExtensions,
  ...(enableImageQuestionOcr ? Array.from(keyImageExtensions) : [])
]);
const jsonStructuredExtensions = new Set([".json", ".jsonl"]);
const ignoredFileNames = new Set([".gitkeep"]);
const minUncertainKeyAnswersValue = Number(getArgValue("min-uncertain-key-answers", "12"));
const minUncertainKeyAnswers =
  Number.isFinite(minUncertainKeyAnswersValue) && minUncertainKeyAnswersValue > 0
    ? Math.floor(minUncertainKeyAnswersValue)
    : 12;

let keyOcrWorker: any | null = null;
let questionOcrWorker: any | null = null;

const configureKeyOcrWorker = async (worker: any) => {
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "0123456789ABCDabcd.:;-|/()[] \n\r\t"
    });
  } catch {
    // No-op
  }
};

const getOcrWorker = async (profile: OcrProfile) => {
  if (profile === "key") {
    if (!enableImageKeyOcr) {
      return null;
    }
    if (!keyOcrWorker) {
      keyOcrWorker = await createWorker("eng");
      await configureKeyOcrWorker(keyOcrWorker);
    }
    return keyOcrWorker;
  }

  if (!enableImageQuestionOcr) {
    return null;
  }
  if (!questionOcrWorker) {
    questionOcrWorker = await createWorker("eng");
  }
  return questionOcrWorker;
};

const terminateOcrWorker = async () => {
  const workers = [keyOcrWorker, questionOcrWorker].filter(Boolean);
  for (const worker of workers) {
    try {
      await worker.terminate();
    } catch {
      // No-op
    }
  }
  keyOcrWorker = null;
  questionOcrWorker = null;
};

const normalizeText = (value: string) =>
  value
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const compactText = (value: string) => normalizeText(value).replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
const normalizeForHash = (value: string) => compactText(value).toLowerCase();
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const safeReadBuffer = (filePath: string) => {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
};

const decodeUtf8 = (value: Buffer) => value.toString("utf-8").replace(/^\uFEFF/, "");

const detectSourceType = (filePath: string): QuestionSourceType => {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/material/")) {
    return QuestionSourceType.MATERIAL;
  }
  return QuestionSourceType.STORAGE;
};

const detectArea = (text: string): QuestionArea | undefined => {
  const normalized = normalizeForHash(text);
  if (normalized.includes("lectura critica")) return QuestionArea.LECTURA_CRITICA;
  if (normalized.includes("matematica") || normalized.includes("matematicas")) return QuestionArea.MATEMATICAS;
  if (normalized.includes("sociales") || normalized.includes("ciudadanas")) return QuestionArea.SOCIALES_CIUDADANAS;
  if (normalized.includes("ciencias naturales") || normalized.includes("biologia") || normalized.includes("quimica")) {
    return QuestionArea.CIENCIAS_NATURALES;
  }
  if (normalized.includes("ingles") || normalized.includes("english")) return QuestionArea.INGLES;
  return undefined;
};

const detectDifficulty = (text: string): QuestionDifficulty => {
  const normalized = normalizeForHash(text);
  if (normalized.includes("dificil") || normalized.includes("alto")) return QuestionDifficulty.ALTO;
  if (normalized.includes("facil") || normalized.includes("bajo")) return QuestionDifficulty.BAJO;
  return QuestionDifficulty.MEDIO;
};

const toQuestionArea = (value: unknown): QuestionArea | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  const map: Record<string, QuestionArea> = {
    LECTURA_CRITICA: QuestionArea.LECTURA_CRITICA,
    LECTURA: QuestionArea.LECTURA_CRITICA,
    MATEMATICAS: QuestionArea.MATEMATICAS,
    MATEMATICA: QuestionArea.MATEMATICAS,
    SOCIALES_CIUDADANAS: QuestionArea.SOCIALES_CIUDADANAS,
    SOCIALES: QuestionArea.SOCIALES_CIUDADANAS,
    CIENCIAS_NATURALES: QuestionArea.CIENCIAS_NATURALES,
    CIENCIAS: QuestionArea.CIENCIAS_NATURALES,
    INGLES: QuestionArea.INGLES,
    ENGLISH: QuestionArea.INGLES
  };
  return map[normalized];
};

const toDifficulty = (value: unknown): QuestionDifficulty | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "BAJO" || normalized === "FACIL") return QuestionDifficulty.BAJO;
  if (normalized === "MEDIO") return QuestionDifficulty.MEDIO;
  if (normalized === "ALTO" || normalized === "DIFICIL") return QuestionDifficulty.ALTO;
  return undefined;
};

const collectFiles = (rootDir: string, output: string[]) => {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, output);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (ignoredFileNames.has(entry.name.toLowerCase())) {
      continue;
    }
    output.push(fullPath);
  }
};

const parseOptions = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { text: compactText(item), isCorrect: false };
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const text =
        (typeof row.texto_opcion === "string" && row.texto_opcion) ||
        (typeof row.texto === "string" && row.texto) ||
        (typeof row.text === "string" && row.text) ||
        "";
      if (!text.trim()) {
        return null;
      }
      const isCorrect = Boolean(row.es_correcta ?? row.esCorrecta ?? row.correct ?? row.is_correct);
      return {
        text: compactText(text),
        isCorrect
      };
    })
    .filter((item): item is { text: string; isCorrect: boolean } => Boolean(item));
};

const extractQuestionsFromNode = (node: unknown, fallbackContext: { area?: QuestionArea }): ParsedQuestion[] => {
  if (!node) {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap((item) => extractQuestionsFromNode(item, fallbackContext));
  }

  if (typeof node !== "object") {
    return [];
  }

  const objectNode = node as Record<string, unknown>;
  const stemRaw =
    (typeof objectNode.enunciado === "string" && objectNode.enunciado) ||
    (typeof objectNode.pregunta === "string" && objectNode.pregunta) ||
    (typeof objectNode.question === "string" && objectNode.question) ||
    (typeof objectNode.stem === "string" && objectNode.stem) ||
    "";

  const nestedCandidates = ["preguntas", "questions", "items", "data", "results"];
  const nestedQuestions = nestedCandidates.flatMap((key) => extractQuestionsFromNode(objectNode[key], fallbackContext));

  if (!stemRaw.trim()) {
    return nestedQuestions;
  }

  const options =
    parseOptions(objectNode.opciones) || parseOptions(objectNode.options) || parseOptions(objectNode.choices) || [];

  let resolvedOptions = options.length ? options : [];
  if (resolvedOptions.length >= 2 && resolvedOptions.filter((item) => item.isCorrect).length === 0) {
    const correctMarker = objectNode.respuesta_correcta ?? objectNode.correct_answer ?? objectNode.answer;
    if (typeof correctMarker === "string") {
      const marker = correctMarker.trim().toUpperCase();
      const labelIndex = ["A", "B", "C", "D"].indexOf(marker);
      if (labelIndex >= 0 && resolvedOptions[labelIndex]) {
        resolvedOptions = resolvedOptions.map((option, index) => ({
          ...option,
          isCorrect: index === labelIndex
        }));
      } else {
        resolvedOptions = resolvedOptions.map((option) => ({
          ...option,
          isCorrect: normalizeForHash(option.text) === normalizeForHash(correctMarker)
        }));
      }
    }
  }

  const correctCount = resolvedOptions.filter((item) => item.isCorrect).length;
  if (correctCount !== 1 || resolvedOptions.length < 2) {
    return nestedQuestions;
  }

  const area = toQuestionArea(objectNode.area) ?? fallbackContext.area;
  const difficulty = toDifficulty(objectNode.nivel_dificultad ?? objectNode.dificultad);
  const explanation =
    (typeof objectNode.explicacion === "string" && objectNode.explicacion) ||
    (typeof objectNode.explicacion_respuesta === "string" && objectNode.explicacion_respuesta) ||
    undefined;

  const current: ParsedQuestion = {
    stem: compactText(stemRaw),
    options: resolvedOptions,
    explanation: explanation ? compactText(explanation) : undefined,
    area,
    difficulty,
    subjectCode: area,
    topic:
      (typeof objectNode.tema === "string" && compactText(objectNode.tema)) ||
      (typeof objectNode.topic === "string" && compactText(objectNode.topic)) ||
      undefined,
    metadata: {
      competencia: objectNode.competencia,
      componente: objectNode.componente,
      rawId: objectNode.id
    }
  };

  return [current, ...nestedQuestions];
};

const parseDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = index + 1 < line.length ? line[index + 1] : "";

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
};

const detectDelimiter = (sampleLine: string) => {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = sampleLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
};

const csvBufferToText = (buffer: Buffer) => {
  const raw = decodeUtf8(buffer);
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return "";
  }

  const delimiter = detectDelimiter(lines[0]);
  return lines
    .map((line) => parseDelimitedLine(line, delimiter).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");
};

const spreadsheetBufferToText = (buffer: Buffer) => {
  const sheets = xlsx.parse(buffer);
  const rows: string[] = [];

  for (const sheet of sheets) {
    rows.push(`Hoja: ${sheet.name}`);
    const data = Array.isArray(sheet.data) ? sheet.data : [];
    for (const row of data) {
      if (!Array.isArray(row)) {
        continue;
      }
      const line = row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "string") return cell.trim();
          if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
          return "";
        })
        .filter(Boolean)
        .join(" | ");
      if (line) {
        rows.push(line);
      }
    }
  }

  return rows.join("\n");
};

const parseJsonlText = (raw: string) => {
  const questions: ParsedQuestion[] = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      questions.push(...extractQuestionsFromNode(parsed, { area: undefined }));
    } catch {
      continue;
    }
  }
  return questions;
};

const extractTextByExtension = async (extension: string, fileBuffer: Buffer) => {
  switch (extension) {
    case ".json":
    case ".jsonl":
    case ".txt":
    case ".md":
      return decodeUtf8(fileBuffer);
    case ".csv":
      return csvBufferToText(fileBuffer);
    case ".pdf": {
      const parsed = await pdfParse(fileBuffer);
      return parsed.text ?? "";
    }
    case ".docx": {
      const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
      return parsed.value ?? "";
    }
    case ".xls":
    case ".xlsx":
      return spreadsheetBufferToText(fileBuffer);
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".webp":
      return extractTextByOcrImage(fileBuffer, "question");
    default:
      return "";
  }
};

const extractTextByOcrImage = async (fileBuffer: Buffer, profile: OcrProfile = "question") => {
  const worker = await getOcrWorker(profile);
  if (!worker) {
    return "";
  }
  const result = await worker.recognize(fileBuffer);
  return result?.data?.text ?? "";
};

const normalizeOptionLabel = (value: string): OptionLabel | null => {
  const upper = value.toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
    return upper;
  }
  return null;
};

const parseAnswerMap = (text: string) => {
  const answerMap = new Map<number, { label: OptionLabel; weight: number }>();
  const conflicts = new Set<number>();
  const normalized = normalizeText(text);

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

  const finalMap = new Map<number, OptionLabel>();
  for (const [questionNumber, value] of answerMap.entries()) {
    if (!conflicts.has(questionNumber)) {
      finalMap.set(questionNumber, value.label);
    }
  }

  return finalMap;
};

const parseAnswerMapFromSpreadsheet = (buffer: Buffer) => {
  const answerMap = new Map<number, OptionLabel>();
  const conflicts = new Set<number>();
  const sheets = xlsx.parse(buffer);

  const apply = (questionNumber: number, label: OptionLabel) => {
    if (!Number.isFinite(questionNumber) || questionNumber <= 0 || questionNumber > 500) {
      return;
    }
    if (conflicts.has(questionNumber)) {
      return;
    }
    const current = answerMap.get(questionNumber);
    if (!current) {
      answerMap.set(questionNumber, label);
      return;
    }
    if (current !== label) {
      answerMap.delete(questionNumber);
      conflicts.add(questionNumber);
    }
  };

  for (const sheet of sheets) {
    const rows = Array.isArray(sheet.data) ? sheet.data : [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) {
        continue;
      }

      const rowValues = row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim()));
      const labelIndexes: Array<{ index: number; label: OptionLabel }> = [];

      for (let index = 0; index < rowValues.length; index += 1) {
        const normalized = (rowValues[index] ?? "").toUpperCase();
        const label = normalizeOptionLabel(normalized);
        if (label) {
          labelIndexes.push({ index, label });
        }
      }

      for (const labelIndex of labelIndexes) {
        let matchedNumber: number | null = null;
        for (let index = labelIndex.index - 1; index >= 0; index -= 1) {
          const numericValue = Number(rowValues[index] ?? "");
          if (Number.isInteger(numericValue) && numericValue > 0 && numericValue <= 500) {
            matchedNumber = numericValue;
            break;
          }
        }
        if (matchedNumber !== null) {
          apply(matchedNumber, labelIndex.label);
        }
      }

      const joinedRow = rowValues.filter(Boolean).join(" | ");
      if (!joinedRow) {
        continue;
      }

      const pairRegex = /(?:^|\D)(\d{1,3})\s*[:\-|]?\s*([A-D])(?:\D|$)/gi;
      let pairMatch: RegExpExecArray | null = pairRegex.exec(joinedRow);
      while (pairMatch) {
        const questionNumber = Number(pairMatch[1]);
        const label = normalizeOptionLabel(pairMatch[2]);
        if (label) {
          apply(questionNumber, label);
        }
        pairMatch = pairRegex.exec(joinedRow);
      }
    }
  }

  return answerMap;
};

const classifyKeyDocument = (text: string, answerPairs: number): KeyDocumentClassification => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      kind: "uncertain",
      confidence: 0,
      answerPairs,
      questionStarts: 0,
      optionLines: 0,
      keyTerms: 0
    };
  }

  const questionStarts =
    normalized.match(/(?:^|\n)\s*(?:pregunta|item)?\s*\d{1,3}\s*[.)]\s+(?=[a-záéíóúñ])/gim)?.length ?? 0;
  const optionLines = normalized.match(/(?:^|\n)\s*[A-D]\s*[.)]\s+\S/gim)?.length ?? 0;
  const lower = normalized.toLowerCase();
  const keyTerms = [
    "clave",
    "respuestas",
    "respuesta correcta",
    "hoja de respuestas",
    "gabarito",
    "llave"
  ].reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);

  let score = 0;
  if (answerPairs >= 25) score += 7;
  else if (answerPairs >= 15) score += 5;
  else if (answerPairs >= 8) score += 3;
  else if (answerPairs >= 4) score += 2;
  else if (answerPairs >= 2) score += 1;

  if (keyTerms >= 2) score += 2;
  else if (keyTerms === 1) score += 1;

  if (questionStarts >= 10) score -= 6;
  else if (questionStarts >= 5) score -= 4;
  else if (questionStarts >= 2) score -= 2;

  if (optionLines >= 20) score -= 4;
  else if (optionLines >= 10) score -= 2;
  else if (optionLines >= 5) score -= 1;

  const likelyStatement = questionStarts >= 3 && optionLines >= 8 && answerPairs < 6;
  if (likelyStatement) {
    return {
      kind: "question_statement",
      confidence: Math.min(10, Math.max(1, 4 + questionStarts / 2)),
      answerPairs,
      questionStarts,
      optionLines,
      keyTerms
    };
  }

  if (score >= 4) {
    return {
      kind: "key_table",
      confidence: Math.min(10, score),
      answerPairs,
      questionStarts,
      optionLines,
      keyTerms
    };
  }

  if (score <= -2) {
    return {
      kind: "question_statement",
      confidence: Math.min(10, Math.abs(score) + 2),
      answerPairs,
      questionStarts,
      optionLines,
      keyTerms
    };
  }

  return {
    kind: "uncertain",
    confidence: Math.max(1, Math.min(10, score + 3)),
    answerPairs,
    questionStarts,
    optionLines,
    keyTerms
  };
};

const parseQuestionsFromText = (text: string, answerMap: Map<number, OptionLabel>) => {
  const normalized = normalizeText(text);
  const starts: Array<{ number: number; index: number }> = [];
  const startRegex = /(?:^|\n)\s*(?:pregunta|item)?\s*(\d{1,3})\s*[.)]\s+/gim;

  let startMatch: RegExpExecArray | null = startRegex.exec(normalized);
  while (startMatch) {
    const questionNumber = Number(startMatch[1]);
    if (Number.isFinite(questionNumber)) {
      starts.push({
        number: questionNumber,
        index: startMatch.index
      });
    }
    startMatch = startRegex.exec(normalized);
  }

  const questions: ParsedTextQuestion[] = [];
  const seenNumbers = new Set<number>();

  for (let index = 0; index < starts.length; index += 1) {
    const current = starts[index];
    const next = starts[index + 1];
    const rawBlock = normalized.slice(current.index, next ? next.index : normalized.length);
    const block = normalizeText(rawBlock);

    if (!block || seenNumbers.has(current.number)) {
      continue;
    }

    const optionRegex = /(?:^|\n)\s*([A-D])\s*[.)]\s+([\s\S]*?)(?=(?:\n\s*[A-D]\s*[.)]\s+)|$)/gim;
    const options: Array<{ label: OptionLabel; text: string }> = [];
    let optionMatch: RegExpExecArray | null = optionRegex.exec(block);

    while (optionMatch) {
      const label = normalizeOptionLabel(optionMatch[1]);
      const optionText = compactText(optionMatch[2] ?? "");
      if (label && optionText) {
        options.push({ label, text: optionText });
      }
      optionMatch = optionRegex.exec(block);
    }

    if (options.length < 2) {
      continue;
    }

    const firstOptionMatch = /(?:^|\n)\s*[A-D]\s*[.)]\s+/im.exec(block);
    const stemRaw = firstOptionMatch ? block.slice(0, firstOptionMatch.index) : block;
    const stem = compactText(stemRaw.replace(/^\s*(?:pregunta|item)?\s*\d{1,3}\s*[.)]\s*/i, ""));
    if (!stem || stem.length < 8) {
      continue;
    }

    const inlineCorrectMatch = /(?:respuesta(?:\s+correcta)?|opci(?:o|\u00f3)n(?:\s+correcta)?|clave)\s*[:\-]?\s*([A-D])/i.exec(
      block
    );
    const inlineCorrect = inlineCorrectMatch ? normalizeOptionLabel(inlineCorrectMatch[1]) : null;
    const keyedCorrect = answerMap.get(current.number) ?? null;
    const correctLabel = inlineCorrect ?? keyedCorrect;

    seenNumbers.add(current.number);
    questions.push({
      questionNumber: current.number,
      stem,
      options,
      correctLabel
    });
  }

  return questions;
};

const deriveContextFromPath = (logicalPath: string) => {
  const normalizedPath = logicalPath.replace(/\\/g, "/").toLowerCase();
  const yearMatch = normalizedPath.match(/\b(19\d{2}|20\d{2})\b/);
  return {
    year: yearMatch?.[1] ?? null,
    area: detectArea(normalizedPath) ?? null
  };
};

const isKeyFilePath = (logicalPath: string) => {
  const normalizedPath = logicalPath.replace(/\\/g, "/").toLowerCase();
  return normalizedPath.includes("storage/claves/") || normalizedPath.includes("/claves/");
};

const chooseBestAnswerMap = (logicalPath: string, contexts: KeyContext[]) => {
  const ctx = deriveContextFromPath(logicalPath);
  let bestScore = 0;
  let bestMap: Map<number, OptionLabel> | null = null;

  for (const keyContext of contexts) {
    let score = 0;
    if (ctx.year && keyContext.year && ctx.year === keyContext.year) {
      score += 3;
    }
    if (ctx.area && keyContext.area && ctx.area === keyContext.area) {
      score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMap = keyContext.answers;
    }
  }

  return bestMap ?? new Map<number, OptionLabel>();
};

const ensureQuestionSource = async (payload: {
  logicalPath: string;
  originalFileName: string;
  sha256Hash: string;
  sourceType: QuestionSourceType;
  metadata: Record<string, unknown>;
}) => {
  const metadataJson = payload.metadata as Prisma.InputJsonValue;

  const existing = await prisma.questionSource.findFirst({
    where: {
      OR: [{ sha256: payload.sha256Hash }, { logicalPath: payload.logicalPath }]
    }
  });

  if (existing) {
    if (shouldApply) {
      await prisma.questionSource.update({
        where: { id: existing.id },
        data: {
          sourceType: payload.sourceType,
          logicalPath: payload.logicalPath,
          originalFileName: payload.originalFileName,
          sha256: payload.sha256Hash,
          metadata: metadataJson
        }
      });
    }
    return existing.id;
  }

  if (!shouldApply) {
    return `dry-run-${payload.sha256Hash.slice(0, 12)}`;
  }

  const created = await prisma.questionSource.create({
    data: {
      sourceType: payload.sourceType,
      logicalPath: payload.logicalPath,
      originalFileName: payload.originalFileName,
      sha256: payload.sha256Hash,
      metadata: metadataJson
    }
  });
  return created.id;
};

const hashQuestionCandidate = (question: ParsedQuestion) => {
  const normalizedStem = normalizeForHash(question.stem);
  const normalizedOptions = question.options.map((item) => normalizeForHash(item.text)).join("|");
  return sha256(`${normalizedStem}|${normalizedOptions}`);
};

const hasSingleCorrect = (question: ParsedQuestion) => question.options.filter((item) => item.isCorrect).length === 1;

const main = async () => {
  const allFiles: string[] = [];
  for (const directory of baseDirectories) {
    collectFiles(directory, allFiles);
  }

  const files = limit > 0 ? allFiles.slice(0, limit) : allFiles;
  const subjectByCode = new Map((await prisma.subject.findMany()).map((item) => [item.code, item.id] as const));

  const stats = {
    mode: shouldApply ? "apply" : "dry-run",
    imageKeyOcrEnabled: enableImageKeyOcr,
    imageQuestionOcrEnabled: enableImageQuestionOcr,
    minUncertainKeyAnswers,
    scannedFiles: files.length,
    processedFiles: 0,
    unreadableFiles: 0,
    sourceCreatedOrUpdated: 0,
    keyFilesProcessed: 0,
    keyMapsBuilt: 0,
    keyImageOcrFilesProcessed: 0,
    keyFilesClassifiedAsKeyTable: 0,
    keyFilesClassifiedAsStatement: 0,
    keyFilesClassifiedAsUncertain: 0,
    keyFilesSkippedByClassification: 0,
    keyFilesAcceptedFromUncertain: 0,
    questionCandidateFiles: 0,
    filesWithoutQuestionExtraction: 0,
    parsedQuestions: 0,
    parsedQuestionsWithAnswer: 0,
    insertedQuestions: 0,
    insertedActiveQuestions: 0,
    insertedInactiveQuestions: 0,
    updatedExistingQuestions: 0,
    updatedExistingActivated: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    unresolvedWithoutKey: 0,
    errors: 0,
    filesWithQuestions: 0
  };

  const parsedByExtension: Record<string, number> = {};
  const errorRows: Array<{ file: string; message: string }> = [];
  const keyClassificationRows: Array<{
    file: string;
    extension: string;
    kind: KeyDocumentKind;
    confidence: number;
    answersCount: number;
    questionStarts: number;
    optionLines: number;
    keyTerms: number;
    accepted: boolean;
  }> = [];
  const questionHashes = new Set<string>();
  const keyContexts: KeyContext[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join("/");
    if (!isKeyFilePath(relativePath)) {
      continue;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!textExtractionExtensions.has(extension) && !keyImageExtensions.has(extension)) {
      continue;
    }

    const fileBuffer = safeReadBuffer(filePath);
    if (!fileBuffer) {
      continue;
    }

    try {
      stats.keyFilesProcessed += 1;
      let extractedText = "";
      let answers = new Map<number, OptionLabel>();

      if (extension === ".xls" || extension === ".xlsx") {
        extractedText = normalizeText(spreadsheetBufferToText(fileBuffer)).slice(0, maxTextChars);
        answers = parseAnswerMapFromSpreadsheet(fileBuffer);
      } else {
        if (keyImageExtensions.has(extension)) {
          stats.keyImageOcrFilesProcessed += 1;
          extractedText = await extractTextByOcrImage(fileBuffer, "key");
        } else {
          extractedText = await extractTextByExtension(extension, fileBuffer);
        }
        extractedText = normalizeText(extractedText).slice(0, maxTextChars);
        if (extractedText) {
          answers = parseAnswerMap(extractedText);
        }
      }

      const classification: KeyDocumentClassification =
        extension === ".xls" || extension === ".xlsx"
          ? {
              kind: answers.size > 0 ? "key_table" : "uncertain",
              confidence: answers.size > 0 ? 10 : 1,
              answerPairs: answers.size,
              questionStarts: 0,
              optionLines: 0,
              keyTerms: 0
            }
          : classifyKeyDocument(extractedText, answers.size);

      if (classification.kind === "key_table") {
        stats.keyFilesClassifiedAsKeyTable += 1;
      } else if (classification.kind === "question_statement") {
        stats.keyFilesClassifiedAsStatement += 1;
      } else {
        stats.keyFilesClassifiedAsUncertain += 1;
      }

      const acceptedFromUncertain = classification.kind === "uncertain" && answers.size >= minUncertainKeyAnswers;
      const accepted = (classification.kind === "key_table" && answers.size > 0) || acceptedFromUncertain;

      if (acceptedFromUncertain) {
        stats.keyFilesAcceptedFromUncertain += 1;
      }
      if (!accepted) {
        stats.keyFilesSkippedByClassification += 1;
      }

      keyClassificationRows.push({
        file: relativePath,
        extension,
        kind: classification.kind,
        confidence: classification.confidence,
        answersCount: answers.size,
        questionStarts: classification.questionStarts,
        optionLines: classification.optionLines,
        keyTerms: classification.keyTerms,
        accepted
      });

      if (accepted) {
        stats.keyMapsBuilt += 1;
        const context = deriveContextFromPath(relativePath);
        keyContexts.push({
          logicalPath: relativePath,
          year: context.year,
          area: context.area,
          answers
        });
      }
    } catch (error) {
      errorRows.push({
        file: relativePath,
        message: `Error leyendo claves: ${error instanceof Error ? error.message : "error_desconocido"}`
      });
      stats.errors += 1;
    }
  }

  for (const filePath of files) {
    const fileBuffer = safeReadBuffer(filePath);
    if (!fileBuffer) {
      stats.unreadableFiles += 1;
      continue;
    }

    stats.processedFiles += 1;

    const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join("/");
    const fileHash = sha256(fileBuffer);
    const sourceType = detectSourceType(filePath);
    const extension = path.extname(filePath).toLowerCase();

    try {
      const sourceId = await ensureQuestionSource({
        logicalPath: relativePath,
        originalFileName: path.basename(filePath),
        sha256Hash: fileHash,
        sourceType,
        metadata: {
          sizeBytes: fileBuffer.byteLength,
          extension,
          questionExtractionSupported: textExtractionExtensions.has(extension)
        }
      });

      stats.sourceCreatedOrUpdated += 1;

      if (!textExtractionExtensions.has(extension)) {
        stats.filesWithoutQuestionExtraction += 1;
        continue;
      }

      stats.questionCandidateFiles += 1;
      parsedByExtension[extension] = (parsedByExtension[extension] ?? 0) + 1;

      const byFingerprint = new Map<string, ParsedQuestion>();
      const registerQuestion = (question: ParsedQuestion) => {
        if (!question.stem || question.options.length < 2) {
          return;
        }
        const fingerprint = hashQuestionCandidate(question);
        const existing = byFingerprint.get(fingerprint);
        if (!existing) {
          byFingerprint.set(fingerprint, question);
          return;
        }

        const existingResolved = hasSingleCorrect(existing);
        const candidateResolved = hasSingleCorrect(question);
        if (!existingResolved && candidateResolved) {
          byFingerprint.set(fingerprint, question);
        }
      };

      if (jsonStructuredExtensions.has(extension)) {
        const raw = decodeUtf8(fileBuffer);
        if (extension === ".json") {
          try {
            const parsed = JSON.parse(raw);
            const questions = extractQuestionsFromNode(parsed, { area: detectArea(relativePath) });
            questions.forEach(registerQuestion);
          } catch (error) {
            errorRows.push({
              file: relativePath,
              message: `JSON invalido: ${error instanceof Error ? error.message : "parse_error"}`
            });
            stats.errors += 1;
          }
        } else if (extension === ".jsonl") {
          const questions = parseJsonlText(raw);
          questions.forEach(registerQuestion);
        }
      }

      const extractedText = await extractTextByExtension(extension, fileBuffer);
      const normalizedText = normalizeText(extractedText).slice(0, maxTextChars);
      if (normalizedText) {
        const answerMap = chooseBestAnswerMap(relativePath, keyContexts);
        const parsedTextQuestions = parseQuestionsFromText(normalizedText, answerMap);
        for (const parsedTextQuestion of parsedTextQuestions) {
          const options = parsedTextQuestion.options.map((option) => ({
            text: option.text,
            isCorrect: parsedTextQuestion.correctLabel ? parsedTextQuestion.correctLabel === option.label : false
          }));

          registerQuestion({
            stem: parsedTextQuestion.stem,
            options,
            area: detectArea(relativePath) ?? detectArea(parsedTextQuestion.stem),
            difficulty: detectDifficulty(relativePath),
            subjectCode: detectArea(relativePath),
            topic: undefined,
            metadata: {
              sourceQuestionNumber: parsedTextQuestion.questionNumber,
              extractedFrom: extension,
              matchedAnswerMap: parsedTextQuestion.correctLabel ? "yes" : "no"
            }
          });
        }
      }

      const parsedQuestions = Array.from(byFingerprint.values());
      if (parsedQuestions.length === 0) {
        continue;
      }

      stats.filesWithQuestions += 1;
      stats.parsedQuestions += parsedQuestions.length;
      stats.parsedQuestionsWithAnswer += parsedQuestions.filter((question) => hasSingleCorrect(question)).length;

      for (const [index, question] of parsedQuestions.entries()) {
        const normalizedStem = normalizeForHash(question.stem);
        if (!normalizedStem) {
          stats.skippedInvalid += 1;
          continue;
        }

        const fingerprint = hashQuestionCandidate(question);
        if (questionHashes.has(fingerprint)) {
          stats.skippedDuplicates += 1;
          continue;
        }
        questionHashes.add(fingerprint);

        const area = question.area ?? detectArea(relativePath) ?? QuestionArea.LECTURA_CRITICA;
        const subjectId = subjectByCode.get(question.subjectCode ?? area) ?? undefined;
        const difficulty = question.difficulty ?? detectDifficulty(relativePath);
        const resolved = hasSingleCorrect(question);

        if (!resolved) {
          stats.unresolvedWithoutKey += 1;
        }

        const existing = await prisma.question.findFirst({
          where: {
            OR: [{ sourceHash: fingerprint }, { enunciado: question.stem }]
          },
          include: {
            options: {
              where: { isArchived: false },
              orderBy: { orden: "asc" }
            }
          }
        });

        if (existing) {
          const existingCorrectCount = existing.options.filter((option) => option.esCorrecta).length;
          const existingResolved = existingCorrectCount === 1;

          if (shouldApply && resolved && !existingResolved) {
            const optionByText = new Map(question.options.map((option) => [normalizeForHash(option.text), option] as const));
            const canUpdateInPlace =
              existing.options.length === question.options.length &&
              existing.options.every((option) => optionByText.has(normalizeForHash(option.textoOpcion)));

            const updateData = {
              sourceId,
              sourceHash: fingerprint,
              area,
              subjectId,
              nivelDificultad: difficulty,
              estado: true,
              explicacionRespuesta: question.explanation
            };

            if (canUpdateInPlace) {
              await prisma.$transaction([
                prisma.question.update({
                  where: { id: existing.id },
                  data: {
                    ...updateData
                  }
                }),
                ...existing.options.map((option) =>
                  prisma.questionOption.update({
                    where: { id: option.id },
                    data: {
                      esCorrecta: optionByText.get(normalizeForHash(option.textoOpcion))?.isCorrect ?? false
                    }
                  })
                )
              ]);
            } else {
              await prisma.question.update({
                where: { id: existing.id },
                data: {
                  ...updateData,
                  options: {
                    updateMany: {
                      where: { isArchived: false },
                      data: { isArchived: true }
                    },
                    create: question.options.map((option, optionIndex) => ({
                      textoOpcion: option.text,
                      esCorrecta: option.isCorrect,
                      orden: optionIndex + 1
                    }))
                  }
                }
              });
            }

            stats.updatedExistingQuestions += 1;
            stats.updatedExistingActivated += 1;
          }

          stats.skippedDuplicates += 1;
          continue;
        }

        const code = `INGEST_${fileHash.slice(0, 8)}_${String(index + 1).padStart(4, "0")}`;
        const observationParts = [
          question.metadata ? `metadata=${JSON.stringify(question.metadata)}` : "",
          !resolved ? "warning=NO_SE_ENCONTRO_CLAVE_UNICA" : ""
        ].filter(Boolean);
        const observations = observationParts.length > 0 ? observationParts.join(" | ") : undefined;

        if (!shouldApply) {
          stats.insertedQuestions += 1;
          if (resolved) {
            stats.insertedActiveQuestions += 1;
          } else {
            stats.insertedInactiveQuestions += 1;
          }
          continue;
        }

        await prisma.question.create({
          data: {
            codigoInterno: code,
            sourceId,
            sourceHash: fingerprint,
            area,
            subjectId,
            competencia: "INGESTA_BASE_CONOCIMIENTO",
            componente: question.topic ?? "GENERAL",
            nivelDificultad: difficulty,
            nivelCognitivo: "ANALISIS",
            enunciado: question.stem,
            tipoPregunta: QuestionType.SELECCION_UNICA,
            gradoObjetivo: defaultGrade,
            estado: resolved,
            explicacionRespuesta: question.explanation,
            observacionesDocente: observations,
            options: {
              create: question.options.map((option, optionIndex) => ({
                textoOpcion: option.text,
                esCorrecta: option.isCorrect,
                orden: optionIndex + 1
              }))
            }
          }
        });

        stats.insertedQuestions += 1;
        if (resolved) {
          stats.insertedActiveQuestions += 1;
        } else {
          stats.insertedInactiveQuestions += 1;
        }
      }
    } catch (error) {
      stats.errors += 1;
      errorRows.push({
        file: relativePath,
        message: error instanceof Error ? error.message : "error_desconocido"
      });
    }
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        stats,
        parsedByExtension,
        keyContexts: keyContexts.slice(0, 200).map((context) => ({
          logicalPath: context.logicalPath,
          year: context.year,
          area: context.area,
          answersCount: context.answers.size
        })),
        keyClassifications: keyClassificationRows.slice(0, 1000),
        errors: errorRows.slice(0, 1000)
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        logPath,
        stats,
        parsedByExtension,
        keyMapsBuilt: keyContexts.length
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          message: error instanceof Error ? error.message : "Error en ingesta de base de conocimiento"
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await terminateOcrWorker();
    await prisma.$disconnect();
  });
