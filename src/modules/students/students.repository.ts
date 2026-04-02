import { Prisma } from "@prisma/client";
import prisma from "../../common/prisma";
import { StudentCreateInput, StudentUpdateInput } from "./students.types";

export class StudentsRepository {
  static findById(id: string) {
    return prisma.student.findUnique({ where: { id } });
  }

  static findByDocument(numeroIdentificacion: string) {
    return prisma.student.findUnique({ where: { numeroIdentificacion } });
  }

  static create(data: StudentCreateInput) {
    return prisma.student.create({ data });
  }

  static update(id: string, data: StudentUpdateInput & { isDeleted?: boolean }) {
    return prisma.student.update({ where: { id }, data });
  }

  static list(where: Prisma.StudentWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
    ]);
  }

  static historyByStudentId(studentId: string) {
    return prisma.examAttempt.findMany({
      where: { estudianteId: studentId },
      include: {
        prueba: true,
        areaResults: true,
        studentAnswers: {
          include: {
            pregunta: true,
            opcionSeleccionada: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }
}
