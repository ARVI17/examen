-- User scope assignments for secure multi-school docente access

CREATE TABLE IF NOT EXISTS "user_scope_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT,
  "groupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_scope_assignments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scope_assignments_userId_fkey') THEN
    ALTER TABLE "user_scope_assignments"
      ADD CONSTRAINT "user_scope_assignments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scope_assignments_schoolId_fkey') THEN
    ALTER TABLE "user_scope_assignments"
      ADD CONSTRAINT "user_scope_assignments_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_scope_assignments_groupId_fkey') THEN
    ALTER TABLE "user_scope_assignments"
      ADD CONSTRAINT "user_scope_assignments_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "school_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_scope_assignments_userId_idx" ON "user_scope_assignments"("userId");
CREATE INDEX IF NOT EXISTS "user_scope_assignments_schoolId_idx" ON "user_scope_assignments"("schoolId");
CREATE INDEX IF NOT EXISTS "user_scope_assignments_groupId_idx" ON "user_scope_assignments"("groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_scope_assignments_userId_schoolId_groupId_key"
  ON "user_scope_assignments"("userId", "schoolId", "groupId");
