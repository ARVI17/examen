import { AttemptStatus, Prisma, QuestionArea, ReportScope } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import prisma from "../../common/prisma";
import { parseDateRange } from "../../common/utils/date";
import { ReportsRepository } from "./reports.repository";

const normalizeSearchText = (value: string) => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const extractYearFromAsset = (asset: {
  tipoPrueba: string | null;
  nombreOriginal: string;
  nombreArchivo: string;
  rutaLogica: string;
  descripcion: string | null;
}) => {
  const candidates = [asset.tipoPrueba, asset.nombreOriginal, asset.nombreArchivo, asset.rutaLogica, asset.descripcion].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    const match = candidate.match(/\b(20\d{2})\b/);
    if (!match) {
      continue;
    }

    const year = Number(match[1]);
    if (Number.isFinite(year) && year >= 2000 && year <= 2100) {
      return year;
    }
  }

  return null;
};

const isSaber11Asset = (asset: {
  tipoPrueba: string | null;
  nombreOriginal: string;
  nombreArchivo: string;
  rutaLogica: string;
  descripcion: string | null;
}) => {
  const text = normalizeSearchText(
    [asset.tipoPrueba, asset.nombreOriginal, asset.nombreArchivo, asset.rutaLogica, asset.descripcion]
      .filter((value): value is string => Boolean(value))
      .join(" ")
  );

  return text.includes("saber 11") || text.includes("saber-11") || text.includes("saber11");
};

const detectAssetType = (asset: {
  tipoPrueba: string | null;
  nombreOriginal: string;
  nombreArchivo: string;
  rutaLogica: string;
  descripcion: string | null;
}) => {
  const text = normalizeSearchText(
    [asset.tipoPrueba, asset.nombreOriginal, asset.nombreArchivo, asset.rutaLogica, asset.descripcion]
      .filter((value): value is string => Boolean(value))
      .join(" ")
  );

  if (text.includes("cuadernillo")) {
    return "cuadernillo";
  }

  if (text.includes("guia")) {
    return "guia_orientacion";
  }

  if (text.includes("practica") || text.includes("explicad")) {
    return "practica";
  }

  if (text.includes("informe")) {
    return "informe";
  }

  if (text.includes("infografia")) {
    return "infografia";
  }

  if (text.includes("marco") || text.includes("niveles") || /\bmr\b/.test(text)) {
    return "marco_referencia";
  }

  return "otro";
};

type FilesCoverageQuery = {
  from?: string;
  to?: string;
  yearFrom?: number;
  yearTo?: number;
  categoria?: string;
  area?: string;
  tipoPrueba?: string;
  activo?: boolean;
  includeDeleted?: boolean;
  onlySaber11?: boolean;
  q?: string;
};

type CoverageAsset = {
  id: string;
  categoria: string;
  area: QuestionArea | null;
  tipoPrueba: string | null;
  nombreOriginal: string;
  nombreArchivo: string;
  descripcion: string | null;
  pesoBytes: number;
  activo: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  rutaLogica: string;
  detectedYear: number | null;
  detectedType: string;
};

const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
};

const escapePdfText = (value: string) => {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
};

const buildSimplePdf = (title: string, lines: string[]) => {
  const safeLines = [title, "", ...lines].slice(0, 120);
  const lineBlocks = safeLines.map((line, index) => {
    const y = 790 - index * 14;
    return `BT /F1 11 Tf 40 ${y} Td (${escapePdfText(line.slice(0, 160))}) Tj ET`;
  });
  const streamBody = lineBlocks.join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(streamBody, "utf8")} >> stream\n${streamBody}\nendstream endobj`
  ];

  let content = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(content, "utf8"));
    content += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(content, "utf8");
  content += `xref\n0 ${objects.length + 1}\n`;
  content += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    content += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  content += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(content, "utf8");
};

const buildFileAssetsWhere = (typedQuery: FilesCoverageQuery) => {
  const dateRange = parseDateRange(typedQuery.from, typedQuery.to);

  const where: Prisma.FileAssetWhereInput = {
    categoria: typedQuery.categoria as any,
    area: typedQuery.area as any,
    tipoPrueba: typedQuery.tipoPrueba
      ? {
          contains: typedQuery.tipoPrueba,
          mode: "insensitive"
        }
      : undefined,
    activo: typedQuery.activo,
    createdAt: dateRange,
    deletedAt: typedQuery.includeDeleted ? undefined : null
  };

  if (typedQuery.activo === undefined && !typedQuery.includeDeleted) {
    where.activo = true;
  }

  const andFilters: Prisma.FileAssetWhereInput[] = [];

  if (typedQuery.q) {
    andFilters.push({
      OR: [
        { nombreOriginal: { contains: typedQuery.q, mode: "insensitive" } },
        { nombreArchivo: { contains: typedQuery.q, mode: "insensitive" } },
        { descripcion: { contains: typedQuery.q, mode: "insensitive" } },
        { tipoPrueba: { contains: typedQuery.q, mode: "insensitive" } },
        { rutaLogica: { contains: typedQuery.q, mode: "insensitive" } }
      ]
    });
  }

  if (typedQuery.onlySaber11 ?? true) {
    andFilters.push({
      OR: [
        { tipoPrueba: { contains: "Saber 11", mode: "insensitive" } },
        { nombreOriginal: { contains: "Saber 11", mode: "insensitive" } },
        { nombreOriginal: { contains: "saber-11", mode: "insensitive" } },
        { nombreArchivo: { contains: "Saber 11", mode: "insensitive" } },
        { descripcion: { contains: "Saber 11", mode: "insensitive" } },
        { rutaLogica: { contains: "saber11", mode: "insensitive" } }
      ]
    });
  }

  if (andFilters.length) {
    where.AND = andFilters;
  }

  return where;
};

const listCoverageAssets = async (typedQuery: FilesCoverageQuery): Promise<CoverageAsset[]> => {
  const where = buildFileAssetsWhere(typedQuery);
  const fileAssets = await ReportsRepository.listFileAssetsForCoverage(where);

  return fileAssets
    .map((asset) => {
      const year = extractYearFromAsset(asset);
      const type = detectAssetType(asset);
      return {
        ...asset,
        detectedYear: year,
        detectedType: type
      };
    })
    .filter((asset) => {
      if ((typedQuery.onlySaber11 ?? true) && !isSaber11Asset(asset)) {
        return false;
      }

      if (typedQuery.yearFrom && (!asset.detectedYear || asset.detectedYear < typedQuery.yearFrom)) {
        return false;
      }

      if (typedQuery.yearTo && (!asset.detectedYear || asset.detectedYear > typedQuery.yearTo)) {
        return false;
      }

      return true;
    });
};

export class ReportService {
  static async studentSummary(numeroIdentificacion: string, query: Record<string, unknown>) {
    const student = await ReportsRepository.findStudentByDocument(numeroIdentificacion);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    const dateRange = parseDateRange(query.from as string | undefined, query.to as string | undefined);
    const attempts = await ReportsRepository.listStudentAttempts(student.id, dateRange);

    const gradedAttempts = attempts.filter((attempt) => attempt.estado === AttemptStatus.CALIFICADA);
    const averagePercentage =
      gradedAttempts.length > 0
        ? Number(
            (
              gradedAttempts.reduce((acc, attempt) => acc + (attempt.porcentajeTotal ?? 0), 0) /
              gradedAttempts.length
            ).toFixed(2)
          )
        : 0;

    const averageScore =
      gradedAttempts.length > 0
        ? Number(
            (
              gradedAttempts.reduce((acc, attempt) => acc + (attempt.puntajeTotalObtenido ?? 0), 0) /
              gradedAttempts.length
            ).toFixed(2)
          )
        : 0;

    const bestPercentage =
      gradedAttempts.length > 0 ? Math.max(...gradedAttempts.map((attempt) => attempt.porcentajeTotal ?? 0)) : 0;
    const worstPercentage =
      gradedAttempts.length > 0 ? Math.min(...gradedAttempts.map((attempt) => attempt.porcentajeTotal ?? 0)) : 0;

    return {
      student,
      totalAttempts: attempts.length,
      gradedAttempts: gradedAttempts.length,
      averagePercentage,
      averageScore,
      promedioPorcentaje: averagePercentage,
      promedioPuntaje: averageScore,
      bestPercentage,
      worstPercentage,
      mejorPorcentaje: bestPercentage,
      peorPorcentaje: worstPercentage,
      latestResult: attempts[0] ?? null,
      attempts
    };
  }

  static async studentAreas(numeroIdentificacion: string, query: Record<string, unknown>) {
    const student = await ReportsRepository.findStudentByDocument(numeroIdentificacion);

    if (!student || student.isDeleted) {
      throw new AppError("Estudiante no encontrado", 404, "NOT_FOUND");
    }

    const dateRange = parseDateRange(query.from as string | undefined, query.to as string | undefined);
    const areaResults = await ReportsRepository.listStudentAreaResults(student.id, dateRange);

    const aggregates = new Map<
      QuestionArea,
      {
        area: QuestionArea;
        intentos: number;
        totalCorrectas: number;
        totalPreguntas: number;
        promedioPorcentaje: number;
        promedioPuntaje: number;
      }
    >();

    for (const item of areaResults) {
      if (!aggregates.has(item.area)) {
        aggregates.set(item.area, {
          area: item.area,
          intentos: 0,
          totalCorrectas: 0,
          totalPreguntas: 0,
          promedioPorcentaje: 0,
          promedioPuntaje: 0
        });
      }

      const aggregate = aggregates.get(item.area)!;
      aggregate.intentos += 1;
      aggregate.totalCorrectas += item.correctas;
      aggregate.totalPreguntas += item.totalPreguntasArea;
      aggregate.promedioPorcentaje += item.porcentajeArea;
      aggregate.promedioPuntaje += item.puntajeArea;
    }

    const summary = Array.from(aggregates.values()).map((aggregate) => ({
      area: aggregate.area,
      intentos: aggregate.intentos,
      totalCorrectas: aggregate.totalCorrectas,
      totalPreguntas: aggregate.totalPreguntas,
      porcentajeAcierto: aggregate.totalPreguntas
        ? Number(((aggregate.totalCorrectas / aggregate.totalPreguntas) * 100).toFixed(2))
        : 0,
      promedioPorcentaje: Number((aggregate.promedioPorcentaje / aggregate.intentos).toFixed(2)),
      promedioPuntaje: Number((aggregate.promedioPuntaje / aggregate.intentos).toFixed(2))
    }));

    return {
      student,
      totalAreaResults: areaResults.length,
      summary,
      details: areaResults
    };
  }

  static async examSummary(examId: string, query: Record<string, unknown>) {
    const exam = await ReportsRepository.findExamById(examId);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const dateRange = parseDateRange(query.from as string | undefined, query.to as string | undefined);
    const attempts = await ReportsRepository.listExamAttempts(examId, {
      grado: query.grado as string | undefined,
      dateRange
    });

    const graded = attempts.filter((attempt) => attempt.estado === AttemptStatus.CALIFICADA);
    const totalUniqueStudents = new Set(attempts.map((attempt) => attempt.estudianteId)).size;

    const averagePercentage =
      graded.length > 0
        ? Number(
            (
              graded.reduce((acc, attempt) => acc + (attempt.porcentajeTotal ?? 0), 0) /
              graded.length
            ).toFixed(2)
          )
        : 0;

    const highestPercentage =
      graded.length > 0 ? Math.max(...graded.map((attempt) => attempt.porcentajeTotal ?? 0)) : 0;
    const lowestPercentage =
      graded.length > 0 ? Math.min(...graded.map((attempt) => attempt.porcentajeTotal ?? 0)) : 0;

    const areaAccumulator = new Map<QuestionArea, { totalCorrectas: number; totalPreguntas: number }>();

    for (const attempt of graded) {
      for (const areaResult of attempt.areaResults) {
        if (!areaAccumulator.has(areaResult.area)) {
          areaAccumulator.set(areaResult.area, { totalCorrectas: 0, totalPreguntas: 0 });
        }

        const accumulator = areaAccumulator.get(areaResult.area)!;
        accumulator.totalCorrectas += areaResult.correctas;
        accumulator.totalPreguntas += areaResult.totalPreguntasArea;
      }
    }

    const percentageByArea = Array.from(areaAccumulator.entries()).map(([area, values]) => ({
      area,
      porcentajeAcierto: values.totalPreguntas
        ? Number(((values.totalCorrectas / values.totalPreguntas) * 100).toFixed(2))
        : 0,
      totalCorrectas: values.totalCorrectas,
      totalPreguntas: values.totalPreguntas
    }));

    return {
      exam,
      totalAttempts: attempts.length,
      gradedAttempts: graded.length,
      totalUniqueStudents,
      averagePercentage,
      highestPercentage,
      lowestPercentage,
      percentageByArea,
      attempts
    };
  }

  static async examRanking(examId: string, query: Record<string, unknown>) {
    const exam = await ReportsRepository.findExamById(examId);

    if (!exam || exam.isDeleted) {
      throw new AppError("Prueba no encontrada", 404, "NOT_FOUND");
    }

    const dateRange = parseDateRange(query.from as string | undefined, query.to as string | undefined);

    const attempts = await ReportsRepository.listExamAttempts(examId, {
      grado: query.grado as string | undefined,
      dateRange
    });

    const ranking = attempts
      .filter((attempt) => attempt.estado === AttemptStatus.CALIFICADA)
      .sort((a, b) => {
        if ((b.puntajeTotalObtenido ?? 0) === (a.puntajeTotalObtenido ?? 0)) {
          return (b.porcentajeTotal ?? 0) - (a.porcentajeTotal ?? 0);
        }
        return (b.puntajeTotalObtenido ?? 0) - (a.puntajeTotalObtenido ?? 0);
      })
      .map((attempt, index) => ({
        posicion: index + 1,
        intentoId: attempt.id,
        estudiante: {
          id: attempt.estudiante.id,
          nombres: attempt.estudiante.nombres,
          apellidos: attempt.estudiante.apellidos,
          numeroIdentificacion: attempt.estudiante.numeroIdentificacion,
          grado: attempt.estudiante.grado
        },
        puntajeTotalObtenido: attempt.puntajeTotalObtenido,
        porcentajeTotal: attempt.porcentajeTotal,
        nivelDesempenoGlobal: attempt.nivelDesempenoGlobal,
        fechaFin: attempt.fechaFin
      }));

    return {
      exam,
      totalRanking: ranking.length,
      ranking
    };
  }

  static async dashboardOverview(query: Record<string, unknown>) {
    const dateRange = parseDateRange(query.from as string | undefined, query.to as string | undefined);
    const grado = query.grado as string | undefined;
    const schoolId = query.schoolId as string | undefined;
    const groupId = query.groupId as string | undefined;
    const limit = Number(query.limit ?? 20);

    const [
      totalStudents,
      totalExams,
      totalAttempts,
      totalGradedAttempts,
      latestAttempts,
      gradedAggregate,
      areaResults
    ] = await Promise.all([
      ReportsRepository.countStudents({ grado, schoolId, groupId }),
      ReportsRepository.countExams(),
      ReportsRepository.countAttempts({
        fechaInicio: dateRange,
        estudiante: grado
          ? { grado, schoolId, groupId, isDeleted: false }
          : { schoolId, groupId, isDeleted: false }
      }),
      ReportsRepository.countAttempts({
        estado: AttemptStatus.CALIFICADA,
        fechaInicio: dateRange,
        estudiante: grado
          ? { grado, schoolId, groupId, isDeleted: false }
          : { schoolId, groupId, isDeleted: false }
      }),
      ReportsRepository.listDashboardAttempts({
        grado,
        schoolId,
        groupId,
        dateRange,
        limit
      }),
      ReportsRepository.aggregateDashboardGradedAttempts({ grado, schoolId, groupId, dateRange }),
      ReportsRepository.listDashboardAreaResults({ grado, schoolId, groupId, dateRange })
    ]);

    const averageGlobalPercentage = Number((gradedAggregate._avg.porcentajeTotal ?? 0).toFixed(2));
    const averageGlobalScore = Number((gradedAggregate._avg.puntajeTotalObtenido ?? 0).toFixed(2));

    const areaAccumulator = new Map<QuestionArea, { correctas: number; preguntas: number }>();

    for (const areaResult of areaResults) {
      if (!areaAccumulator.has(areaResult.area)) {
        areaAccumulator.set(areaResult.area, { correctas: 0, preguntas: 0 });
      }

      const current = areaAccumulator.get(areaResult.area)!;
      current.correctas += areaResult.correctas;
      current.preguntas += areaResult.totalPreguntasArea;
    }

    const percentageByArea = Array.from(areaAccumulator.entries()).map(([area, values]) => ({
      area,
      porcentajeAcierto: values.preguntas
        ? Number(((values.correctas / values.preguntas) * 100).toFixed(2))
        : 0,
      totalCorrectas: values.correctas,
      totalPreguntas: values.preguntas
    }));

    const latestResultByStudent = new Map<string, (typeof latestAttempts)[number]>();

    for (const attempt of latestAttempts) {
      if (!latestResultByStudent.has(attempt.estudianteId)) {
        latestResultByStudent.set(attempt.estudianteId, attempt);
      }
    }

    const studentsWithLatestResults = Array.from(latestResultByStudent.values()).map((attempt) => ({
      estudiante: {
        id: attempt.estudiante.id,
        nombres: attempt.estudiante.nombres,
        apellidos: attempt.estudiante.apellidos,
        numeroIdentificacion: attempt.estudiante.numeroIdentificacion,
        grado: attempt.estudiante.grado
      },
      ultimoResultado: {
        intentoId: attempt.id,
        prueba: attempt.prueba.nombre,
        porcentajeTotal: attempt.porcentajeTotal,
        nivelDesempenoGlobal: attempt.nivelDesempenoGlobal,
        fechaFin: attempt.fechaFin
      }
    }));

    return {
      totalStudents,
      totalExams,
      totalAttempts,
      totalGradedAttempts,
      averageGlobalPercentage,
      averageGlobalScore,
      percentageByArea,
      studentsWithLatestResults,
      generatedAt: new Date().toISOString()
    };
  }

  private static buildScopeAggregates(attempts: Awaited<ReturnType<typeof ReportsRepository.listAttemptsForScope>>) {
    const graded = attempts.filter((attempt) => attempt.estado === AttemptStatus.CALIFICADA);
    const students = new Map<
      string,
      {
        studentId: string;
        nombres: string;
        apellidos: string;
        numeroIdentificacion: string;
        grado: string;
        grupo: string | null;
        institucion: string | null;
        attempts: number;
        gradedAttempts: number;
        avgPercentageAccumulator: number;
        bestPercentage: number;
      }
    >();

    const bySubject = new Map<string, { subject: string; total: number; correct: number }>();
    const byTopic = new Map<string, { topic: string; total: number; correct: number }>();
    const byQuestion = new Map<
      string,
      { questionId: string; enunciado: string; total: number; correct: number; incorrect: number }
    >();

    for (const attempt of attempts) {
      if (!students.has(attempt.estudianteId)) {
        students.set(attempt.estudianteId, {
          studentId: attempt.estudianteId,
          nombres: attempt.estudiante.nombres,
          apellidos: attempt.estudiante.apellidos,
          numeroIdentificacion: attempt.estudiante.numeroIdentificacion,
          grado: attempt.estudiante.grado,
          grupo: attempt.estudiante.grupo,
          institucion: attempt.estudiante.institucion,
          attempts: 0,
          gradedAttempts: 0,
          avgPercentageAccumulator: 0,
          bestPercentage: 0
        });
      }

      const studentAggregate = students.get(attempt.estudianteId)!;
      studentAggregate.attempts += 1;

      if (attempt.estado === AttemptStatus.CALIFICADA) {
        studentAggregate.gradedAttempts += 1;
        studentAggregate.avgPercentageAccumulator += attempt.porcentajeTotal ?? 0;
        studentAggregate.bestPercentage = Math.max(studentAggregate.bestPercentage, attempt.porcentajeTotal ?? 0);
      }

      for (const answer of attempt.studentAnswers) {
        const subjectName = answer.pregunta.subject?.name ?? answer.pregunta.area;
        if (!bySubject.has(subjectName)) {
          bySubject.set(subjectName, { subject: subjectName, total: 0, correct: 0 });
        }
        const subjectRow = bySubject.get(subjectName)!;
        subjectRow.total += 1;
        if (answer.esCorrecta) {
          subjectRow.correct += 1;
        }

        for (const link of answer.pregunta.topicLinks) {
          if (!byTopic.has(link.topic.name)) {
            byTopic.set(link.topic.name, { topic: link.topic.name, total: 0, correct: 0 });
          }
          const topicRow = byTopic.get(link.topic.name)!;
          topicRow.total += 1;
          if (answer.esCorrecta) {
            topicRow.correct += 1;
          }
        }

        if (!byQuestion.has(answer.preguntaId)) {
          byQuestion.set(answer.preguntaId, {
            questionId: answer.preguntaId,
            enunciado: answer.pregunta.enunciado,
            total: 0,
            correct: 0,
            incorrect: 0
          });
        }
        const questionRow = byQuestion.get(answer.preguntaId)!;
        questionRow.total += 1;
        if (answer.esCorrecta) {
          questionRow.correct += 1;
        } else {
          questionRow.incorrect += 1;
        }
      }
    }

    const studentRows = Array.from(students.values())
      .map((row) => ({
        ...row,
        averagePercentage: row.gradedAttempts
          ? Number((row.avgPercentageAccumulator / row.gradedAttempts).toFixed(2))
          : 0
      }))
      .sort((a, b) => b.averagePercentage - a.averagePercentage);

    const subjectRows = Array.from(bySubject.values())
      .map((row) => ({
        subject: row.subject,
        total: row.total,
        correct: row.correct,
        incorrect: row.total - row.correct,
        porcentajeAcierto: row.total ? Number(((row.correct / row.total) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.total - a.total);

    const topicRows = Array.from(byTopic.values())
      .map((row) => ({
        topic: row.topic,
        total: row.total,
        correct: row.correct,
        incorrect: row.total - row.correct,
        porcentajeAcierto: row.total ? Number(((row.correct / row.total) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.total - a.total);

    const questionRows = Array.from(byQuestion.values()).map((row) => ({
      ...row,
      porcentajeAcierto: row.total ? Number(((row.correct / row.total) * 100).toFixed(2)) : 0
    }));

    const mostFailed = [...questionRows].sort((a, b) => b.incorrect - a.incorrect).slice(0, 10);
    const mostCorrect = [...questionRows].sort((a, b) => b.correct - a.correct).slice(0, 10);

    return {
      totalAttempts: attempts.length,
      gradedAttempts: graded.length,
      studentsWithAttempts: studentRows.length,
      averagePercentage: graded.length
        ? Number((graded.reduce((acc, attempt) => acc + (attempt.porcentajeTotal ?? 0), 0) / graded.length).toFixed(2))
        : 0,
      ranking: studentRows,
      bySubject: subjectRows,
      byTopic: topicRows,
      questions: {
        mostFailed,
        mostCorrect
      }
    };
  }

  private static async storeReport(scope: ReportScope, scopeRef: string | undefined, payload: unknown) {
    try {
      await prisma.reportRecord.create({
        data: {
          scope,
          scopeRef,
          payload: payload as Prisma.InputJsonValue
        }
      });
    } catch {
      // Sin impacto funcional para consulta de reportes en tiempo real.
    }
  }

  static async studentPerformance(numeroIdentificacion: string, query: Record<string, unknown>) {
    const summary = await this.studentSummary(numeroIdentificacion, query);
    const areas = await this.studentAreas(numeroIdentificacion, query);
    const average = summary.averagePercentage ?? 0;
    const riskLevel = average >= 75 ? "BAJO" : average >= 50 ? "MEDIO" : "ALTO";

    const payload = {
      student: summary.student,
      totals: {
        totalAttempts: summary.totalAttempts,
        gradedAttempts: summary.gradedAttempts,
        averagePercentage: summary.averagePercentage,
        averageScore: summary.averageScore,
        bestPercentage: summary.bestPercentage,
        worstPercentage: summary.worstPercentage,
        riskLevel
      },
      areas: areas.summary,
      latestResult: summary.latestResult
    };

    await this.storeReport(ReportScope.STUDENT, summary.student.id, payload);
    return payload;
  }

  static async studentPerformanceExportCsv(numeroIdentificacion: string, query: Record<string, unknown>) {
    const performance = await this.studentPerformance(numeroIdentificacion, query);

    const header = ["student_document", "student_name", "metric", "value"];
    const rows = [
      [
        performance.student.numeroIdentificacion,
        `${performance.student.nombres} ${performance.student.apellidos}`.trim(),
        "risk_level",
        performance.totals.riskLevel
      ],
      [
        performance.student.numeroIdentificacion,
        `${performance.student.nombres} ${performance.student.apellidos}`.trim(),
        "average_percentage",
        performance.totals.averagePercentage
      ],
      [
        performance.student.numeroIdentificacion,
        `${performance.student.nombres} ${performance.student.apellidos}`.trim(),
        "average_score",
        performance.totals.averageScore
      ]
    ];

    for (const area of performance.areas) {
      rows.push([
        performance.student.numeroIdentificacion,
        `${performance.student.nombres} ${performance.student.apellidos}`.trim(),
        `area_${area.area}_accuracy`,
        area.porcentajeAcierto
      ]);
    }

    const lines = [header, ...rows].map((row) => row.map((value) => csvEscape(value)).join(","));
    const csv = `${lines.join("\n")}\n`;

    return {
      fileName: `student_performance_${numeroIdentificacion}.csv`,
      csv
    };
  }

  static async studentPerformanceExportPdf(numeroIdentificacion: string, query: Record<string, unknown>) {
    const performance = await this.studentPerformance(numeroIdentificacion, query);
    const lines = [
      `Documento: ${performance.student.numeroIdentificacion}`,
      `Nombre: ${performance.student.nombres} ${performance.student.apellidos}`.trim(),
      `Intentos: ${performance.totals.totalAttempts}`,
      `Intentos calificados: ${performance.totals.gradedAttempts}`,
      `Promedio porcentaje: ${performance.totals.averagePercentage}`,
      `Promedio puntaje: ${performance.totals.averageScore}`,
      `Nivel de riesgo: ${performance.totals.riskLevel}`,
      "",
      "Por area:"
    ];
    for (const area of performance.areas) {
      lines.push(`- ${area.area}: ${area.porcentajeAcierto}%`);
    }

    return {
      fileName: `student_performance_${numeroIdentificacion}.pdf`,
      pdfBuffer: buildSimplePdf("Reporte de Desempeno Estudiante", lines)
    };
  }

  static async classroomSummary(query: Record<string, unknown>) {
    const dateRange = parseDateRange(query.from as string | undefined, query.to as string | undefined);
    const schoolId = query.schoolId as string | undefined;
    const groupId = query.groupId as string | undefined;
    const grado = query.grado as string | undefined;
    const grupo = query.grupo as string | undefined;
    const institucion = query.institucion as string | undefined;
    const limit = Number(query.limit ?? 3000);

    const attempts = await ReportsRepository.listAttemptsForScope({
      schoolId,
      groupId,
      grado,
      dateRange
    });

    const scopedAttempts = attempts.filter((attempt) => {
      if (grupo && attempt.estudiante.grupo !== grupo) {
        return false;
      }
      if (institucion && attempt.estudiante.institucion !== institucion) {
        return false;
      }
      return true;
    });

    const trimmedAttempts = scopedAttempts.slice(0, limit);
    const aggregates = this.buildScopeAggregates(trimmedAttempts);

    const payload = {
      filters: {
        schoolId,
        groupId,
        grado,
        grupo,
        institucion,
        from: query.from,
        to: query.to,
        limit
      },
      totals: {
        studentsWithAttempts: aggregates.studentsWithAttempts,
        totalAttempts: aggregates.totalAttempts,
        gradedAttempts: aggregates.gradedAttempts,
        averagePercentage: aggregates.averagePercentage
      },
      ranking: aggregates.ranking,
      bySubject: aggregates.bySubject,
      byTopic: aggregates.byTopic,
      questions: aggregates.questions
    };

    await this.storeReport(ReportScope.GROUP, groupId ?? "classroom", payload);
    return payload;
  }

  static async classroomSummaryExportCsv(query: Record<string, unknown>) {
    const summary = await this.classroomSummary(query);
    const header = ["student_document", "student_name", "grado", "grupo", "institucion", "attempts", "average_percentage"];
    const rows = summary.ranking.map((row) => [
      row.numeroIdentificacion,
      `${row.nombres} ${row.apellidos}`.trim(),
      row.grado,
      row.grupo ?? "",
      row.institucion ?? "",
      row.attempts,
      row.averagePercentage
    ]);
    const lines = [header, ...rows].map((row) => row.map((value) => csvEscape(value)).join(","));

    return {
      fileName: "classroom_summary.csv",
      csv: `${lines.join("\n")}\n`
    };
  }

  static async classroomSummaryExportPdf(query: Record<string, unknown>) {
    const summary = await this.classroomSummary(query);
    const lines = [
      `Estudiantes con intentos: ${summary.totals.studentsWithAttempts}`,
      `Intentos totales: ${summary.totals.totalAttempts}`,
      `Intentos calificados: ${summary.totals.gradedAttempts}`,
      `Promedio porcentaje: ${summary.totals.averagePercentage}`,
      ""
    ];
    for (const row of summary.ranking.slice(0, 40)) {
      lines.push(
        `${row.numeroIdentificacion} | ${row.nombres} ${row.apellidos} | Promedio ${row.averagePercentage}% | Intentos ${row.attempts}`
      );
    }

    return {
      fileName: "classroom_summary.pdf",
      pdfBuffer: buildSimplePdf("Reporte de Aula", lines)
    };
  }

  static async groupSummary(groupId: string, query: Record<string, unknown>) {
    const group = await ReportsRepository.findGroupById(groupId);
    if (!group) {
      throw new AppError("Grupo no encontrado", 404, "NOT_FOUND");
    }
    const summary = await this.classroomSummary({
      ...query,
      groupId
    });

    const payload = {
      group,
      ...summary
    };
    await this.storeReport(ReportScope.GROUP, groupId, payload);
    return payload;
  }

  static async schoolSummary(schoolId: string, query: Record<string, unknown>) {
    const school = await ReportsRepository.findSchoolById(schoolId);
    if (!school) {
      throw new AppError("Colegio no encontrado", 404, "NOT_FOUND");
    }
    const summary = await this.classroomSummary({
      ...query,
      schoolId
    });

    const payload = {
      school,
      ...summary
    };
    await this.storeReport(ReportScope.SCHOOL, schoolId, payload);
    return payload;
  }

  static async questionsReadiness(query: Record<string, unknown>) {
    const gradoObjetivo = query.gradoObjetivo as string | undefined;
    const targetPerArea = Number(query.targetPerArea ?? 120);
    const rows = await ReportsRepository.listQuestionsReadiness({ gradoObjetivo });

    const byArea = rows.map((row) => {
      const total = row._count._all;
      const deficit = Math.max(0, targetPerArea - total);
      const coveragePercent = targetPerArea > 0 ? Number(((total / targetPerArea) * 100).toFixed(2)) : 0;
      return {
        area: row.area,
        totalQuestions: total,
        target: targetPerArea,
        deficit,
        coveragePercent
      };
    });

    const totalQuestions = byArea.reduce((acc, row) => acc + row.totalQuestions, 0);
    const totalTarget = byArea.length * targetPerArea;
    const overallCoveragePercent = totalTarget ? Number(((totalQuestions / totalTarget) * 100).toFixed(2)) : 0;

    return {
      totals: {
        totalQuestions,
        totalTarget,
        overallCoveragePercent
      },
      byArea
    };
  }

  static async materialLocalCoverage() {
    const items = await ReportsRepository.listMaterialCoverage();
    const totalAssets = items.length;
    const activeAssets = items.filter((item) => item.activo).length;
    const totalSizeBytes = items.reduce((acc, item) => acc + item.pesoBytes, 0);

    const byCategory = new Map<string, number>();
    const byArea = new Map<string, number>();
    for (const item of items) {
      byCategory.set(item.categoria, (byCategory.get(item.categoria) ?? 0) + 1);
      byArea.set(item.area ?? "SIN_AREA", (byArea.get(item.area ?? "SIN_AREA") ?? 0) + 1);
    }

    return {
      totals: {
        totalAssets,
        activeAssets,
        totalSizeBytes,
        coveragePercent: totalAssets ? Number(((activeAssets / totalAssets) * 100).toFixed(2)) : 0
      },
      byCategory: Array.from(byCategory.entries()).map(([categoria, total]) => ({ categoria, total })),
      byArea: Array.from(byArea.entries()).map(([area, total]) => ({ area, total })),
      items: items.slice(0, 200)
    };
  }

  static async filesCoverage(query: Record<string, unknown>) {
    const typedQuery = query as FilesCoverageQuery;
    const normalizedAssets = await listCoverageAssets(typedQuery);

    const totals = {
      totalFiles: normalizedAssets.length,
      totalSizeBytes: normalizedAssets.reduce((acc, asset) => acc + asset.pesoBytes, 0),
      activeFiles: normalizedAssets.filter((asset) => asset.activo).length,
      inactiveFiles: normalizedAssets.filter((asset) => !asset.activo).length,
      filesWithDetectedYear: normalizedAssets.filter((asset) => asset.detectedYear !== null).length,
      filesWithoutDetectedYear: normalizedAssets.filter((asset) => asset.detectedYear === null).length
    };

    const categoryAccumulator = new Map<string, { categoria: string; totalFiles: number; totalSizeBytes: number }>();
    const typeAccumulator = new Map<string, { type: string; totalFiles: number; totalSizeBytes: number }>();
    const yearAccumulator = new Map<
      string,
      {
        year: number | null;
        label: string;
        totalFiles: number;
        totalSizeBytes: number;
        byType: Map<
          string,
          {
            type: string;
            totalFiles: number;
            totalSizeBytes: number;
            byCategory: Map<string, { categoria: string; totalFiles: number; totalSizeBytes: number }>;
          }
        >;
      }
    >();

    for (const asset of normalizedAssets) {
      const categoryKey = asset.categoria;
      if (!categoryAccumulator.has(categoryKey)) {
        categoryAccumulator.set(categoryKey, {
          categoria: categoryKey,
          totalFiles: 0,
          totalSizeBytes: 0
        });
      }
      const categoryItem = categoryAccumulator.get(categoryKey)!;
      categoryItem.totalFiles += 1;
      categoryItem.totalSizeBytes += asset.pesoBytes;

      const typeKey = asset.detectedType;
      if (!typeAccumulator.has(typeKey)) {
        typeAccumulator.set(typeKey, {
          type: typeKey,
          totalFiles: 0,
          totalSizeBytes: 0
        });
      }
      const typeItem = typeAccumulator.get(typeKey)!;
      typeItem.totalFiles += 1;
      typeItem.totalSizeBytes += asset.pesoBytes;

      const yearKey = asset.detectedYear ? String(asset.detectedYear) : "sin_anio";
      if (!yearAccumulator.has(yearKey)) {
        yearAccumulator.set(yearKey, {
          year: asset.detectedYear,
          label: yearKey,
          totalFiles: 0,
          totalSizeBytes: 0,
          byType: new Map()
        });
      }
      const yearItem = yearAccumulator.get(yearKey)!;
      yearItem.totalFiles += 1;
      yearItem.totalSizeBytes += asset.pesoBytes;

      if (!yearItem.byType.has(typeKey)) {
        yearItem.byType.set(typeKey, {
          type: typeKey,
          totalFiles: 0,
          totalSizeBytes: 0,
          byCategory: new Map()
        });
      }
      const yearTypeItem = yearItem.byType.get(typeKey)!;
      yearTypeItem.totalFiles += 1;
      yearTypeItem.totalSizeBytes += asset.pesoBytes;

      if (!yearTypeItem.byCategory.has(categoryKey)) {
        yearTypeItem.byCategory.set(categoryKey, {
          categoria: categoryKey,
          totalFiles: 0,
          totalSizeBytes: 0
        });
      }
      const yearTypeCategoryItem = yearTypeItem.byCategory.get(categoryKey)!;
      yearTypeCategoryItem.totalFiles += 1;
      yearTypeCategoryItem.totalSizeBytes += asset.pesoBytes;
    }

    const byCategory = Array.from(categoryAccumulator.values()).sort((a, b) => b.totalFiles - a.totalFiles);
    const byType = Array.from(typeAccumulator.values()).sort((a, b) => b.totalFiles - a.totalFiles);

    const byYear = Array.from(yearAccumulator.values())
      .sort((a, b) => {
        if (a.year === null && b.year === null) {
          return 0;
        }
        if (a.year === null) {
          return 1;
        }
        if (b.year === null) {
          return -1;
        }
        return a.year - b.year;
      })
      .map((yearItem) => ({
        year: yearItem.year,
        label: yearItem.label,
        totalFiles: yearItem.totalFiles,
        totalSizeBytes: yearItem.totalSizeBytes,
        byType: Array.from(yearItem.byType.values())
          .sort((a, b) => b.totalFiles - a.totalFiles)
          .map((typeItem) => ({
            type: typeItem.type,
            totalFiles: typeItem.totalFiles,
            totalSizeBytes: typeItem.totalSizeBytes,
            byCategory: Array.from(typeItem.byCategory.values()).sort((a, b) => b.totalFiles - a.totalFiles)
          }))
      }));

    const samples = normalizedAssets.slice(0, 20).map((asset) => ({
      id: asset.id,
      year: asset.detectedYear,
      type: asset.detectedType,
      categoria: asset.categoria,
      area: asset.area,
      nombreOriginal: asset.nombreOriginal,
      tipoPrueba: asset.tipoPrueba,
      pesoBytes: asset.pesoBytes,
      createdAt: asset.createdAt
    }));

    return {
      filters: {
        from: typedQuery.from,
        to: typedQuery.to,
        yearFrom: typedQuery.yearFrom,
        yearTo: typedQuery.yearTo,
        categoria: typedQuery.categoria,
        area: typedQuery.area,
        tipoPrueba: typedQuery.tipoPrueba,
        activo: typedQuery.activo,
        includeDeleted: typedQuery.includeDeleted ?? false,
        onlySaber11: typedQuery.onlySaber11 ?? true,
        q: typedQuery.q
      },
      totals,
      byYear,
      byType,
      byCategory,
      samples
    };
  }

  static async filesCoverageExportCsv(query: Record<string, unknown>) {
    const typedQuery = query as FilesCoverageQuery;
    const normalizedAssets = await listCoverageAssets(typedQuery);

    const header = [
      "id",
      "detected_year",
      "detected_type",
      "categoria",
      "area",
      "tipo_prueba",
      "nombre_original",
      "nombre_archivo",
      "descripcion",
      "ruta_logica",
      "peso_bytes",
      "activo",
      "deleted_at",
      "created_at",
      "updated_at"
    ];

    const rows = normalizedAssets
      .slice()
      .sort((a, b) => {
        const yearA = a.detectedYear ?? 9999;
        const yearB = b.detectedYear ?? 9999;
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        if (a.detectedType !== b.detectedType) {
          return a.detectedType.localeCompare(b.detectedType);
        }
        return a.nombreOriginal.localeCompare(b.nombreOriginal);
      })
      .map((asset) => [
        asset.id,
        asset.detectedYear,
        asset.detectedType,
        asset.categoria,
        asset.area,
        asset.tipoPrueba,
        asset.nombreOriginal,
        asset.nombreArchivo,
        asset.descripcion,
        asset.rutaLogica,
        asset.pesoBytes,
        asset.activo,
        asset.deletedAt ? asset.deletedAt.toISOString() : null,
        asset.createdAt.toISOString(),
        asset.updatedAt.toISOString()
      ]);

    const lines = [header, ...rows].map((row) => row.map((value) => csvEscape(value)).join(","));
    const csv = `${lines.join("\n")}\n`;

    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}_${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;

    return {
      fileName: `files_coverage_${stamp}.csv`,
      csv,
      rowsCount: rows.length
    };
  }
}
