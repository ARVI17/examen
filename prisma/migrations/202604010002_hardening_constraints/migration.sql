-- Hardened constraints and safe option versioning support
ALTER TABLE "question_options"
ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS "question_options_preguntaId_orden_key";

CREATE INDEX IF NOT EXISTS "question_options_preguntaId_isArchived_idx"
ON "question_options"("preguntaId", "isArchived");

CREATE UNIQUE INDEX IF NOT EXISTS "question_options_preguntaId_orden_isArchived_key"
ON "question_options"("preguntaId", "orden", "isArchived");

CREATE UNIQUE INDEX IF NOT EXISTS "exams_nombre_tipoPrueba_gradoObjetivo_isDeleted_key"
ON "exams"("nombre", "tipoPrueba", "gradoObjetivo", "isDeleted");

CREATE UNIQUE INDEX IF NOT EXISTS "file_assets_parentFileId_version_key"
ON "file_assets"("parent_file_id", "version");
