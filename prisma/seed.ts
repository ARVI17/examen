import { PrismaClient, QuestionArea, RoleCode, DocumentTypeCode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedRoles() {
  const roles = [
    { code: RoleCode.ADMIN, name: "admin", description: "Administrador de la plataforma" },
    { code: RoleCode.DOCENTE, name: "docente", description: "Docente o coordinador academico" }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role
    });
  }
}

async function seedDocumentTypes() {
  const documentTypes = [
    { code: DocumentTypeCode.TI, label: "Tarjeta de Identidad" },
    { code: DocumentTypeCode.CC, label: "Cedula de Ciudadania" },
    { code: DocumentTypeCode.CE, label: "Cedula de Extranjeria" },
    { code: DocumentTypeCode.PASAPORTE, label: "Pasaporte" },
    { code: DocumentTypeCode.OTRO, label: "Otro" }
  ];

  for (const docType of documentTypes) {
    await prisma.documentTypeCatalog.upsert({
      where: { code: docType.code },
      update: { label: docType.label },
      create: docType
    });
  }
}

async function seedSubjects() {
  const subjects = [
    { code: QuestionArea.LECTURA_CRITICA, label: "Lectura Critica" },
    { code: QuestionArea.MATEMATICAS, label: "Matematicas" },
    { code: QuestionArea.SOCIALES_CIUDADANAS, label: "Sociales y Ciudadanas" },
    { code: QuestionArea.CIENCIAS_NATURALES, label: "Ciencias Naturales" },
    { code: QuestionArea.INGLES, label: "Ingles" }
  ];

  for (const subject of subjects) {
    await prisma.subjectCatalog.upsert({
      where: { code: subject.code },
      update: { label: subject.label },
      create: subject
    });
  }

  const normalizedSubjects = [
    { code: "LECTURA_CRITICA", name: "Lectura Critica" },
    { code: "MATEMATICAS", name: "Matematicas" },
    { code: "SOCIALES_CIUDADANAS", name: "Sociales y Ciudadanas" },
    { code: "CIENCIAS_NATURALES", name: "Ciencias Naturales" },
    { code: "INGLES", name: "Ingles" }
  ];

  for (const subject of normalizedSubjects) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: { name: subject.name, isActive: true },
      create: { ...subject, isActive: true }
    });
  }
}

async function seedSchoolStructure() {
  const school = await prisma.school.upsert({
    where: { code: "COLEGIO_DEMO" },
    update: {
      name: "Colegio Demo",
      isActive: true
    },
    create: {
      code: "COLEGIO_DEMO",
      name: "Colegio Demo",
      description: "Estructura base para pruebas reales",
      isActive: true
    }
  });

  await prisma.schoolGroup.upsert({
    where: {
      schoolId_name_academicYear: {
        schoolId: school.id,
        name: "11-A",
        academicYear: new Date().getUTCFullYear()
      }
    },
    update: {
      grade: "11",
      isActive: true
    },
    create: {
      schoolId: school.id,
      code: "11A",
      name: "11-A",
      grade: "11",
      academicYear: new Date().getUTCFullYear(),
      isActive: true
    }
  });
}

async function seedPerformanceLevels() {
  const levels = [
    { nombre: "Bajo", minimo: 0, maximo: 49.99 },
    { nombre: "Basico", minimo: 50, maximo: 69.99 },
    { nombre: "Alto", minimo: 70, maximo: 84.99 },
    { nombre: "Superior", minimo: 85, maximo: 100 }
  ];

  for (const level of levels) {
    await prisma.performanceLevel.upsert({
      where: { nombre: level.nombre },
      update: { minimo: level.minimo, maximo: level.maximo, scope: "GLOBAL", isActive: true },
      create: { ...level, scope: "GLOBAL", isActive: true }
    });
  }
}

async function seedUsers() {
  const [adminRole, docenteRole] = await Promise.all([
    prisma.role.findUnique({ where: { code: RoleCode.ADMIN } }),
    prisma.role.findUnique({ where: { code: RoleCode.DOCENTE } })
  ]);

  if (!adminRole || !docenteRole) {
    throw new Error("No se encontraron los roles basicos luego del seed inicial.");
  }

  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@saber11.com" },
    update: {
      name: "Administrador",
      roleId: adminRole.id,
      passwordHash,
      isActive: true
    },
    create: {
      name: "Administrador",
      email: "admin@saber11.com",
      passwordHash,
      roleId: adminRole.id,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { email: "docente@saber11.com" },
    update: {
      name: "Docente",
      roleId: docenteRole.id,
      passwordHash,
      isActive: true
    },
    create: {
      name: "Docente",
      email: "docente@saber11.com",
      passwordHash,
      roleId: docenteRole.id,
      isActive: true
    }
  });
}

async function main() {
  await seedRoles();
  await seedDocumentTypes();
  await seedSubjects();
  await seedSchoolStructure();
  await seedPerformanceLevels();
  await seedUsers();

  console.log("Seed ejecutado correctamente.");
}

main()
  .catch((error) => {
    console.error("Error ejecutando seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
