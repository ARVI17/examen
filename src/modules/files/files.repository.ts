import { Prisma } from "@prisma/client";
import prisma from "../../common/prisma";
import { FileCreateData, FileUpdateInput } from "./files.types";

export class FilesRepository {
  static create(data: FileCreateData) {
    return prisma.fileAsset.create({
      data: {
        nombreOriginal: data.nombreOriginal,
        nombreArchivo: data.nombreArchivo,
        categoria: data.categoria,
        tipoMime: data.tipoMime,
        extension: data.extension,
        pesoBytes: data.pesoBytes,
        ruta: data.ruta,
        rutaLogica: data.rutaLogica,
        descripcion: data.descripcion,
        gradoObjetivo: data.gradoObjetivo,
        area: data.area,
        tipoPrueba: data.tipoPrueba,
        version: data.version,
        parentFileId: data.parentFileId,
        sourceFileId: data.sourceFileId,
        uploadedByUserId: data.uploadedByUserId,
        activo: data.activo ?? true,
        isCurrent: data.isCurrent ?? true
      },
      include: {
        parentFile: true,
        sourceFile: true,
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  static findById(id: string, includeInactive = true) {
    return prisma.fileAsset.findFirst({
      where: {
        id,
        ...(includeInactive ? {} : { activo: true, deletedAt: null })
      },
      include: {
        parentFile: true,
        sourceFile: true,
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  static findByIdStrict(id: string) {
    return prisma.fileAsset.findUnique({
      where: { id },
      include: {
        parentFile: true,
        sourceFile: true,
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  static list(
    where: Prisma.FileAssetWhereInput,
    skip: number,
    take: number,
    orderBy: Prisma.FileAssetOrderByWithRelationInput[]
  ) {
    return Promise.all([
      prisma.fileAsset.count({ where }),
      prisma.fileAsset.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          parentFile: true,
          sourceFile: true,
          uploadedByUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      })
    ]);
  }

  static update(id: string, data: FileUpdateInput & { deletedAt?: Date | null }) {
    return prisma.fileAsset.update({
      where: { id },
      data
    });
  }

  static findVersionFamily(rootFileId: string, includeDeleted = true) {
    return prisma.fileAsset.findMany({
      where: {
        OR: [{ id: rootFileId }, { parentFileId: rootFileId }],
        ...(includeDeleted ? {} : { deletedAt: null })
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }]
    });
  }

  static markVersionFamilyNotCurrent(rootFileId: string) {
    return prisma.fileAsset.updateMany({
      where: {
        OR: [{ id: rootFileId }, { parentFileId: rootFileId }]
      },
      data: {
        isCurrent: false
      }
    });
  }

  static findDownloadCandidate(where: Prisma.FileAssetWhereInput) {
    return prisma.fileAsset.findFirst({
      where,
      orderBy: [{ isCurrent: "desc" }, { version: "desc" }, { createdAt: "desc" }]
    });
  }
}
