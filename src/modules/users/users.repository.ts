import { Prisma, RoleCode } from "@prisma/client";
import prisma from "../../common/prisma";

export class UsersRepository {
  private static scopeInclude = {
    scopeAssignments: {
      include: {
        group: {
          select: {
            schoolId: true
          }
        }
      }
    }
  } as const;

  static findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true, ...this.scopeInclude }
    });
  }

  static findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true, ...this.scopeInclude }
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
      include: { role: true, ...this.scopeInclude }
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
      include: { role: true, ...this.scopeInclude }
    });
  }

  static list(where: Prisma.UserWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { role: true, ...this.scopeInclude },
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
    ]);
  }

  static findSchoolsByIds(ids: string[]) {
    return prisma.school.findMany({
      where: {
        id: { in: ids },
        isActive: true
      },
      select: { id: true }
    });
  }

  static findGroupsByIds(ids: string[]) {
    return prisma.schoolGroup.findMany({
      where: {
        id: { in: ids },
        isActive: true
      },
      select: {
        id: true,
        schoolId: true
      }
    });
  }

  static async replaceScopeAssignments(payload: { userId: string; schoolIds: string[]; groupIds: string[] }) {
    const schoolIds = Array.from(new Set(payload.schoolIds));
    const groupIds = Array.from(new Set(payload.groupIds));

    return prisma.$transaction(async (tx) => {
      await tx.userScopeAssignment.deleteMany({
        where: { userId: payload.userId }
      });

      if (schoolIds.length > 0) {
        await tx.userScopeAssignment.createMany({
          data: schoolIds.map((schoolId) => ({
            userId: payload.userId,
            schoolId
          }))
        });
      }

      if (groupIds.length > 0) {
        const groups = await tx.schoolGroup.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, schoolId: true }
        });

        if (groups.length > 0) {
          await tx.userScopeAssignment.createMany({
            data: groups.map((group) => ({
              userId: payload.userId,
              schoolId: group.schoolId,
              groupId: group.id
            })),
            skipDuplicates: true
          });
        }
      }

      return tx.user.findUnique({
        where: { id: payload.userId },
        include: { role: true, ...this.scopeInclude }
      });
    });
  }
}
