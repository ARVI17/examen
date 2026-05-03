import { Prisma } from "@prisma/client";
import prisma from "../../common/prisma";
import { StudentCreateInput, StudentUpdateInput } from "./students.types";

export class StudentsRepository {
  static findById(id: string) {
    return prisma.student.findUnique({
      where: { id },
      include: {
        school: true,
        group: true
      }
    });
  }

  static findByDocument(numeroIdentificacion: string) {
    return prisma.student.findUnique({
      where: { numeroIdentificacion },
      include: {
        school: true,
        group: true
      }
    });
  }

  static create(data: StudentCreateInput) {
    return prisma.student.create({
      data,
      include: {
        school: true,
        group: true
      }
    });
  }

  static update(id: string, data: StudentUpdateInput & { isDeleted?: boolean }) {
    return prisma.student.update({
      where: { id },
      data,
      include: {
        school: true,
        group: true
      }
    });
  }

  static list(where: Prisma.StudentWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          school: true,
          group: true
        }
      })
    ]);
  }

  static createMany(data: StudentCreateInput[]) {
    return prisma.$transaction(
      data.map((item) =>
        prisma.student.create({
          data: item,
          include: {
            school: true,
            group: true
          }
        })
      )
    );
  }

  static findSchoolById(id: string) {
    return prisma.school.findUnique({
      where: { id }
    });
  }

  static findGroupById(id: string) {
    return prisma.schoolGroup.findUnique({
      where: { id }
    });
  }

  static historyByStudentId(studentId: string) {
    return prisma.examAttempt.findMany({
      where: { estudianteId: studentId },
      include: {
        prueba: true,
        assignment: true,
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
