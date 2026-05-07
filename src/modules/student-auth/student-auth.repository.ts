import { DocumentTypeCode } from "@prisma/client";
import prisma from "../../common/prisma";

export class StudentAuthRepository {
  static findByDocumentAndType(tipoIdentificacion: DocumentTypeCode, numeroIdentificacion: string) {
    return prisma.student.findFirst({
      where: {
        tipoIdentificacion,
        numeroIdentificacion,
        isDeleted: false
      },
      include: {
        school: true,
        group: true
      }
    });
  }

  static findById(studentId: string) {
    return prisma.student.findUnique({
      where: { id: studentId },
      include: {
        school: true,
        group: true
      }
    });
  }
}
