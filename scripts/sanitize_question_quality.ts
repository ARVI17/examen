import fs from "fs";
import path from "path";
import { ExamStatus, Prisma, PrismaClient, QuestionArea } from "@prisma/client";

type QuestionQualityInput = {
  estado: boolean;
  enunciado: string;
  options: Array<{
    textoOpcion: string;
    esCorrecta: boolean;
    isArchived: boolean;
  }>;
};

type QuestionIssueCode =
  | "QUESTION_INACTIVE"
  | "EMPTY_STATEMENT"
  | "INVALID_OPTION_COUNT"
  | "EMPTY_OPTION_TEXT"
  | "INVALID_CORRECT_OPTION_COUNT";

type QuestionQualityResult = {
  valid: boolean;
  issues: QuestionIssueCode[];
  activeOptions: number;
  activeNonEmptyOptions: number;
  activeCorrectOptions: number;
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

const hasFlag = (name: string) => argv.includes(`--${name}`);

const trimText = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

const evaluateQuestionQuality = (question: QuestionQualityInput): QuestionQualityResult => {
  const issues: QuestionIssueCode[] = [];
  const activeOptions = question.options.filter((option) => !option.isArchived);
  const activeNonEmptyOptions = activeOptions.filter((option) => trimText(option.textoOpcion).length > 0);
  const activeCorrectOptions = activeOptions.filter((option) => option.esCorrecta);

  if (!question.estado) {
    issues.push("QUESTION_INACTIVE");
  }

  if (trimText(question.enunciado).length === 0) {
    issues.push("EMPTY_STATEMENT");
  }

  if (activeOptions.length !== 4) {
    issues.push("INVALID_OPTION_COUNT");
  }

  if (activeNonEmptyOptions.length !== 4) {
    issues.push("EMPTY_OPTION_TEXT");
  }

  if (activeCorrectOptions.length !== 1) {
    issues.push("INVALID_CORRECT_OPTION_COUNT");
  }

  return {
    valid: issues.length === 0,
    issues,
    activeOptions: activeOptions.length,
    activeNonEmptyOptions: activeNonEmptyOptions.length,
    activeCorrectOptions: activeCorrectOptions.length
  };
};

const shuffle = <T>(input: T[]) => {
  const items = input.slice();
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
};

const toBoolean = (value: string) => value.trim().toLowerCase() === "true";

const main = async () => {
  const prisma = new PrismaClient();
  const apply = toBoolean(getArgValue("apply", hasFlag("apply") ? "true" : "false"));
  const depublishEmptyExams = toBoolean(getArgValue("depublish-empty-exams", "true"));
  const includeInactiveQuestions = toBoolean(getArgValue("include-inactive-questions", "true"));
  const reportDir = path.resolve(process.cwd(), getArgValue("report-dir", path.join("storage", "reportes", "quality")));
  const grade = getArgValue("grade", "");
  const area = getArgValue("area", "");
  const limit = Number(getArgValue("limit", "0"));
  const normalizedArea = ((area || "").trim().toUpperCase() || undefined) as QuestionArea | undefined;

  const questionWhere: Prisma.QuestionWhereInput = {
    gradoObjetivo: grade || undefined,
    area: normalizedArea && Object.values(QuestionArea).includes(normalizedArea) ? normalizedArea : undefined,
    estado: includeInactiveQuestions ? undefined : true
  };

  try {
    const questions = await prisma.question.findMany({
      where: questionWhere,
      include: {
        options: {
          orderBy: {
            orden: "asc"
          }
        },
        examQuestions: {
          select: {
            examId: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      take: limit > 0 ? limit : undefined
    });

    const invalidBefore = questions
      .map((question) => ({
        question,
        quality: evaluateQuestionQuality(question)
      }))
      .filter((row) => !row.quality.valid);

    const actionLogs: Array<{
      questionId: string;
      codigoInterno: string;
      actions: string[];
      before: QuestionQualityResult;
      after: QuestionQualityResult;
    }> = [];

    if (apply) {
      const randomized = shuffle(invalidBefore);
      for (const row of randomized) {
        const fresh = await prisma.question.findUnique({
          where: { id: row.question.id },
          include: {
            options: {
              orderBy: {
                orden: "asc"
              }
            }
          }
        });

        if (!fresh) {
          continue;
        }

        const before = evaluateQuestionQuality(fresh);
        const actions: string[] = [];

        const trimmedStem = trimText(fresh.enunciado);
        if (trimmedStem !== fresh.enunciado) {
          await prisma.question.update({
            where: { id: fresh.id },
            data: { enunciado: trimmedStem }
          });
          actions.push("trim_question_statement");
        }

        for (const option of fresh.options) {
          const trimmedOption = trimText(option.textoOpcion);
          if (trimmedOption !== option.textoOpcion) {
            await prisma.questionOption.update({
              where: { id: option.id },
              data: { textoOpcion: trimmedOption }
            });
            actions.push(`trim_option_${option.id}`);
          }
        }

        const afterTrim = await prisma.question.findUnique({
          where: { id: fresh.id },
          include: {
            options: {
              orderBy: {
                orden: "asc"
              }
            }
          }
        });
        if (!afterTrim) {
          continue;
        }

        let activeOptions = afterTrim.options.filter((option) => !option.isArchived);
        const emptyActiveOptions = activeOptions.filter((option) => trimText(option.textoOpcion).length === 0);
        for (const option of emptyActiveOptions) {
          await prisma.questionOption.update({
            where: { id: option.id },
            data: { isArchived: true }
          });
          actions.push(`archive_empty_option_${option.id}`);
        }

        const afterEmptyArchive = await prisma.question.findUnique({
          where: { id: fresh.id },
          include: {
            options: {
              orderBy: {
                orden: "asc"
              }
            }
          }
        });
        if (!afterEmptyArchive) {
          continue;
        }

        activeOptions = afterEmptyArchive.options.filter((option) => !option.isArchived);
        if (activeOptions.length > 4) {
          const extras = activeOptions.slice(4);
          for (const option of extras) {
            await prisma.questionOption.update({
              where: { id: option.id },
              data: { isArchived: true }
            });
            actions.push(`archive_extra_option_${option.id}`);
          }
        }

        const afterOptionCount = await prisma.question.findUnique({
          where: { id: fresh.id },
          include: {
            options: {
              orderBy: {
                orden: "asc"
              }
            }
          }
        });
        if (!afterOptionCount) {
          continue;
        }

        activeOptions = afterOptionCount.options.filter((option) => !option.isArchived);
        const activeCorrect = activeOptions.filter((option) => option.esCorrecta);
        if (activeCorrect.length > 1) {
          const keep = activeCorrect[0];
          for (const option of activeCorrect.slice(1)) {
            await prisma.questionOption.update({
              where: { id: option.id },
              data: { esCorrecta: false }
            });
            actions.push(`unset_extra_correct_option_${option.id}`);
          }
          actions.push(`keep_correct_option_${keep.id}`);
        }

        const finalQuestion = await prisma.question.findUnique({
          where: { id: fresh.id },
          include: {
            options: {
              orderBy: {
                orden: "asc"
              }
            }
          }
        });
        if (!finalQuestion) {
          continue;
        }

        let after = evaluateQuestionQuality(finalQuestion);
        if (!after.valid && finalQuestion.estado) {
          await prisma.question.update({
            where: { id: finalQuestion.id },
            data: { estado: false }
          });
          actions.push("deactivate_question_unrecoverable");

          const refreshed = await prisma.question.findUnique({
            where: { id: finalQuestion.id },
            include: {
              options: {
                orderBy: {
                  orden: "asc"
                }
              }
            }
          });
          if (refreshed) {
            after = evaluateQuestionQuality(refreshed);
          }
        }

        actionLogs.push({
          questionId: fresh.id,
          codigoInterno: fresh.codigoInterno,
          actions,
          before,
          after
        });
      }
    }

    const postQuestions = await prisma.question.findMany({
      where: questionWhere,
      include: {
        options: true
      }
    });
    const invalidAfter = postQuestions
      .map((question) => ({
        questionId: question.id,
        codigoInterno: question.codigoInterno,
        quality: evaluateQuestionQuality(question)
      }))
      .filter((row) => !row.quality.valid);

    const examRows = await prisma.exam.findMany({
      where: {
        isDeleted: false,
        estado: {
          not: ExamStatus.INACTIVO
        }
      },
      include: {
        examQuestions: {
          include: {
            question: {
              include: {
                options: true
              }
            }
          }
        }
      }
    });

    const examQuality = examRows.map((exam) => {
      const validQuestions = exam.examQuestions.filter((examQuestion) =>
        evaluateQuestionQuality(examQuestion.question).valid
      ).length;

      return {
        examId: exam.id,
        nombre: exam.nombre,
        tipoPrueba: exam.tipoPrueba,
        totalQuestions: exam.examQuestions.length,
        validQuestions,
        invalidQuestions: exam.examQuestions.length - validQuestions
      };
    });

    const depublishedExamIds: string[] = [];
    if (apply && depublishEmptyExams) {
      for (const exam of examQuality) {
        if (exam.validQuestions > 0) {
          continue;
        }

        await prisma.exam.update({
          where: { id: exam.examId },
          data: {
            estado: ExamStatus.INACTIVO
          }
        });
        depublishedExamIds.push(exam.examId);
      }
    }

    fs.mkdirSync(reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const reportPath = path.join(reportDir, `question_quality_sanitize_${stamp}.json`);

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      depublishEmptyExams,
      filters: {
        grade: grade || null,
        area: area || null,
        includeInactiveQuestions,
        limit: limit > 0 ? limit : null
      },
      totals: {
        questionsScanned: questions.length,
        invalidBefore: invalidBefore.length,
        invalidAfter: invalidAfter.length,
        questionsTouched: actionLogs.length,
        examsScanned: examQuality.length,
        examsWithZeroValidQuestions: examQuality.filter((exam) => exam.validQuestions === 0).length,
        examsDepublished: depublishedExamIds.length
      },
      depublishedExamIds,
      invalidAfter: invalidAfter.slice(0, 200),
      actions: actionLogs.slice(0, 500),
      examQuality: examQuality.slice(0, 500)
    };

    fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");

    console.log(
      JSON.stringify(
        {
          success: true,
          reportPath,
          ...summary.totals
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
        message: error instanceof Error ? error.message : "Error en saneamiento de calidad"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
