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

  static listExamAssignments(examId: string) {
    return prisma.examAssignment.findMany({
      where: {
        examId,
        isActive: true
      },
      select: {
        scope: true,
        schoolId: true,
        groupId: true,
        student: {
          select: {
            schoolId: true,
            groupId: true
          }
        }
      }
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
    schoolId?: string;
    groupId?: string;
    dateRange?: { gte?: Date; lte?: Date };
    limit: number;
  }) {
    return prisma.examAttempt.findMany({
      where: {
        fechaInicio: filter.dateRange,
        estudiante: filter.grado
          ? {
              grado: filter.grado,
              schoolId: filter.schoolId,
              groupId: filter.groupId,
              isDeleted: false
            }
          : {
              schoolId: filter.schoolId,
              groupId: filter.groupId,
              isDeleted: false
            }
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
    schoolId?: string;
    groupId?: string;
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
              schoolId: filter.schoolId,
              groupId: filter.groupId,
              isDeleted: false
            }
          : {
              schoolId: filter.schoolId,
              groupId: filter.groupId,
              isDeleted: false
            }
      }
    });
  }

  static listDashboardAreaResults(filter: {
    grado?: string;
    schoolId?: string;
    groupId?: string;
    dateRange?: { gte?: Date; lte?: Date };
  }) {
    return prisma.areaResult.findMany({
      where: {
        intento: {
          fechaInicio: filter.dateRange,
          estudiante: filter.grado
            ? {
                grado: filter.grado,
                schoolId: filter.schoolId,
                groupId: filter.groupId,
                isDeleted: false
              }
            : {
                schoolId: filter.schoolId,
                groupId: filter.groupId,
                isDeleted: false
              }
        }
      }
    });
  }

  static countStudents(payload?: { grado?: string; schoolId?: string; groupId?: string }) {
    return prisma.student.count({
      where: {
        isDeleted: false,
        grado: payload?.grado,
        schoolId: payload?.schoolId,
        groupId: payload?.groupId
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

  static async countDistinctExamsByScope(filter: {
    grado?: string;
    schoolId?: string;
    groupId?: string;
    dateRange?: { gte?: Date; lte?: Date };
  }) {
    const rows = await prisma.examAttempt.findMany({
      where: {
        fechaInicio: filter.dateRange,
        estudiante: filter.grado
          ? {
              grado: filter.grado,
              schoolId: filter.schoolId,
              groupId: filter.groupId,
              isDeleted: false
            }
          : {
              schoolId: filter.schoolId,
              groupId: filter.groupId,
              isDeleted: false
            }
      },
      select: {
        pruebaId: true
      },
      distinct: ["pruebaId"]
    });

    return rows.length;
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

  static findSchoolById(id: string) {
    return prisma.school.findUnique({ where: { id } });
  }

  static findGroupById(id: string) {
    return prisma.schoolGroup.findUnique({ where: { id } });
  }

  static countStudentsByScope(payload: { schoolId?: string; groupId?: string; grado?: string }) {
    return prisma.student.count({
      where: {
        isDeleted: false,
        schoolId: payload.schoolId,
        groupId: payload.groupId,
        grado: payload.grado
      }
    });
  }

  static listAttemptsForScope(payload: {
    schoolId?: string;
    groupId?: string;
    grado?: string;
    dateRange?: { gte?: Date; lte?: Date };
  }) {
    return prisma.examAttempt.findMany({
      where: {
        fechaInicio: payload.dateRange,
        estudiante: {
          isDeleted: false,
          schoolId: payload.schoolId,
          groupId: payload.groupId,
          grado: payload.grado
        }
      },
      include: {
        estudiante: true,
        prueba: true,
        areaResults: true,
        studentAnswers: {
          include: {
            pregunta: {
              include: {
                subject: true,
                topicLinks: {
                  include: {
                    topic: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  static listQuestionAccuracy(payload: {
    schoolId?: string;
    groupId?: string;
    examId?: string;
    dateRange?: { gte?: Date; lte?: Date };
  }) {
    return prisma.studentAnswer.findMany({
      where: {
        intento: {
          pruebaId: payload.examId,
          fechaInicio: payload.dateRange,
          estudiante: {
            isDeleted: false,
            schoolId: payload.schoolId,
            groupId: payload.groupId
          }
        }
      },
      include: {
        pregunta: true
      }
    });
  }

  static listQuestionsReadiness(payload: { gradoObjetivo?: string }) {
    return prisma.question.groupBy({
      by: ["area"],
      _count: {
        _all: true
      },
      where: {
        estado: true,
        gradoObjetivo: payload.gradoObjetivo
      }
    });
  }

  static listMaterialCoverage() {
    return prisma.fileAsset.findMany({
      where: {
        rutaLogica: {
          startsWith: "material/"
        },
        deletedAt: null
      },
      select: {
        id: true,
        categoria: true,
        area: true,
        nombreOriginal: true,
        tipoPrueba: true,
        descripcion: true,
        rutaLogica: true,
        pesoBytes: true,
        activo: true
      },
      orderBy: { createdAt: "desc" }
    });
  }
}

