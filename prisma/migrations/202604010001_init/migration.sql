-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'DOCENTE');

-- CreateEnum
CREATE TYPE "DocumentTypeCode" AS ENUM ('TI', 'CC', 'CE', 'PASAPORTE', 'OTRO');

-- CreateEnum
CREATE TYPE "QuestionArea" AS ENUM ('LECTURA_CRITICA', 'MATEMATICAS', 'SOCIALES_CIUDADANAS', 'CIENCIAS_NATURALES', 'INGLES');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('BAJO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SELECCION_UNICA');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLICADO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PENDIENTE', 'INICIADA', 'ENVIADA', 'CALIFICADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('EXAMENES', 'SIMULACROS', 'BANCOS_PREGUNTAS', 'HOJAS_RESPUESTA', 'CLAVES', 'REPORTES', 'MATERIALES_APOYO');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types_catalog" (
    "id" TEXT NOT NULL,
    "code" "DocumentTypeCode" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "code" "QuestionArea" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "tipoIdentificacion" "DocumentTypeCode" NOT NULL,
    "numeroIdentificacion" TEXT NOT NULL,
    "grado" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank" (
    "id" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "area" "QuestionArea" NOT NULL,
    "competencia" TEXT NOT NULL,
    "componente" TEXT NOT NULL,
    "nivelDificultad" "QuestionDifficulty" NOT NULL,
    "nivelCognitivo" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "contextoTextoBase" TEXT,
    "tipoPregunta" "QuestionType" NOT NULL DEFAULT 'SELECCION_UNICA',
    "gradoObjetivo" TEXT NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "explicacionRespuesta" TEXT,
    "observacionesDocente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "textoOpcion" TEXT NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoPrueba" TEXT NOT NULL,
    "gradoObjetivo" TEXT NOT NULL,
    "estado" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "tiempoLimiteMinutos" INTEGER NOT NULL,
    "totalPreguntas" INTEGER NOT NULL DEFAULT 0,
    "puntajeMaximo" DOUBLE PRECISION NOT NULL,
    "instrucciones" TEXT,
    "fechaPublicacion" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "puntajePregunta" DOUBLE PRECISION NOT NULL,
    "area" "QuestionArea" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "pruebaId" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "estado" "AttemptStatus" NOT NULL DEFAULT 'PENDIENTE',
    "tiempoEmpleadoSegundos" INTEGER,
    "puntajeTotalObtenido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentajeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nivelDesempenoGlobal" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_answers" (
    "id" TEXT NOT NULL,
    "intentoId" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "opcionIdSeleccionada" TEXT NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL DEFAULT false,
    "puntajeObtenido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tiempoRespuestaSegundos" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_results" (
    "id" TEXT NOT NULL,
    "intentoId" TEXT NOT NULL,
    "area" "QuestionArea" NOT NULL,
    "totalPreguntasArea" INTEGER NOT NULL,
    "correctas" INTEGER NOT NULL,
    "incorrectas" INTEGER NOT NULL,
    "puntajeArea" DOUBLE PRECISION NOT NULL,
    "porcentajeArea" DOUBLE PRECISION NOT NULL,
    "nivelDesempenoArea" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_levels" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "minimo" DOUBLE PRECISION NOT NULL,
    "maximo" DOUBLE PRECISION NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "categoria" "FileCategory" NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "peso_bytes" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "ruta_logica" TEXT NOT NULL,
    "descripcion" TEXT,
    "grado_objetivo" TEXT,
    "area" "QuestionArea",
    "tipo_prueba" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_file_id" TEXT,
    "source_file_id" TEXT,
    "uploaded_by_user_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_catalog_code_key" ON "document_types_catalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "students_numeroIdentificacion_key" ON "students"("numeroIdentificacion");

-- CreateIndex
CREATE INDEX "students_grado_idx" ON "students"("grado");

-- CreateIndex
CREATE INDEX "students_isDeleted_idx" ON "students"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_codigoInterno_key" ON "question_bank"("codigoInterno");

-- CreateIndex
CREATE INDEX "question_bank_area_idx" ON "question_bank"("area");

-- CreateIndex
CREATE INDEX "question_bank_nivelDificultad_idx" ON "question_bank"("nivelDificultad");

-- CreateIndex
CREATE INDEX "question_bank_gradoObjetivo_idx" ON "question_bank"("gradoObjetivo");

-- CreateIndex
CREATE INDEX "question_bank_estado_idx" ON "question_bank"("estado");

-- CreateIndex
CREATE INDEX "question_options_preguntaId_isArchived_idx" ON "question_options"("preguntaId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_preguntaId_orden_isArchived_key" ON "question_options"("preguntaId", "orden", "isArchived");

-- CreateIndex
CREATE INDEX "exams_estado_idx" ON "exams"("estado");

-- CreateIndex
CREATE INDEX "exams_gradoObjetivo_idx" ON "exams"("gradoObjetivo");

-- CreateIndex
CREATE INDEX "exams_tipoPrueba_idx" ON "exams"("tipoPrueba");

-- CreateIndex
CREATE INDEX "exams_isDeleted_idx" ON "exams"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "exams_nombre_tipoPrueba_gradoObjetivo_isDeleted_key" ON "exams"("nombre", "tipoPrueba", "gradoObjetivo", "isDeleted");

-- CreateIndex
CREATE INDEX "exam_questions_questionId_idx" ON "exam_questions"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_questionId_key" ON "exam_questions"("examId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_orden_key" ON "exam_questions"("examId", "orden");

-- CreateIndex
CREATE INDEX "exam_attempts_estudianteId_idx" ON "exam_attempts"("estudianteId");

-- CreateIndex
CREATE INDEX "exam_attempts_pruebaId_idx" ON "exam_attempts"("pruebaId");

-- CreateIndex
CREATE INDEX "exam_attempts_estado_idx" ON "exam_attempts"("estado");

-- CreateIndex
CREATE INDEX "student_answers_preguntaId_idx" ON "student_answers"("preguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "student_answers_intentoId_preguntaId_key" ON "student_answers"("intentoId", "preguntaId");

-- CreateIndex
CREATE INDEX "area_results_area_idx" ON "area_results"("area");

-- CreateIndex
CREATE UNIQUE INDEX "area_results_intentoId_area_key" ON "area_results"("intentoId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "performance_levels_nombre_key" ON "performance_levels"("nombre");

-- CreateIndex
CREATE INDEX "performance_levels_isActive_minimo_maximo_idx" ON "performance_levels"("isActive", "minimo", "maximo");

-- CreateIndex
CREATE INDEX "file_assets_categoria_activo_idx" ON "file_assets"("categoria", "activo");

-- CreateIndex
CREATE INDEX "file_assets_grado_objetivo_idx" ON "file_assets"("grado_objetivo");

-- CreateIndex
CREATE INDEX "file_assets_area_idx" ON "file_assets"("area");

-- CreateIndex
CREATE INDEX "file_assets_tipo_prueba_idx" ON "file_assets"("tipo_prueba");

-- CreateIndex
CREATE INDEX "file_assets_nombre_original_idx" ON "file_assets"("nombre_original");

-- CreateIndex
CREATE INDEX "file_assets_parent_file_id_idx" ON "file_assets"("parent_file_id");

-- CreateIndex
CREATE INDEX "file_assets_source_file_id_idx" ON "file_assets"("source_file_id");

-- CreateIndex
CREATE INDEX "file_assets_uploaded_by_user_id_idx" ON "file_assets"("uploaded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_parent_file_id_version_key" ON "file_assets"("parent_file_id", "version");

-- CreateIndex
CREATE INDEX "audit_logs_entidad_entidadId_idx" ON "audit_logs"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "question_bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question_bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_pruebaId_fkey" FOREIGN KEY ("pruebaId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "question_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_opcionIdSeleccionada_fkey" FOREIGN KEY ("opcionIdSeleccionada") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_results" ADD CONSTRAINT "area_results_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_parent_file_id_fkey" FOREIGN KEY ("parent_file_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

