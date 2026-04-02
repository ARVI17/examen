import { RoleCode } from "@prisma/client";
import prisma from "../../common/prisma";

export class AuthRepository {
  static findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });
  }

  static findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });
  }

  static findRoleByCode(code: RoleCode) {
    return prisma.role.findUnique({
      where: { code }
    });
  }

  static createUser(data: { name: string; email: string; passwordHash: string; roleId: string }) {
    return prisma.user.create({
      data,
      include: { role: true }
    });
  }
}

