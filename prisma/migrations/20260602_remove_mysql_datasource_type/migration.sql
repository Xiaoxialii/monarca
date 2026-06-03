DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DataSourceConnection"
    WHERE "type"::text = 'MYSQL'
  ) THEN
    RAISE EXCEPTION 'Cannot remove MYSQL data source type while MYSQL data source rows still exist.';
  END IF;
END $$;

ALTER TYPE "DataSourceType" RENAME TO "DataSourceType_old";

CREATE TYPE "DataSourceType" AS ENUM (
  'SQL_SERVER',
  'POSTGRESQL',
  'SNOWFLAKE',
  'BIGQUERY',
  'EXCEL',
  'CSV',
  'GOOGLE_ANALYTICS',
  'STRIPE'
);

ALTER TABLE "DataSourceConnection"
  ALTER COLUMN "type" TYPE "DataSourceType"
  USING ("type"::text::"DataSourceType");

DROP TYPE "DataSourceType_old";
