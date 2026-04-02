import { AttemptStatus, Prisma, QuestionArea } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
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
      ReportsRepository.countStudents(grado),
      ReportsRepository.countExams(),
      ReportsRepository.countAttempts({
        fechaInicio: dateRange,
        estudiante: grado ? { grado, isDeleted: false } : undefined
      }),
      ReportsRepository.countAttempts({
        estado: AttemptStatus.CALIFICADA,
        fechaInicio: dateRange,
        estudiante: grado ? { grado, isDeleted: false } : undefined
      }),
      ReportsRepository.listDashboardAttempts({
        grado,
        dateRange,
        limit
      }),
      ReportsRepository.aggregateDashboardGradedAttempts({ grado, dateRange }),
      ReportsRepository.listDashboardAreaResults({ grado, dateRange })
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
