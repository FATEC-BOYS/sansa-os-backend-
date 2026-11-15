-- Additive, idempotent preparation for existing installations.
-- Prisma db push warns about adding a unique index even when the new column
-- has only NULLs. Create it explicitly; duplicates, if any, still fail closed.
-- No rows or existing columns are changed or deleted.
DO $$
BEGIN
  IF to_regclass('"Approval"') IS NOT NULL THEN
    ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "proposalVersionId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Approval_proposalVersionId_key"
      ON "Approval"("proposalVersionId");
  END IF;
END $$;
