import fs from "fs";
import path from "path";
import { FileCategory, Prisma } from "@prisma/client";
import prisma from "../../common/prisma";
import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { getPagination } from "../../common/utils/pagination";
import { FilesRepository } from "./files.repository";
import {
  DuplicateFileInput,
  FileCreateData,
  FileDownloadQuery,
  FileListFilters,
  FileSearchFilters,
  FileUpdateInput,
  FileUploadInput,
  NewVersionInput
} from "./files.types";
import {
  buildFolderPath,
  ensureDirectory,
  ensureFileExists,
  generateInternalFileName,
  removeFileIfExists,
  resolveVersionRootId,
  toAbsoluteStoragePath,
  toRelativeStoragePath
} from "./files.utils";

const toFileCreateData = (payload: {
  file: Express.Multer.File;
  storedAbsolutePath?: string;
  categoria: FileCategory;
  descripcion?: string;
  gradoObjetivo?: string;
  area?: FileUploadInput["area"];
  tipoPrueba?: string;
  version?: number;
  parentFileId?: string;
  sourceFileId?: string;
  uploadedByUserId?: string;
  isCurrent?: boolean;
}): FileCreateData => {
  const extension = path.extname(payload.file.originalname).toLowerCase() || path.extname(payload.file.filename).toLowerCase();
  const relativePath = toRelativeStoragePath(payload.storedAbsolutePath ?? payload.file.path);

  return {
    nombreOriginal: payload.file.originalname,
    nombreArchivo: payload.file.filename,
    categoria: payload.categoria,
    tipoMime: payload.file.mimetype,
    extension,
    pesoBytes: payload.file.size,
    ruta: relativePath,
    rutaLogica: relativePath,
    descripcion: payload.descripcion,
    gradoObjetivo: payload.gradoObjetivo,
    area: payload.area,
    tipoPrueba: payload.tipoPrueba,
    version: payload.version ?? 1,
    parentFileId: payload.parentFileId,
    sourceFileId: payload.sourceFileId,
    uploadedByUserId: payload.uploadedByUserId,
    isCurrent: payload.isCurrent ?? true
  };
};

const moveFileToFinalCategoryDirectory = (payload: {
  file: Express.Multer.File;
  categoria: FileCategory;
  gradoObjetivo?: string;
  area?: FileUploadInput["area"];
  tipoPrueba?: string;
}) => {
  const destinationFolder = buildFolderPath({
    categoria: payload.categoria,
    gradoObjetivo: payload.gradoObjetivo,
    area: payload.area,
    tipoPrueba: payload.tipoPrueba
  });

  ensureDirectory(destinationFolder);

  const destinationAbsolutePath = path.join(destinationFolder, payload.file.filename);
  const sourceAbsolutePath = payload.file.path;

  try {
    fs.renameSync(sourceAbsolutePath, destinationAbsolutePath);
  } catch {
    fs.copyFileSync(sourceAbsolutePath, destinationAbsolutePath);
    removeFileIfExists(sourceAbsolutePath);
  }

  return destinationAbsolutePath;
};

const buildFileFilters = (filters: Omit<FileListFilters, "page" | "limit">): Prisma.FileAssetWhereInput => {
  const where: Prisma.FileAssetWhereInput = {
    categoria: filters.categoria,
    gradoObjetivo: filters.gradoObjetivo,
    area: filters.area,
    tipoPrueba: filters.tipoPrueba,
    version: filters.version,
    parentFileId: filters.parentFileId,
    activo: filters.activo,
    deletedAt: filters.includeDeleted ? undefined : null
  };

  if (filters.nombre) {
    const andFilters = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [
      ...andFilters,
      {
        OR: [
          { nombreOriginal: { contains: filters.nombre, mode: "insensitive" } },
          { nombreArchivo: { contains: filters.nombre, mode: "insensitive" } }
        ]
      }
    ];
  }

  if (filters.activo === undefined && !filters.includeDeleted) {
    where.activo = true;
  }

  return where;
};

const buildOrderBy = (
  filters: Pick<FileListFilters, "sortBy" | "sortOrder">
): Prisma.FileAssetOrderByWithRelationInput[] => {
  const direction = filters.sortOrder ?? "desc";

  if (filters.sortBy === "nombre_original") {
    return [{ nombreOriginal: direction }, { createdAt: "desc" }];
  }

  if (filters.sortBy === "updated_at") {
    return [{ updatedAt: direction }, { createdAt: "desc" }];
  }

  return [{ createdAt: direction }];
};

export class FilesService {
  static async upload(file: Express.Multer.File, payload: FileUploadInput, userId?: string) {
    let storedAbsolutePath = file.path;

    try {
      storedAbsolutePath = moveFileToFinalCategoryDirectory({
        file,
        categoria: payload.categoria,
        gradoObjetivo: payload.gradoObjetivo,
        area: payload.area,
        tipoPrueba: payload.tipoPrueba
      });

      const data = toFileCreateData({
        file,
        storedAbsolutePath,
        categoria: payload.categoria,
        descripcion: payload.descripcion,
        gradoObjetivo: payload.gradoObjetivo,
        area: payload.area,
        tipoPrueba: payload.tipoPrueba,
        uploadedByUserId: userId
      });

      const asset = await FilesRepository.create(data);

      await createAuditLog({
        entidad: "file_assets",
        entidadId: asset.id,
        accion: "UPLOAD",
        userId,
        datos: {
          categoria: asset.categoria,
          nombreOriginal: asset.nombreOriginal,
          ruta: asset.ruta
        }
      });

      return asset;
    } catch (error) {
      removeFileIfExists(storedAbsolutePath);
      if (storedAbsolutePath !== file.path) {
        removeFileIfExists(file.path);
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(
          "Conflicto al crear la nueva version. Intente nuevamente.",
          409,
          "FILE_VERSION_CONFLICT"
        );
      }

      throw error;
    }
  }

  static async list(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typed = query as Omit<FileListFilters, "page" | "limit">;

    const where = buildFileFilters(typed);
    const orderBy = buildOrderBy(typed);
    const [total, items] = await FilesRepository.list(where, pagination.skip, pagination.limit, orderBy);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items
    };
  }

  static async search(query: Record<string, unknown>) {
    const pagination = getPagination(query);
    const typed = query as Omit<FileSearchFilters, "page" | "limit">;

    const where = buildFileFilters(typed);
    const andFilters = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [
      ...andFilters,
      {
        OR: [
          { nombreOriginal: { contains: typed.q, mode: "insensitive" } },
          { nombreArchivo: { contains: typed.q, mode: "insensitive" } },
          { descripcion: { contains: typed.q, mode: "insensitive" } },
          { rutaLogica: { contains: typed.q, mode: "insensitive" } }
        ]
      }
    ];

    const orderBy = buildOrderBy(typed);
    const [total, items] = await FilesRepository.list(where, pagination.skip, pagination.limit, orderBy);

    return {
      page: pagination.page,
      limit: pagination.limit,
      total,
      items
    };
  }

  static async getById(id: string) {
    const asset = await FilesRepository.findByIdStrict(id);

    if (!asset) {
      throw new AppError("Archivo no encontrado", 404, "NOT_FOUND");
    }

    const rootId = resolveVersionRootId(asset);
    const versions = await FilesRepository.findVersionFamily(rootId, true);

    return {
      asset,
      versionRootId: rootId,
      versions
    };
  }

  static async resolveDownloadById(id: string) {
    const asset = await FilesRepository.findById(id, false);

    if (!asset) {
      throw new AppError("Archivo no encontrado o inactivo", 404, "NOT_FOUND");
    }

    const absolutePath = toAbsoluteStoragePath(asset.ruta);
    ensureFileExists(absolutePath);

    return {
      asset,
      absolutePath
    };
  }

  static async resolveDownloadByQuery(query: FileDownloadQuery) {
    const where: Prisma.FileAssetWhereInput = {
      activo: true,
      deletedAt: null,
      categoria: query.categoria,
      rutaLogica: query.rutaLogica,
      ...(query.nombre
        ? {
            OR: [
              { nombreOriginal: { contains: query.nombre, mode: "insensitive" } },
              { nombreArchivo: { contains: query.nombre, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const asset = await FilesRepository.findDownloadCandidate(where);

    if (!asset) {
      throw new AppError("No se encontro archivo para descarga", 404, "NOT_FOUND");
    }

    const absolutePath = toAbsoluteStoragePath(asset.ruta);
    ensureFileExists(absolutePath);

    return {
      asset,
      absolutePath
    };
  }

  static async update(id: string, payload: FileUpdateInput, userId?: string) {
    const existing = await FilesRepository.findByIdStrict(id);

    if (!existing) {
      throw new AppError("Archivo no encontrado", 404, "NOT_FOUND");
    }

    if (payload.isCurrent) {
      const rootId = resolveVersionRootId(existing);
      await FilesRepository.markVersionFamilyNotCurrent(rootId);
    }

    const shouldSoftDelete = payload.activo === false;
    const updated = await FilesRepository.update(id, {
      categoria: payload.categoria,
      descripcion: payload.descripcion,
      gradoObjetivo: payload.gradoObjetivo,
      area: payload.area,
      tipoPrueba: payload.tipoPrueba,
      activo: payload.activo,
      isCurrent: payload.isCurrent,
      deletedAt: shouldSoftDelete ? new Date() : payload.activo === true ? null : undefined
    });

    await createAuditLog({
      entidad: "file_assets",
      entidadId: id,
      accion: "UPDATE",
      userId,
      datos: {
        before: {
          categoria: existing.categoria,
          descripcion: existing.descripcion,
          activo: existing.activo,
          isCurrent: existing.isCurrent
        },
        after: {
          categoria: updated.categoria,
          descripcion: updated.descripcion,
          activo: updated.activo,
          isCurrent: updated.isCurrent
        }
      }
    });

    return updated;
  }

  static async softDelete(id: string, userId?: string) {
    const existing = await FilesRepository.findByIdStrict(id);

    if (!existing) {
      throw new AppError("Archivo no encontrado", 404, "NOT_FOUND");
    }

    const updated = await FilesRepository.update(id, {
      activo: false,
      isCurrent: false,
      deletedAt: new Date()
    });

    await createAuditLog({
      entidad: "file_assets",
      entidadId: id,
      accion: "SOFT_DELETE",
      userId,
      datos: {
        ruta: existing.ruta,
        categoria: existing.categoria
      }
    });

    return updated;
  }

  static async newVersion(id: string, file: Express.Multer.File, payload: NewVersionInput, userId?: string) {
    let storedAbsolutePath = file.path;
    const baseAsset = await FilesRepository.findById(id, false);

    if (!baseAsset) {
      removeFileIfExists(file.path);
      throw new AppError("Archivo base no encontrado", 404, "NOT_FOUND");
    }

    const rootId = resolveVersionRootId(baseAsset);
    const family = await FilesRepository.findVersionFamily(rootId, true);
    const maxVersion = Math.max(...family.map((item) => item.version), baseAsset.version);

    const nextCategoria = payload.categoria ?? baseAsset.categoria;
    const nextGradoObjetivo = payload.gradoObjetivo ?? baseAsset.gradoObjetivo ?? undefined;
    const nextArea = payload.area ?? baseAsset.area ?? undefined;
    const nextTipoPrueba = payload.tipoPrueba ?? baseAsset.tipoPrueba ?? undefined;

    storedAbsolutePath = moveFileToFinalCategoryDirectory({
      file,
      categoria: nextCategoria,
      gradoObjetivo: nextGradoObjetivo,
      area: nextArea,
      tipoPrueba: nextTipoPrueba
    });

    const data = toFileCreateData({
      file,
      storedAbsolutePath,
      categoria: nextCategoria,
      descripcion: payload.descripcion ?? baseAsset.descripcion ?? undefined,
      gradoObjetivo: nextGradoObjetivo,
      area: nextArea,
      tipoPrueba: nextTipoPrueba,
      version: maxVersion + 1,
      parentFileId: rootId,
      sourceFileId: baseAsset.sourceFileId ?? undefined,
      uploadedByUserId: userId,
      isCurrent: true
    });

    try {
      const asset = await prisma.$transaction(async (tx) => {
        await tx.fileAsset.updateMany({
          where: {
            OR: [{ id: rootId }, { parentFileId: rootId }]
          },
          data: {
            isCurrent: false
          }
        });

        return tx.fileAsset.create({
          data,
          include: {
            parentFile: true,
            uploadedByUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });
      });

      await createAuditLog({
        entidad: "file_assets",
        entidadId: asset.id,
        accion: "NEW_VERSION",
        userId,
        datos: {
          rootId,
          previousId: baseAsset.id,
          version: asset.version
        }
      });

      return asset;
    } catch (error) {
      removeFileIfExists(storedAbsolutePath);
      if (storedAbsolutePath !== file.path) {
        removeFileIfExists(file.path);
      }
      throw error;
    }
  }

  static async duplicate(id: string, payload: DuplicateFileInput, userId?: string) {
    const sourceAsset = await FilesRepository.findById(id, false);

    if (!sourceAsset) {
      throw new AppError("Archivo origen no encontrado", 404, "NOT_FOUND");
    }

    const sourceAbsolutePath = toAbsoluteStoragePath(sourceAsset.ruta);
    ensureFileExists(sourceAbsolutePath);

    const destinationFolder = buildFolderPath({
      categoria: payload.categoria ?? sourceAsset.categoria,
      gradoObjetivo: payload.gradoObjetivo ?? sourceAsset.gradoObjetivo ?? undefined,
      area: payload.area ?? sourceAsset.area ?? undefined,
      tipoPrueba: payload.tipoPrueba ?? sourceAsset.tipoPrueba ?? undefined
    });

    ensureDirectory(destinationFolder);

    const generated = generateInternalFileName(payload.nombreOriginal ?? sourceAsset.nombreOriginal);
    const destinationAbsolutePath = path.join(destinationFolder, generated.name);

    fs.copyFileSync(sourceAbsolutePath, destinationAbsolutePath);

    try {
      const stats = fs.statSync(destinationAbsolutePath);
      const relativePath = toRelativeStoragePath(destinationAbsolutePath);

      const asset = await FilesRepository.create({
        nombreOriginal: payload.nombreOriginal ?? sourceAsset.nombreOriginal,
        nombreArchivo: generated.name,
        categoria: payload.categoria ?? sourceAsset.categoria,
        tipoMime: sourceAsset.tipoMime,
        extension: generated.extension || sourceAsset.extension,
        pesoBytes: Number(stats.size),
        ruta: relativePath,
        rutaLogica: relativePath,
        descripcion: payload.descripcion ?? sourceAsset.descripcion ?? undefined,
        gradoObjetivo: payload.gradoObjetivo ?? sourceAsset.gradoObjetivo ?? undefined,
        area: payload.area ?? sourceAsset.area ?? undefined,
        tipoPrueba: payload.tipoPrueba ?? sourceAsset.tipoPrueba ?? undefined,
        version: 1,
        sourceFileId: sourceAsset.id,
        uploadedByUserId: userId,
        isCurrent: true
      });

      await createAuditLog({
        entidad: "file_assets",
        entidadId: asset.id,
        accion: "DUPLICATE",
        userId,
        datos: {
          sourceId: sourceAsset.id,
          category: asset.categoria,
          route: asset.ruta
        }
      });

      return asset;
    } catch (error) {
      removeFileIfExists(destinationAbsolutePath);
      throw error;
    }
  }
}
