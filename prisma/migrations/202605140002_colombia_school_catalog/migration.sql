ALTER TABLE "schools"
  ADD COLUMN IF NOT EXISTS "establecimiento" TEXT,
  ADD COLUMN IF NOT EXISTS "sede" TEXT,
  ADD COLUMN IF NOT EXISTS "departamento" TEXT,
  ADD COLUMN IF NOT EXISTS "municipio" TEXT,
  ADD COLUMN IF NOT EXISTS "departamentoCodigo" TEXT,
  ADD COLUMN IF NOT EXISTS "municipioCodigo" TEXT,
  ADD COLUMN IF NOT EXISTS "sectorOriginal" TEXT,
  ADD COLUMN IF NOT EXISTS "sectorNormalizado" TEXT,
  ADD COLUMN IF NOT EXISTS "zona" TEXT,
  ADD COLUMN IF NOT EXISTS "direccion" TEXT,
  ADD COLUMN IF NOT EXISTS "codigoDane" TEXT,
  ADD COLUMN IF NOT EXISTS "estadoFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "fuente" TEXT,
  ADD COLUMN IF NOT EXISTS "fechaFuente" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "searchLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "nombreNormalizado" TEXT;

CREATE INDEX IF NOT EXISTS "schools_departamento_idx" ON "schools"("departamento");
CREATE INDEX IF NOT EXISTS "schools_municipio_idx" ON "schools"("municipio");
CREATE INDEX IF NOT EXISTS "schools_sectorNormalizado_idx" ON "schools"("sectorNormalizado");
CREATE INDEX IF NOT EXISTS "schools_codigoDane_idx" ON "schools"("codigoDane");
CREATE INDEX IF NOT EXISTS "schools_departamento_municipio_idx" ON "schools"("departamento", "municipio");
CREATE INDEX IF NOT EXISTS "schools_searchLabel_idx" ON "schools"("searchLabel");
CREATE INDEX IF NOT EXISTS "schools_nombreNormalizado_idx" ON "schools"("nombreNormalizado");
