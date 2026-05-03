import fs from "fs";
import path from "path";
import { ExamStatus, PrismaClient, QuestionArea } from "@prisma/client";

type SectionBlueprint = {
  code: string;
  label: string;
  scored: boolean;
  area?: QuestionArea;
  questionCount: number;
};

type SessionBlueprint = {
  id: "J1" | "J2";
  label: string;
  durationMinutes: number;
  sections: SectionBlueprint[];
};

type ValidQuestion = {
  id: string;
  area: QuestionArea;
  gradoObjetivo: string;
  competencia: string;
  enunciado: string;
  options: Array<{
    id: string;
    textoOpcion: string;
    esCorrecta: boolean;
    isArchived: boolean;
  }>;
};

type Assignment = {
  questionId: string;
  area: QuestionArea;
  sectionCode: string;
  sessionId: "J1" | "J2";
  orden: number;
};

const ICFES_SABER11_BLUEPRINT: SessionBlueprint[] = [
  {
    id: "J1",
    label: "Jornada 1",
    durationMinutes: 270,
    sections: [
      { code: "MATEMATICAS", label: "Matematicas", scored: true, area: QuestionArea.MATEMATICAS, questionCount: 25 },
      { code: "LECTURA_CRITICA", label: "Lectura Critica", scored: true, area: QuestionArea.LECTURA_CRITICA, questionCount: 41 },
      {
        code: "SOCIALES_CIUDADANAS",
        label: "Sociales y Ciudadanas",
        scored: true,
        area: QuestionArea.SOCIALES_CIUDADANAS,
        questionCount: 25
      },
      {
        code: "CIENCIAS_NATURALES",
        label: "Ciencias Naturales",
        scored: true,
        area: QuestionArea.CIENCIAS_NATURALES,
        questionCount: 29
      },
      { code: "SOCIOECONOMICO", label: "Cuestionario Socioeconomico", scored: false, questionCount: 11 }
    ]
  },
  {
    id: "J2",
    label: "Jornada 2",
    durationMinutes: 270,
    sections: [
      {
        code: "SOCIALES_CIUDADANAS",
        label: "Sociales y Ciudadanas",
        scored: true,
        area: QuestionArea.SOCIALES_CIUDADANAS,
        questionCount: 25
      },
      { code: "MATEMATICAS", label: "Matematicas", scored: true, area: QuestionArea.MATEMATICAS, questionCount: 25 },
      {
        code: "CIENCIAS_NATURALES",
        label: "Ciencias Naturales",
        scored: true,
        area: QuestionArea.CIENCIAS_NATURALES,
        questionCount: 29
      },
      { code: "INGLES", label: "Ingles", scored: true, area: QuestionArea.INGLES, questionCount: 55 },
      { code: "SOCIOECONOMICO", label: "Cuestionario Socioeconomico", scored: false, questionCount: 13 }
    ]
  }
];

const argv = process.argv.slice(2);

const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }
  const [, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const hasFlag = (name: string) => argv.includes(`--${name}`);
const toBoolean = (value: string) => value.trim().toLowerCase() === "true";
const trimText = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

const shuffle = <T>(input: T[]) => {
  const rows = input.slice();
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [rows[index], rows[randomIndex]] = [rows[randomIndex], rows[index]];
  }
  return rows;
};

const isValidQuestion = (question: ValidQuestion) => {
  if (trimText(question.enunciado).length === 0) {
    return false;
  }
  const activeOptions = question.options.filter((option) => !option.isArchived);
  if (activeOptions.length !== 4) {
    return false;
  }
  const nonEmptyOptions = activeOptions.filter((option) => trimText(option.textoOpcion).length > 0);
  if (nonEmptyOptions.length !== 4) {
    return false;
  }
  const correctOptions = activeOptions.filter((option) => option.esCorrecta);
  return correctOptions.length === 1;
};

const main = async () => {
  const prisma = new PrismaClient();
  const apply = toBoolean(getArgValue("apply", hasFlag("apply") ? "true" : "false"));
  const strict = toBoolean(getArgValue("strict", "true"));
  const publish = toBoolean(getArgValue("publish", "false"));
  const grade = getArgValue("grade", "11");
  const examName =
    getArgValue("name", "").trim() ||
    `Simulacro Saber 11 ICFES Jornadas ${new Date().toISOString().slice(0, 10)}`;
  const reportDir = path.resolve(process.cwd(), getArgValue("report-dir", path.join("storage", "reportes", "exams")));
  const questionScore = Number(getArgValue("puntaje-por-pregunta", "1"));

  const scoredDemandByArea = ICFES_SABER11_BLUEPRINT.flatMap((session) => session.sections)
    .filter((section) => section.scored && section.area)
    .reduce((acc, section) => {
      const area = section.area as QuestionArea;
      acc.set(area, (acc.get(area) ?? 0) + section.questionCount);
      return acc;
    }, new Map<QuestionArea, number>());

  try {
    const allQuestions = await prisma.question.findMany({
      where: {
        estado: true,
        gradoObjetivo: grade,
        area: {
          in: Array.from(scoredDemandByArea.keys())
        }
      },
      include: {
        options: true
      }
    });

    const validQuestions = allQuestions.filter((question) => isValidQuestion(question as ValidQuestion));
    const poolByArea = new Map<QuestionArea, ValidQuestion[]>();
    for (const question of validQuestions) {
      if (!poolByArea.has(question.area)) {
        poolByArea.set(question.area, []);
      }
      poolByArea.get(question.area)!.push(question as ValidQuestion);
    }

    for (const [area, list] of poolByArea.entries()) {
      poolByArea.set(area, shuffle(list));
    }

    const availability = Array.from(scoredDemandByArea.entries()).map(([area, required]) => {
      const available = poolByArea.get(area)?.length ?? 0;
      return {
        area,
        required,
        available,
        ok: available >= required
      };
    });

    const missing = availability.filter((row) => !row.ok);
    if (strict && missing.length > 0) {
      throw new Error(
        `No hay banco suficiente para esquema ICFES en grado ${grade}: ${missing
          .map((row) => `${row.area} requiere ${row.required} y hay ${row.available}`)
          .join("; ")}`
      );
    }

    const selectedByArea = new Map<QuestionArea, ValidQuestion[]>();
    for (const [area, required] of scoredDemandByArea.entries()) {
      const source = poolByArea.get(area) ?? [];
      const take = strict ? required : Math.min(required, source.length);
      selectedByArea.set(area, source.slice(0, take));
    }

    const assignments: Assignment[] = [];
    let orderCursor = 1;

    for (const session of ICFES_SABER11_BLUEPRINT) {
      for (const section of session.sections) {
        if (!section.scored || !section.area) {
          continue;
        }

        const areaQueue = selectedByArea.get(section.area) ?? [];
        const sectionTake = strict ? section.questionCount : Math.min(section.questionCount, areaQueue.length);
        const selectedSectionRows = areaQueue.splice(0, sectionTake);

        for (const question of selectedSectionRows) {
          assignments.push({
            questionId: question.id,
            area: question.area,
            sectionCode: section.code,
            sessionId: session.id,
            orden: orderCursor
          });
          orderCursor += 1;
        }
      }
    }

    const officialScoredQuestions = Array.from(scoredDemandByArea.values()).reduce((sum, value) => sum + value, 0);
    const officialSocioQuestions = ICFES_SABER11_BLUEPRINT.flatMap((session) => session.sections)
      .filter((section) => !section.scored)
      .reduce((sum, section) => sum + section.questionCount, 0);
    const officialTotalQuestions = officialScoredQuestions + officialSocioQuestions;
    const fulfilledBySession = ICFES_SABER11_BLUEPRINT.map((session) => {
      const allocated = assignments.filter((row) => row.sessionId === session.id).length;
      const officialScored = session.sections.filter((section) => section.scored).reduce((sum, section) => sum + section.questionCount, 0);
      const officialSocio = session.sections.filter((section) => !section.scored).reduce((sum, section) => sum + section.questionCount, 0);
      return {
        sessionId: session.id,
        label: session.label,
        officialScoredQuestions: officialScored,
        officialSocioQuestions: officialSocio,
        assignedScoredQuestions: allocated
      };
    });

    if (strict && assignments.length !== officialScoredQuestions) {
      throw new Error(
        `Asignacion incompleta en modo estricto: esperadas ${officialScoredQuestions} preguntas calificables y se asignaron ${assignments.length}`
      );
    }

    let examId: string | null = null;
    if (apply) {
      const instructions = [
        "Esquema ICFES por jornadas aplicado con validacion obligatoria de calidad de pregunta.",
        `Conteo oficial total: ${officialTotalQuestions} (calificables ${officialScoredQuestions} + socioeconomico ${officialSocioQuestions}).`,
        "Nota: el bloque socioeconomico se registra en esquema y tiempo, pero no se califica en este motor.",
        `Jornada 1: 25 MAT, 41 LC, 25 SOC, 29 CN, 11 socio.`,
        `Jornada 2: 25 SOC, 25 MAT, 29 CN, 55 ING, 13 socio.`
      ].join("\n");

      const exam = await prisma.exam.create({
        data: {
          nombre: examName,
          descripcion: "Examen generado por script con blueprint ICFES por jornadas",
          tipoPrueba: "SABER_11",
          gradoObjetivo: grade,
          estado: publish ? ExamStatus.PUBLICADO : ExamStatus.DRAFT,
          tiempoLimiteMinutos: 540,
          totalPreguntas: assignments.length,
          puntajeMaximo: Number((assignments.length * questionScore).toFixed(2)),
          instrucciones: instructions
        }
      });
      examId = exam.id;

      if (assignments.length > 0) {
        await prisma.examQuestion.createMany({
          data: assignments.map((assignment) => ({
            examId: exam.id,
            questionId: assignment.questionId,
            orden: assignment.orden,
            puntajePregunta: questionScore,
            area: assignment.area,
            metadata: {
              session: assignment.sessionId,
              section: assignment.sectionCode
            }
          }))
        });
      }
    }

    fs.mkdirSync(reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const reportPath = path.join(reportDir, `icfes_exam_generation_${stamp}.json`);

    const report = {
      generatedAt: new Date().toISOString(),
      apply,
      strict,
      publish,
      grade,
      examName,
      examId,
      blueprint: ICFES_SABER11_BLUEPRINT,
      official: {
        totalQuestions: officialTotalQuestions,
        scoredQuestions: officialScoredQuestions,
        socioeconomicoQuestions: officialSocioQuestions
      },
      assigned: {
        scoredQuestions: assignments.length,
        socioeconomicoQuestions: 0
      },
      availability,
      fulfilledBySession,
      warning:
        "El socioeconomico se deja en blueprint de jornada/tiempo; este motor solo asigna y califica preguntas de las 5 areas academicas."
    };

    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    console.log(
      JSON.stringify(
        {
          success: true,
          apply,
          strict,
          publish,
          examId,
          reportPath,
          assignedScoredQuestions: assignments.length,
          officialScoredQuestions
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : "Error generando examen ICFES por jornadas"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
