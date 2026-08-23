ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "productAccessEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "UserProductAccessAudit" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "targetUserId" TEXT NOT NULL,
  "previousValue" BOOLEAN NOT NULL,
  "newValue" BOOLEAN NOT NULL,
  "eventType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserProductAccessAudit_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserProductAccessAudit_actorUserId_fkey'
  ) THEN
    ALTER TABLE "UserProductAccessAudit"
      ADD CONSTRAINT "UserProductAccessAudit_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserProductAccessAudit_targetUserId_fkey'
  ) THEN
    ALTER TABLE "UserProductAccessAudit"
      ADD CONSTRAINT "UserProductAccessAudit_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "UserProductAccessAudit_actorUserId_idx"
  ON "UserProductAccessAudit"("actorUserId");

CREATE INDEX IF NOT EXISTS "UserProductAccessAudit_targetUserId_createdAt_idx"
  ON "UserProductAccessAudit"("targetUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "UserProductAccessAudit_eventType_createdAt_idx"
  ON "UserProductAccessAudit"("eventType", "createdAt");
