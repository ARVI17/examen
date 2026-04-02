import prisma from "../../common/prisma";

export class PerformanceLevelRepository {
  static create(data: {
    nombre: string;
    minimo: number;
    maximo: number;
    scope: string;
    isActive: boolean;
  }) {
    return prisma.performanceLevel.create({ data });
  }

  static findById(id: string) {
    return prisma.performanceLevel.findUnique({ where: { id } });
  }

  static findByName(nombre: string) {
    return prisma.performanceLevel.findUnique({ where: { nombre } });
  }

  static list() {
    return prisma.performanceLevel.findMany({
      orderBy: [{ scope: "asc" }, { minimo: "asc" }]
    });
  }

  static update(id: string, data: {
    nombre?: string;
    minimo?: number;
    maximo?: number;
    scope?: string;
    isActive?: boolean;
  }) {
    return prisma.performanceLevel.update({ where: { id }, data });
  }
}
