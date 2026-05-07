import { DocumentTypeCode } from "@prisma/client";

export type StudentLoginInput = {
  tipoIdentificacion: DocumentTypeCode;
  numeroIdentificacion: string;
};
