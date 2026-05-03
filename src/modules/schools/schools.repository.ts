import { Prisma } from "@prisma/client";
import prisma from "../../common/prisma";
import {
  SchoolCreateInput,
  SchoolGroupCreateInput,
  SchoolGroupUpdateInput,
  SchoolUpdateInput
} from "./schools.types";

export class SchoolsRepository {
  static createSchool(data: SchoolCreateInput) {
    return prisma.school.create({ data });
  }

  static findSchoolById(id: string) {
    return prisma.school.findUnique({ where: { id } });
  }

  static findSchoolByCode(code: string) {
    return prisma.school.findUnique({ where: { code } });
  }

  static listSchools(where: Prisma.SchoolWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.school.count({ where }),
      prisma.school.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
    ]);
  }

  static updateSchool(id: string, data: SchoolUpdateInput) {
    return prisma.school.update({ where: { id }, data });
  }

  static createGroup(data: SchoolGroupCreateInput) {
    return prisma.schoolGroup.create({
      data
    });
  }

  static findGroupById(id: string) {
    return prisma.schoolGroup.findUnique({
      where: { id },
      include: {
        school: true
      }
    });
  }

  static findGroupUnique(payload: { schoolId: string; name: string; academicYear?: number }) {
    return prisma.schoolGroup.findFirst({
      where: {
        schoolId: payload.schoolId,
        name: payload.name,
        academicYear: payload.academicYear ?? null
      }
    });
  }

  static listGroupsBySchool(schoolId: string, where: Prisma.SchoolGroupWhereInput, skip: number, take: number) {
    const whereWithSchool: Prisma.SchoolGroupWhereInput = {
      ...where,
      schoolId
    };

    return Promise.all([
      prisma.schoolGroup.count({ where: whereWithSchool }),
      prisma.schoolGroup.findMany({
        where: whereWithSchool,
        skip,
        take,
        include: {
          school: true
        },
        orderBy: [{ academicYear: "desc" }, { name: "asc" }]
      })
    ]);
  }

  static updateGroup(id: string, data: SchoolGroupUpdateInput) {
    return prisma.schoolGroup.update({
      where: { id },
      data,
      include: {
        school: true
      }
    });
  }
}

