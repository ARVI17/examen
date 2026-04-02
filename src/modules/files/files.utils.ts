import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { FileAsset, FileCategory } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import { config } from "../../config";
import { FILE_CATEGORY_DIRECTORY } from "./files.constants";

const sanitizeSegment = (value: string) => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\-\.]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
};

export const ensureStorageRootExists = () => {
  fs.mkdirSync(config.storageRoot, { recursive: true });
};

export const buildFolderPath = (params: {
  categoria: FileCategory;
  gradoObjetivo?: string;
  area?: string;
  tipoPrueba?: string;
}) => {
  const year = new Date().getFullYear().toString();
  const parts = [config.storageRoot, FILE_CATEGORY_DIRECTORY[params.categoria], year];

  if (params.gradoObjetivo) {
    parts.push(`grado_${sanitizeSegment(params.gradoObjetivo)}`);
  }

  if (params.area) {
    parts.push(`area_${sanitizeSegment(params.area)}`);
  }

  if (params.tipoPrueba) {
    parts.push(`tipo_${sanitizeSegment(params.tipoPrueba)}`);
  }

  return path.resolve(path.join(...parts));
};

export const ensureDirectory = (directoryPath: string) => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

export const sanitizeOriginalFileName = (originalName: string) => {
  const extension = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, extension);
  const safeBase = sanitizeSegment(base) || "archivo";

  return {
    extension,
    baseName: safeBase,
    fileName: `${safeBase}${extension}`
  };
};

export const generateInternalFileName = (originalName: string) => {
  const { extension, baseName } = sanitizeOriginalFileName(originalName);
  const uniqueName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;

  return {
    extension,
    name: uniqueName
  };
};

export const toRelativeStoragePath = (absolutePath: string) => {
  const relativePath = path.relative(config.storageRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new AppError("Ruta de archivo fuera de storage", 400, "INVALID_STORAGE_PATH");
  }

  return relativePath.split(path.sep).join("/");
};

export const toAbsoluteStoragePath = (relativePath: string) => {
  const absolutePath = path.resolve(config.storageRoot, relativePath);
  const normalizedStorageRoot = path.resolve(config.storageRoot);
  const relativeToRoot = path.relative(normalizedStorageRoot, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new AppError("Ruta de archivo invalida", 400, "INVALID_STORAGE_PATH");
  }

  return absolutePath;
};

export const removeFileIfExists = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignorado de forma intencional.
  }
};

export const ensureFileExists = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    throw new AppError("Archivo fisico no encontrado", 404, "FILE_NOT_FOUND");
  }
};

export const resolveVersionRootId = (asset: Pick<FileAsset, "id" | "parentFileId">) => {
  return asset.parentFileId ?? asset.id;
};
