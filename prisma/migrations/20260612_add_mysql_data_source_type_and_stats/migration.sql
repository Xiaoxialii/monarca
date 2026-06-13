ALTER TYPE "DataSourceType" ADD VALUE IF NOT EXISTS 'MYSQL';

CREATE TABLE IF NOT EXISTS "DataSourceStats" (
  "id" TEXT NOT NULL,
  "dataSourceConnectionId" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "rowCount" INTEGER,
  "minDate" TIMESTAMP(3),
  "maxDate" TIMESTAMP(3),
  "dateField" TEXT,
  "schemaHash" TEXT,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DataSourceStats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataSourceStats_dataSourceConnectionId_idx"
  ON "DataSourceStats"("dataSourceConnectionId");

CREATE UNIQUE INDEX IF NOT EXISTS "DataSourceStats_dataSourceConnectionId_tableName_key"
  ON "DataSourceStats"("dataSourceConnectionId", "tableName");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DataSourceStats_dataSourceConnectionId_fkey'
  ) THEN
    ALTER TABLE "DataSourceStats"
      ADD CONSTRAINT "DataSourceStats_dataSourceConnectionId_fkey"
      FOREIGN KEY ("dataSourceConnectionId")
      REFERENCES "DataSourceConnection"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
