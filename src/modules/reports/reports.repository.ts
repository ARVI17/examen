import { AttemptStatus, Prisma } from "@prisma/client";
import prisma from "../../common/prisma";

export class ReportsRepository {
  static findStudentByDocument(numeroIdentificacion: string) {
    return prisma.student.findUnique({
      where: { numeroIdentificacion }
    });
  }

  static findExamById(examId: string) {
    return prisma.exam.findUnique({
      where: { id: examId }
    });
  }

  static listStudentAttempts(studentId: string, dateRange?: { gte?: Date; lte?: Date }) {
    return prisma.examAttempt.findMany({
      where: {
        estudianteId: studentId,
        fechaInicio: dateRange
      },
      include: {
        prueba: true,
        areaResults: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  static listStudentAreaResults(studentId: string, dateRange?: { gte?: Date; lte?: Date }) {
    return prisma.areaResult.findMany({
      where: {
        intento: {
          estudianteId: studentId,
          fechaInicio: dateRange
        }
      },
      include: {
        intento: {
          include: {
            prueba: true
          }
        }
      }
    });
  }

  static listExamAttempts(
    examId: string,
    filter: {
      grado?: string;
      dateRange?: { gte?: Date; lte?: Date };
    }
  ) {
    return prisma.examAttempt.findMany({
      where: {
        pruebaId: examId,
        fechaInicio: filter.dateRange,
        estudiante: filter.grado
          ? {
              grado: filter.grado,
              isDeleted: false
            }
          : undefined
      },
      include: {
        estudiante: true,
        areaResults: true
      },
      orderBy: { puntajeTotalObtenido: "desc" }
    });
  }

  static listDashboardAttempts(filter: {
    grado?: string;
    dateRange?: { gte?: Date; lte?: Date };
    limit: number;
  }) {
    return prisma.examAttempt.findMany({
      where: {
        fechaInicio: filter.dateRange,
        estudiante: filter.grado
          ? {
              grado: filter.grado,
              isDeleted: false
            }
          : undefined
      },
      include: {
        estudiante: true,
        prueba: true,
        areaResults: true
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit
    });
  }

  static aggregateDashboardGradedAttempts(filter: {
    grado?: string;
    dateRange?: { gte?: Date; lte?: Date };
  }) {
    return prisma.examAttempt.aggregate({
      _avg: {
        porcentajeTotal: true,
        puntajeTotalObtenido: true
      },
      where: {
        estado: AttemptStatus.CALIFICADA,
        fechaInicio: filter.dateRange,
        estudiante: filter.grado
          ? {
              grado: filter.grado,
              isDeleted: false
            }
          : undefined
      }
    });
  }

  static listDashboardAreaResults(filter: {
    grado?: string;
    dateRange?: { gte?: Date; lte?: Date };
  }) {
    return prisma.areaResult.findMany({
      where: {
        intento: {
          fechaInicio: filter.dateRange,
          estudiante: filter.grado
            ? {
                grado: filter.grado,
                isDeleted: false
              }
            : undefined
        }
      }
    });
  }

  static countStudents(grado?: string) {
    return prisma.student.count({
      where: {
        isDeleted: false,
        grado: grado ?? undefined
      }
    });
  }

  static countExams() {
    return prisma.exam.count({
      where: {
        isDeleted: false
      }
    });
  }

  static countAttempts(filter: Prisma.ExamAttemptWhereInput) {
    return prisma.examAttempt.count({ where: filter });
  }

  static listFileAssetsForCoverage(where: Prisma.FileAssetWhereInput) {
    return prisma.fileAsset.findMany({
      where,
      select: {
        id: true,
        categoria: true,
        area: true,
        tipoPrueba: true,
        nombreOriginal: true,
        nombreArchivo: true,
        descripcion: true,
        pesoBytes: true,
        activo: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        rutaLogica: true
      },
      orderBy: { createdAt: "desc" }
    });
  }
}

