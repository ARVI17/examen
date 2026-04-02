import { DocumentTypeCode } from "@prisma/client";

export type StudentCreateInput = {
  nombres: string;
  apellidos: string;
  tipoIdentificacion: DocumentTypeCode;
  numeroIdentificacion: string;
  grado: string;
};

export type StudentUpdateInput = {
  nombres?: string;
  apellidos?: string;
  tipoIdentificacion?: DocumentTypeCode;
  grado?: string;
};
