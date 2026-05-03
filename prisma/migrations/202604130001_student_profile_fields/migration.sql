-- AlterTable
ALTER TABLE "students"
  ADD COLUMN "fechaNacimiento" DATE,
  ADD COLUMN "genero" TEXT,
  ADD COLUMN "institucion" TEXT,
  ADD COLUMN "jornada" TEXT,
  ADD COLUMN "grupo" TEXT,
  ADD COLUMN "departamento" TEXT,
  ADD COLUMN "municipio" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "telefono" TEXT,
  ADD COLUMN "acudienteNombre" TEXT,
  ADD COLUMN "acudienteEmail" TEXT,
  ADD COLUMN "acudienteTelefono" TEXT;

-- Optional index for frequent filter by student email
CREATE INDEX IF NOT EXISTS "students_email_idx" ON "students"("email");
