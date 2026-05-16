import fs from "fs";
import path from "path";
import { PrismaClient, RoleCode } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const REQUIRED_CONFIRM_TEXT = "LIMPIAR DATOS USUARIOS";

const hasFlag = (name: string) => argv.includes(`--${name}`);
const getArgValue = (name: string, fallback = "") => {
  const match = argv.find((value) => value.startsWith(`--${name}=`));
  if (!match) {
    return fallback;
  }
  const [, raw] = match.split("=", 2);
  return raw?.trim() ?? fallback;
};

const parseBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === null || value.trim().length === 0) {
    return fallback;
  }
  return value.trim().toLowerCase() === "true";
};

const fail = (message: string, code = 1): never => {
  throw Object.assign(new Error(message), { exitCode: code });
};

const assertBackupFile = (backupFile: string) => {
  if (!backupFile) {
    fail("Debes indicar --backup-file=<ruta_backup.sql>.");
  }
  const backupPath = path.resolve(process.cwd(), backupFile);
  if (!fs.existsSync(backupPath)) {
    fail(`Backup no encontrado: ${backupPath}`);
  }
  return backupPath;
};

const assertLocalEnvironment = () => {
  const localPrepare = (process.env.LOCAL_PRODUCTION_PREPARE || "").trim().toLowerCase() === "true";
  if (!localPrepare) {
    fail("Bloqueado: define LOCAL_PRODUCTION_PREPARE=true para ejecutar limpieza.");
  }

  const databaseUrl = (process.env.DATABASE_URL || "").trim().toLowerCase();
  if (!databaseUrl) {
    fail("DATABASE_URL no configurada.");
  }

  const looksLocal =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    databaseUrl.includes("@db:") ||
    databaseUrl.includes("@postgres:") ||
    databaseUrl.includes("saber11db");

  const allowNonLocal = parseBool(getArgValue("allow-non-local", ""), false);
  if (!looksLocal && !allowNonLocal) {
    fail("Bloqueado: DATABASE_URL no parece local/LAN controlada. Usa --allow-non-local=true solo en staging controlado.");
  }
};

type CleanupCounts = {
  studentAnswers: number;
  areaResults: number;
  examAttempts: number;
  examAssignments: number;
  examQuestions: number;
  exams: number;
  questionTopics: number;
  questionOptions: number;
  questions: number;
  questionGenerations: number;
  questionSources: number;
  reportRecords: number;
  fileAssets: number;
  students: number;
  schoolGroups: number;
  userScopeAssignments: number;
  refreshTokens: number;
  auditLogs: number;
  usersNonAdmin: number;
};

const collectCounts = async (adminIds: string[]): Promise<CleanupCounts> => {
  const [studentAnswers, areaResults, examAttempts, examAssignments, examQuestions, exams, questionTopics, questionOptions, questions, questionGenerations, questionSources, reportRecords, fileAssets, students, schoolGroups, userScopeAssignments, refreshTokens, auditLogs, usersNonAdmin] = await Promise.all([
    prisma.studentAnswer.count(),
    prisma.areaResult.count(),
    prisma.examAttempt.count(),
    prisma.examAssignment.count(),
    prisma.examQuestion.count(),
    prisma.exam.count(),
    prisma.questionTopic.count(),
    prisma.questionOption.count(),
    prisma.question.count(),
    prisma.questionGeneration.count(),
    prisma.questionSource.count(),
    prisma.reportRecord.count(),
    prisma.fileAsset.count(),
    prisma.student.count({ where: { isDeleted: false } }),
    prisma.schoolGroup.count(),
    prisma.userScopeAssignment.count(),
    prisma.refreshToken.count(),
    prisma.auditLog.count(),
    prisma.user.count({ where: { id: { notIn: adminIds } } })
  ]);

  return {
    studentAnswers,
    areaResults,
    examAttempts,
    examAssignments,
    examQuestions,
    exams,
    questionTopics,
    questionOptions,
    questions,
    questionGenerations,
    questionSources,
    reportRecords,
    fileAssets,
    students,
    schoolGroups,
    userScopeAssignments,
    refreshTokens,
    auditLogs,
    usersNonAdmin
  };
};

const main = async () => {
  const dryRun = hasFlag("dry-run");
  const confirmText = getArgValue("confirm", "");
  const keepAdmin = parseBool(getArgValue("keep-admin", "true"), true);
  const backupFile = getArgValue("backup-file", "");

  if (!dryRun && confirmText !== REQUIRED_CONFIRM_TEXT) {
    fail(`Confirmacion invalida. Usa exactamente --confirm="${REQUIRED_CONFIRM_TEXT}"`);
  }

  if (!keepAdmin) {
    fail("Bloqueado: --keep-admin debe permanecer en true por seguridad.");
  }

  assertLocalEnvironment();
  const backupPath = assertBackupFile(backupFile);

  const adminRole = await prisma.role.findUnique({
    where: { code: RoleCode.ADMIN },
    select: { id: true, code: true }
  });

  if (!adminRole) {
    fail("No existe rol ADMIN. No es seguro continuar.");
  }
  const adminRoleId = adminRole!.id;

  const adminUsers = await prisma.user.findMany({
    where: { roleId: adminRoleId },
    select: { id: true, email: true, isActive: true }
  });

  if (adminUsers.length === 0) {
    fail("No existe un usuario ADMIN. Limpieza cancelada para evitar bloqueo total.");
  }

  const adminIds = adminUsers.map((item) => item.id);
  const before = await collectCounts(adminIds);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          success: true,
          mode: "dry-run",
          keepAdmin,
          backupFile: path.relative(process.cwd(), backupPath).split(path.sep).join("/"),
          preservedAdmins: adminUsers.map((item) => ({
            id: item.id,
            email: item.email,
            isActive: item.isActive
          })),
          plannedDeleteCounts: before
        },
        null,
        2
      )
    );
    return;
  }

  const deletionResult = await prisma.$transaction(async (tx) => {
    const removed = {
      studentAnswers: (await tx.studentAnswer.deleteMany({})).count,
      areaResults: (await tx.areaResult.deleteMany({})).count,
      examAttempts: (await tx.examAttempt.deleteMany({})).count,
      examAssignments: (await tx.examAssignment.deleteMany({})).count,
      examQuestions: (await tx.examQuestion.deleteMany({})).count,
      exams: (await tx.exam.deleteMany({})).count,
      questionTopics: (await tx.questionTopic.deleteMany({})).count,
      questionOptions: (await tx.questionOption.deleteMany({})).count,
      questions: (await tx.question.deleteMany({})).count,
      questionGenerations: (await tx.questionGeneration.deleteMany({})).count,
      questionSources: (await tx.questionSource.deleteMany({})).count,
      reportRecords: (await tx.reportRecord.deleteMany({})).count,
      fileAssets: (await tx.fileAsset.deleteMany({})).count,
      students: (await tx.student.deleteMany({})).count,
      schoolGroups: (await tx.schoolGroup.deleteMany({})).count,
      userScopeAssignments: (await tx.userScopeAssignment.deleteMany({})).count,
      refreshTokens: (await tx.refreshToken.deleteMany({})).count,
      auditLogs: (await tx.auditLog.deleteMany({})).count,
      usersNonAdmin: (await tx.user.deleteMany({ where: { id: { notIn: adminIds } } })).count
    };
    return removed;
  });

  const remaining = await collectCounts(adminIds);

  console.log(
    JSON.stringify(
      {
        success: true,
        mode: "apply",
        keepAdmin,
        backupFile: path.relative(process.cwd(), backupPath).split(path.sep).join("/"),
        preservedAdmins: adminUsers.map((item) => ({
          id: item.id,
          email: item.email,
          isActive: item.isActive
        })),
        deleted: deletionResult,
        remaining,
        notes: [
          "Estructura y migraciones conservadas.",
          "Catalogo de colegios no se toca en esta limpieza.",
          "Usuarios ADMIN preservados."
        ]
      },
      null,
      2
    )
  );
};

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "No fue posible limpiar datos de usuario";
    const exitCode =
      typeof (error as { exitCode?: unknown })?.exitCode === "number" ? ((error as { exitCode: number }).exitCode as number) : 1;
    console.error(
      JSON.stringify(
        {
          success: false,
          mode: "apply",
          message
        },
        null,
        2
      )
    );
    process.exit(exitCode);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
