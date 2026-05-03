import { Prisma, RoleCode } from "@prisma/client";
import prisma from "../../common/prisma";

export class UsersRepository {
  static findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });
  }

  static findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });
  }

  static findRoleByCode(code: RoleCode) {
    return prisma.role.findUnique({ where: { code } });
  }

  static create(data: {
    name: string;
    email: string;
    passwordHash: string;
    roleId: string;
    isActive: boolean;
  }) {
    return prisma.user.create({
      data,
      include: { role: true }
    });
  }

  static update(
    id: string,
    data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      roleId?: string;
      isActive?: boolean;
    }
  ) {
    return prisma.user.update({
      where: { id },
      data,
      include: { role: true }
    });
  }

  static list(where: Prisma.UserWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { role: true },
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
    ]);
  }
}
