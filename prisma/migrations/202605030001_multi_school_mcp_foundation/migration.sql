-- Multi-school, multi-group, sources, IA generations and reporting foundation

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExamAssignmentScope') THEN
    CREATE TYPE "ExamAssignmentScope" AS ENUM ('GLOBAL', 'SCHOOL', 'GROUP', 'STUDENT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionSourceType') THEN
    CREATE TYPE "QuestionSourceType" AS ENUM ('STORAGE', 'MATERIAL', 'MANUAL', 'IA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionGenerationStatus') THEN
    CREATE TYPE "QuestionGenerationStatus" AS ENUM ('BORRADOR', 'REVISADA', 'APROBADA', 'RECHAZADA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportScope') THEN
    CREATE TYPE "ReportScope" AS ENUM ('STUDENT', 'GROUP', 'SCHOOL', 'EXAM', 'SYSTEM');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "schools" (
  "id" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "school_groups" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "grade" TEXT,
  "academicYear" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subjects_catalog" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subjects_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "topics" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "question_sources" (
  "id" TEXT NOT NULL,
  "sourceType" "QuestionSourceType" NOT NULL,
  "logicalPath" TEXT,
  "originalFileName" TEXT,
  "sha256" TEXT,
  "metadata" JSONB,
  "fileAssetId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "question_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "question_generations" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "requestedByUserId" TEXT,
  "provider" TEXT,
  "model" TEXT,
  "prompt" TEXT NOT NULL,
  "context" JSONB,
  "rawOutput" JSONB,
  "validation" JSONB,
  "status" "QuestionGenerationStatus" NOT NULL DEFAULT 'BORRADOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "question_generations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "question_topics" (
  "questionId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_topics_pkey" PRIMARY KEY ("questionId", "topicId")
);

CREATE TABLE IF NOT EXISTS "exam_assignments" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "scope" "ExamAssignmentScope" NOT NULL DEFAULT 'GLOBAL',
  "schoolId" TEXT,
  "groupId" TEXT,
  "studentId" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "maxAttempts" INTEGER NOT NULL DEFAULT 1,
  "allowRetake" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "report_records" (
  "id" TEXT NOT NULL,
  "scope" "ReportScope" NOT NULL,
  "scopeRef" TEXT,
  "payload" JSONB NOT NULL,
  "generatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "schoolId" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fechaNacimiento" DATE;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "genero" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "institucion" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "jornada" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "grupo" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "departamento" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "municipio" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "telefono" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "acudienteNombre" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "acudienteEmail" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "acudienteTelefono" TEXT;

ALTER TABLE "question_bank" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "question_bank" ADD COLUMN IF NOT EXISTS "generationId" TEXT;
ALTER TABLE "question_bank" ADD COLUMN IF NOT EXISTS "sourceHash" TEXT;
ALTER TABLE "question_bank" ADD COLUMN IF NOT EXISTS "subjectId" TEXT;
ALTER TABLE "question_bank" ADD COLUMN IF NOT EXISTS "isAiGenerated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "assignmentId" TEXT;
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "presentacion" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_groups_schoolId_fkey') THEN
    ALTER TABLE "school_groups"
      ADD CONSTRAINT "school_groups_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_subjectId_fkey') THEN
    ALTER TABLE "topics"
      ADD CONSTRAINT "topics_subjectId_fkey"
      FOREIGN KEY ("subjectId") REFERENCES "subjects_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_sources_fileAssetId_fkey') THEN
    ALTER TABLE "question_sources"
      ADD CONSTRAINT "question_sources_fileAssetId_fkey"
      FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_generations_sourceId_fkey') THEN
    ALTER TABLE "question_generations"
      ADD CONSTRAINT "question_generations_sourceId_fkey"
      FOREIGN KEY ("sourceId") REFERENCES "question_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_generations_requestedByUserId_fkey') THEN
    ALTER TABLE "question_generations"
      ADD CONSTRAINT "question_generations_requestedByUserId_fkey"
      FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_topics_questionId_fkey') THEN
    ALTER TABLE "question_topics"
      ADD CONSTRAINT "question_topics_questionId_fkey"
      FOREIGN KEY ("questionId") REFERENCES "question_bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_topics_topicId_fkey') THEN
    ALTER TABLE "question_topics"
      ADD CONSTRAINT "question_topics_topicId_fkey"
      FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_examId_fkey') THEN
    ALTER TABLE "exam_assignments"
      ADD CONSTRAINT "exam_assignments_examId_fkey"
      FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_schoolId_fkey') THEN
    ALTER TABLE "exam_assignments"
      ADD CONSTRAINT "exam_assignments_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_groupId_fkey') THEN
    ALTER TABLE "exam_assignments"
      ADD CONSTRAINT "exam_assignments_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "school_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_studentId_fkey') THEN
    ALTER TABLE "exam_assignments"
      ADD CONSTRAINT "exam_assignments_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_assignments_createdByUserId_fkey') THEN
    ALTER TABLE "exam_assignments"
      ADD CONSTRAINT "exam_assignments_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_records_generatedByUserId_fkey') THEN
    ALTER TABLE "report_records"
      ADD CONSTRAINT "report_records_generatedByUserId_fkey"
      FOREIGN KEY ("generatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_schoolId_fkey') THEN
    ALTER TABLE "students"
      ADD CONSTRAINT "students_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_groupId_fkey') THEN
    ALTER TABLE "students"
      ADD CONSTRAINT "students_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "school_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_bank_sourceId_fkey') THEN
    ALTER TABLE "question_bank"
      ADD CONSTRAINT "question_bank_sourceId_fkey"
      FOREIGN KEY ("sourceId") REFERENCES "question_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_bank_generationId_fkey') THEN
    ALTER TABLE "question_bank"
      ADD CONSTRAINT "question_bank_generationId_fkey"
      FOREIGN KEY ("generationId") REFERENCES "question_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_bank_subjectId_fkey') THEN
    ALTER TABLE "question_bank"
      ADD CONSTRAINT "question_bank_subjectId_fkey"
      FOREIGN KEY ("subjectId") REFERENCES "subjects_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_attempts_assignmentId_fkey') THEN
    ALTER TABLE "exam_attempts"
      ADD CONSTRAINT "exam_attempts_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "exam_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "schools_code_key" ON "schools"("code");
CREATE INDEX IF NOT EXISTS "schools_name_idx" ON "schools"("name");
CREATE INDEX IF NOT EXISTS "schools_isActive_idx" ON "schools"("isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "school_groups_schoolId_name_academicYear_key" ON "school_groups"("schoolId", "name", "academicYear");
CREATE INDEX IF NOT EXISTS "school_groups_schoolId_isActive_idx" ON "school_groups"("schoolId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_catalog_code_key" ON "subjects_catalog"("code");
CREATE INDEX IF NOT EXISTS "subjects_catalog_isActive_idx" ON "subjects_catalog"("isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "topics_subjectId_name_key" ON "topics"("subjectId", "name");
CREATE INDEX IF NOT EXISTS "topics_subjectId_isActive_idx" ON "topics"("subjectId", "isActive");

CREATE INDEX IF NOT EXISTS "question_sources_sourceType_idx" ON "question_sources"("sourceType");
CREATE INDEX IF NOT EXISTS "question_sources_logicalPath_idx" ON "question_sources"("logicalPath");
CREATE INDEX IF NOT EXISTS "question_sources_sha256_idx" ON "question_sources"("sha256");

CREATE INDEX IF NOT EXISTS "question_generations_status_idx" ON "question_generations"("status");
CREATE INDEX IF NOT EXISTS "question_generations_provider_model_idx" ON "question_generations"("provider", "model");
CREATE INDEX IF NOT EXISTS "question_generations_sourceId_idx" ON "question_generations"("sourceId");

CREATE INDEX IF NOT EXISTS "question_topics_topicId_idx" ON "question_topics"("topicId");

CREATE INDEX IF NOT EXISTS "exam_assignments_examId_isActive_idx" ON "exam_assignments"("examId", "isActive");
CREATE INDEX IF NOT EXISTS "exam_assignments_scope_schoolId_groupId_studentId_idx" ON "exam_assignments"("scope", "schoolId", "groupId", "studentId");

CREATE INDEX IF NOT EXISTS "report_records_scope_scopeRef_idx" ON "report_records"("scope", "scopeRef");
CREATE INDEX IF NOT EXISTS "report_records_generatedByUserId_idx" ON "report_records"("generatedByUserId");

CREATE INDEX IF NOT EXISTS "students_schoolId_groupId_idx" ON "students"("schoolId", "groupId");
CREATE INDEX IF NOT EXISTS "students_institucion_grupo_idx" ON "students"("institucion", "grupo");
CREATE INDEX IF NOT EXISTS "students_email_idx" ON "students"("email");

CREATE INDEX IF NOT EXISTS "question_bank_subjectId_idx" ON "question_bank"("subjectId");
CREATE INDEX IF NOT EXISTS "question_bank_sourceId_idx" ON "question_bank"("sourceId");
CREATE INDEX IF NOT EXISTS "question_bank_generationId_idx" ON "question_bank"("generationId");
CREATE INDEX IF NOT EXISTS "question_bank_sourceHash_idx" ON "question_bank"("sourceHash");

CREATE INDEX IF NOT EXISTS "exam_attempts_assignmentId_idx" ON "exam_attempts"("assignmentId");
