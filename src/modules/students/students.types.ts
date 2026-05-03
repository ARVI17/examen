import { DocumentTypeCode } from "@prisma/client";

export type StudentCreateInput = {
  nombres: string;
  apellidos: string;
  tipoIdentificacion: DocumentTypeCode;
  numeroIdentificacion: string;
  grado: string;
  schoolId?: string;
  groupId?: string;
  fechaNacimiento?: Date;
  genero?: string;
  institucion?: string;
  jornada?: string;
  grupo?: string;
  departamento?: string;
  municipio?: string;
  email?: string;
  telefono?: string;
  acudienteNombre?: string;
  acudienteEmail?: string;
  acudienteTelefono?: string;
};

export type StudentUpdateInput = {
  nombres?: string;
  apellidos?: string;
  tipoIdentificacion?: DocumentTypeCode;
  grado?: string;
  schoolId?: string;
  groupId?: string;
  fechaNacimiento?: Date | null;
  genero?: string | null;
  institucion?: string | null;
  jornada?: string | null;
  grupo?: string | null;
  departamento?: string | null;
  municipio?: string | null;
  email?: string | null;
  telefono?: string | null;
  acudienteNombre?: string | null;
  acudienteEmail?: string | null;
  acudienteTelefono?: string | null;
};
