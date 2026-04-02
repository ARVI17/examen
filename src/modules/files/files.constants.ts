import { FileCategory } from "@prisma/client";

export const FILE_CATEGORY_DIRECTORY: Record<FileCategory, string> = {
  [FileCategory.EXAMENES]: "examenes",
  [FileCategory.SIMULACROS]: "simulacros",
  [FileCategory.BANCOS_PREGUNTAS]: "bancos_preguntas",
  [FileCategory.HOJAS_RESPUESTA]: "hojas_respuesta",
  [FileCategory.CLAVES]: "claves",
  [FileCategory.REPORTES]: "reportes",
  [FileCategory.MATERIALES_APOYO]: "materiales_apoyo"
};

export const FILE_UPLOAD_FIELD_NAME = "file";

export const ALLOWED_FILE_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".json",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg"
] as const;

export const EXTENSION_TO_MIME_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".json": ["application/json", "text/json", "text/plain"],
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"]
};

export const ZIP_BASED_EXTENSIONS = new Set([".docx", ".xlsx"]);
