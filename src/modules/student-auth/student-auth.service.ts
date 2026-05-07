import jwt, { SignOptions } from "jsonwebtoken";
import { AppError } from "../../common/errors/AppError";
import { config } from "../../config";
import { StudentAuthRepository } from "./student-auth.repository";
import { StudentLoginInput } from "./student-auth.types";

type StudentRecord = NonNullable<Awaited<ReturnType<typeof StudentAuthRepository.findById>>>;

const toProfile = (student: StudentRecord) => ({
  id: student.id,
  nombres: student.nombres,
  apellidos: student.apellidos,
  tipoIdentificacion: student.tipoIdentificacion,
  numeroIdentificacion: student.numeroIdentificacion,
  grado: student.grado,
  grupo: student.grupo,
  institucion: student.institucion,
  schoolId: student.schoolId,
  groupId: student.groupId,
  school: student.school,
  group: student.group
});

export class StudentAuthService {
  static async login(payload: StudentLoginInput) {
    const numeroIdentificacion = payload.numeroIdentificacion.trim();
    const student = await StudentAuthRepository.findByDocumentAndType(payload.tipoIdentificacion, numeroIdentificacion);

    if (!student || student.isDeleted) {
      throw new AppError(
        "No encontramos tu registro. Verifica tus datos o comunicate con el administrador de tu colegio.",
        401,
        "STUDENT_NOT_FOUND"
      );
    }

    const signOptions: SignOptions = {
      expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"]
    };

    const token = jwt.sign(
      {
        kind: "student",
        studentId: student.id,
        tipoIdentificacion: student.tipoIdentificacion,
        numeroIdentificacion: student.numeroIdentificacion
      },
      config.jwtSigningSecret,
      signOptions
    );

    return {
      token,
      student: toProfile(student)
    };
  }

  static async me(studentId: string) {
    const student = await StudentAuthRepository.findById(studentId);
    if (!student || student.isDeleted) {
      throw new AppError("Sesion de estudiante invalida", 401, "INVALID_STUDENT_SESSION");
    }
    return toProfile(student);
  }
}
