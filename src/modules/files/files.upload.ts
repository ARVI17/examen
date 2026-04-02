import fs from "fs";
import path from "path";
import multer from "multer";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { config } from "../../config";
import {
  EXTENSION_TO_MIME_TYPES,
  FILE_UPLOAD_FIELD_NAME,
  ZIP_BASED_EXTENSIONS
} from "./files.constants";
import { ensureDirectory, ensureStorageRootExists, generateInternalFileName } from "./files.utils";

ensureStorageRootExists();

const temporaryUploadDirectory = path.resolve(config.storageRoot, "tmp");
ensureDirectory(temporaryUploadDirectory);

const readFilePrefix = (filePath: string, bytes = 8192) => {
  const fileDescriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(bytes);

  try {
    const readBytes = fs.readSync(fileDescriptor, buffer, 0, bytes, 0);
    return buffer.subarray(0, readBytes);
  } finally {
    fs.closeSync(fileDescriptor);
  }
};

const startsWithSignature = (buffer: Buffer, signature: number[]) => {
  if (buffer.length < signature.length) {
    return false;
  }

  return signature.every((value, index) => buffer[index] === value);
};

const isLikelyTextFile = (buffer: Buffer) => {
  if (!buffer.length) {
    return true;
  }

  let controlCount = 0;

  for (const value of buffer) {
    if (value === 0) {
      return false;
    }

    const isWhitespace = value === 9 || value === 10 || value === 13;
    const isControl = value < 32;
    if (isControl && !isWhitespace) {
      controlCount += 1;
    }
  }

  const ratio = controlCount / buffer.length;
  return ratio < 0.05;
};

const validateMagicSignature = (extension: string, filePath: string) => {
  const prefix = readFilePrefix(filePath);

  if (extension === ".pdf" && !startsWithSignature(prefix, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new AppError("Firma del archivo PDF invalida", 400, "INVALID_FILE_SIGNATURE");
  }

  if (
    extension === ".png" &&
    !startsWithSignature(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    throw new AppError("Firma del archivo PNG invalida", 400, "INVALID_FILE_SIGNATURE");
  }

  if ((extension === ".jpg" || extension === ".jpeg") && !startsWithSignature(prefix, [0xff, 0xd8, 0xff])) {
    throw new AppError("Firma del archivo JPEG invalida", 400, "INVALID_FILE_SIGNATURE");
  }

  if (extension === ".doc" || extension === ".xls") {
    const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (!startsWithSignature(prefix, oleSignature)) {
      throw new AppError("Firma del archivo Office legacy invalida", 400, "INVALID_FILE_SIGNATURE");
    }
  }

  if (ZIP_BASED_EXTENSIONS.has(extension)) {
    const zipSignatures = [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08]
    ];

    const isZip = zipSignatures.some((signature) => startsWithSignature(prefix, signature));
    if (!isZip) {
      throw new AppError("Firma de archivo Office Open XML invalida", 400, "INVALID_FILE_SIGNATURE");
    }
  }

  if (extension === ".json") {
    if (!isLikelyTextFile(prefix)) {
      throw new AppError("Contenido JSON invalido o binario", 400, "INVALID_FILE_SIGNATURE");
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const normalized = raw.replace(/^\uFEFF/, "").trim();

    if (!normalized) {
      throw new AppError("Archivo JSON vacio", 400, "INVALID_FILE_SIGNATURE");
    }

    try {
      JSON.parse(normalized);
    } catch {
      throw new AppError("JSON invalido", 400, "INVALID_JSON_FILE");
    }
  }

  if (extension === ".csv") {
    if (!isLikelyTextFile(prefix)) {
      throw new AppError("Contenido CSV invalido o binario", 400, "INVALID_FILE_SIGNATURE");
    }

    const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
    const hasDelimiter = /[,;\t]/.test(raw);
    const hasLineBreak = /\r?\n/.test(raw);

    if (!hasDelimiter || !hasLineBreak) {
      throw new AppError("CSV invalido: no se detecta estructura tabular", 400, "INVALID_CSV_FILE");
    }
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    return callback(null, temporaryUploadDirectory);
  },
  filename: (_req, file, callback) => {
    const generated = generateInternalFileName(file.originalname);
    callback(null, generated.name);
  }
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (!config.fileAllowedExtensions.includes(extension)) {
    return callback(new AppError("Extension de archivo no permitida", 400, "INVALID_FILE_EXTENSION"));
  }

  if (!config.fileAllowedMimeTypes.includes(mimeType)) {
    return callback(new AppError("Tipo de archivo no permitido", 400, "INVALID_FILE_TYPE"));
  }

  const allowedMimesForExtension = EXTENSION_TO_MIME_TYPES[extension] ?? [];
  if (allowedMimesForExtension.length && !allowedMimesForExtension.includes(mimeType)) {
    return callback(new AppError("El MIME no coincide con la extension del archivo", 400, "MIME_EXTENSION_MISMATCH"));
  }

  callback(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.fileMaxSizeBytes
  }
});

export const uploadSingleFile = upload.single(FILE_UPLOAD_FIELD_NAME);

export const validateUploadedFileIntegrity = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.file) {
    throw new AppError("Debe enviar un archivo en el campo 'file'", 400, "FILE_REQUIRED");
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  validateMagicSignature(extension, req.file.path);
  next();
};

export const requireUploadedFile = (req: Request) => {
  if (!req.file) {
    throw new AppError("Debe enviar un archivo en el campo 'file'", 400, "FILE_REQUIRED");
  }
};
