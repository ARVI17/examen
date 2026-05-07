import { DocumentTypeCode, RoleCode } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        role: RoleCode;
        scope: {
          schoolIds: string[];
          groupIds: string[];
        };
      };
        studentSession?: {
          studentId: string;
          tipoIdentificacion: DocumentTypeCode;
          numeroIdentificacion: string;
        nombres: string;
        apellidos: string;
        grado: string;
        schoolId: string | null;
        groupId: string | null;
      };
    }
  }
}

export {};
