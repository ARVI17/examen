import fs from "fs";
import path from "path";
import { PrismaClient, QuestionArea, QuestionDifficulty, QuestionType } from "@prisma/client";

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

const prisma = new PrismaClient();
const argv = process.argv.slice(2);

const hasFlag = (name: string) => argv.includes(`--${name}`);

const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }

  const [_, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const inputPath = path.resolve(
  process.cwd(),
  getArgValue(
    "input",
    path.join("storage", "bancos_preguntas", "icfes", "cuadernillos", "parsed", "questions_dataset.json")
  )
);

const shouldApply = hasFlag("apply");

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

const optionOrderIndex: Record<ParsedOption["label"], number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4
};

const slugToCode = (value: string) => {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const readDataset = () => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo de entrada: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf-8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error("El dataset no tiene formato valido.");
  }

  return parsed as ParsedDataset;
};

const buildCodigoInterno = (question: ParsedQuestion) => {
  const year = String(question.sourceYear);
  const area = slugToCode(question.areaSlug);
  const number = String(question.questionNumber).padStart(3, "0");
  return `ICFES_${year}_${area}_${number}`;
};

const dedupeByCode = (questions: ParsedQuestion[]) => {
  const map = new Map<string, ParsedQuestion>();

  for (const question of questions) {
    const codigo = buildCodigoInterno(question);
    const existing = map.get(codigo);

    if (!existing) {
      map.set(codigo, question);
      continue;
    }

    const existingScore =
      (existing.correctOption ? 2 : 0) + (existing.options.length >= 4 ? 1 : 0) + existing.stem.length / 10000;
    const incomingScore =
      (question.correctOption ? 2 : 0) + (question.options.length >= 4 ? 1 : 0) + question.stem.length / 10000;

    if (incomingScore > existingScore) {
      map.set(codigo, question);
    }
  }

  return Array.from(map.values());
};

const validateQuestionForIngestion = (question: ParsedQuestion) => {
  const area = mapAreaSlugToEnum(question.areaSlug);
  if (!area) {
    return { ok: false as const, reason: "AREA_NO_MAPEADA" };
  }

  if (!question.correctOption) {
    return { ok: false as const, reason: "SIN_RESPUESTA_CORRECTA" };
  }

  if (!question.stem || question.stem.length < 8) {
    return { ok: false as const, reason: "ENUNCIADO_INVALIDO" };
  }

  const labels = question.options.map((option) => option.label);
  if (!labels.includes("A") || !labels.includes("B") || question.options.length < 2) {
    return { ok: false as const, reason: "OPCIONES_INSUFICIENTES" };
  }

  const distinctLabels = new Set(labels);
  if (distinctLabels.size !== labels.length) {
    return { ok: false as const, reason: "OPCIONES_DUPLICADAS" };
  }

  const correctCount = question.options.filter((option) => option.label === question.correctOption).length;
  if (correctCount !== 1) {
    return { ok: false as const, reason: "RESPUESTA_CORRECTA_INCONSISTENTE" };
  }

  return {
    ok: true as const,
    area
  };
};

const ingest = async () => {
  const dataset = readDataset();
  const deduped = dedupeByCode(dataset.questions);

  let ready = 0;
  const skippedByReason = new Map<string, number>();
  let created = 0;
  let updated = 0;

  for (const question of deduped) {
    const validation = validateQuestionForIngestion(question);
    if (!validation.ok) {
      skippedByReason.set(validation.reason, (skippedByReason.get(validation.reason) ?? 0) + 1);
      continue;
    }

    ready += 1;
    if (!shouldApply) {
      continue;
    }

    const codigoInterno = buildCodigoInterno(question);
    const metadata = {
      sourceKind: question.sourceKind,
      sourcePath: question.sourcePath,
      sourceUrl: question.sourceUrl,
      generatedAt: dataset.generatedAt
    };

    const sortedOptions = [...question.options].sort(
      (left, right) => optionOrderIndex[left.label] - optionOrderIndex[right.label]
    );

    const optionData = sortedOptions.map((option, index) => ({
      textoOpcion: option.text,
      esCorrecta: option.label === question.correctOption,
      orden: index + 1
    }));

    const existing = await prisma.question.findUnique({
      where: { codigoInterno }
    });

    if (!existing) {
      await prisma.question.create({
        data: {
          codigoInterno,
          area: validation.area,
          competencia: "ICFES_PRACTICA",
          componente: `CUADERNILLO_${question.sourceYear}`,
          nivelDificultad: QuestionDifficulty.MEDIO,
          nivelCognitivo: "APLICACION",
          enunciado: question.stem,
          tipoPregunta: QuestionType.SELECCION_UNICA,
          gradoObjetivo: "11",
          estado: true,
          explicacionRespuesta: question.correctOption
            ? `Respuesta correcta: ${question.correctOption}`
            : undefined,
          observacionesDocente: JSON.stringify(metadata),
          options: {
            create: optionData
          }
        }
      });
      created += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.question.update({
        where: { id: existing.id },
        data: {
          area: validation.area,
          competencia: "ICFES_PRACTICA",
          componente: `CUADERNILLO_${question.sourceYear}`,
          nivelDificultad: QuestionDifficulty.MEDIO,
          nivelCognitivo: "APLICACION",
          enunciado: question.stem,
          tipoPregunta: QuestionType.SELECCION_UNICA,
          gradoObjetivo: "11",
          estado: true,
          explicacionRespuesta: question.correctOption
            ? `Respuesta correcta: ${question.correctOption}`
            : undefined,
          observacionesDocente: JSON.stringify(metadata)
        }
      }),
      prisma.questionOption.deleteMany({
        where: { preguntaId: existing.id }
      }),
      prisma.questionOption.createMany({
        data: optionData.map((option) => ({
          preguntaId: existing.id,
          textoOpcion: option.textoOpcion,
          esCorrecta: option.esCorrecta,
          orden: option.orden
        }))
      })
    ]);

    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        mode: shouldApply ? "apply" : "dry-run",
        inputPath,
        totals: {
          datasetQuestions: dataset.questions.length,
          dedupedQuestions: deduped.length,
          readyForIngestion: ready,
          created,
          updated,
          skipped: Array.from(skippedByReason.entries()).reduce((acc, [_, value]) => acc + value, 0)
        },
        skippedByReason: Object.fromEntries(skippedByReason.entries())
      },
      null,
      2
    )
  );
};

ingest()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          message: error instanceof Error ? error.message : "Error ingiriendo preguntas ICFES"
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
