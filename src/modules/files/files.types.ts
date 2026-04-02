import { FileCategory, Prisma, QuestionArea } from "@prisma/client";

export type FileSortBy = "created_at" | "updated_at" | "nombre_original";
export type FileSortOrder = "asc" | "desc";

export type FileUploadInput = {
  categoria: FileCategory;
  descripcion?: string;
  gradoObjetivo?: string;
  area?: QuestionArea;
  tipoPrueba?: string;
};

export type FileUpdateInput = {
  descripcion?: string;
  gradoObjetivo?: string;
  area?: QuestionArea;
  tipoPrueba?: string;
  categoria?: FileCategory;
  activo?: boolean;
  isCurrent?: boolean;
};

export type FileListFilters = {
  categoria?: FileCategory;
  gradoObjetivo?: string;
  area?: QuestionArea;
  tipoPrueba?: string;
  nombre?: string;
  version?: number;
  parentFileId?: string;
  activo?: boolean;
  includeDeleted?: boolean;
  sortBy?: FileSortBy;
  sortOrder?: FileSortOrder;
  page: number;
  limit: number;
};

export type FileSearchFilters = FileListFilters & {
  q: string;
};

export type NewVersionInput = {
  descripcion?: string;
  gradoObjetivo?: string;
  area?: QuestionArea;
  tipoPrueba?: string;
  categoria?: FileCategory;
};

export type DuplicateFileInput = {
  nombreOriginal?: string;
  categoria?: FileCategory;
  descripcion?: string;
  gradoObjetivo?: string;
  area?: QuestionArea;
  tipoPrueba?: string;
};

export type FileCreateData = {
  nombreOriginal: string;
  nombreArchivo: string;
  categoria: FileCategory;
  tipoMime: string;
  extension: string;
  pesoBytes: number;
  ruta: string;
  rutaLogica: string;
  descripcion?: string;
  gradoObjetivo?: string;
  area?: QuestionArea;
  tipoPrueba?: string;
  version: number;
  parentFileId?: string;
  sourceFileId?: string;
  uploadedByUserId?: string;
  activo?: boolean;
  isCurrent?: boolean;
};

export type FileDownloadQuery = {
  nombre?: string;
  categoria?: FileCategory;
  rutaLogica?: string;
};

export type PrismaFileWhere = Prisma.FileAssetWhereInput;
