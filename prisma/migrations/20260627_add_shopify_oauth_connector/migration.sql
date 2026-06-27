-- Shopify OAuth connector account and one-time OAuth state storage.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'ECOMMERCE_PLATFORM'
      AND enumtypid = '"DataSourceType"'::regtype
  ) THEN
    ALTER TYPE "DataSourceType" ADD VALUE 'ECOMMERCE_PLATFORM';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "shopDomain" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EcommerceConnectorAccount" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dataSourceId" TEXT,
  "provider" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EcommerceConnectorAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthState_stateHash_key" ON "OAuthState"("stateHash");
CREATE INDEX IF NOT EXISTS "OAuthState_workspaceId_provider_idx" ON "OAuthState"("workspaceId", "provider");
CREATE INDEX IF NOT EXISTS "OAuthState_provider_shopDomain_idx" ON "OAuthState"("provider", "shopDomain");
CREATE INDEX IF NOT EXISTS "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EcommerceConnectorAccount_workspaceId_provider_shopDomain_key" ON "EcommerceConnectorAccount"("workspaceId", "provider", "shopDomain");
CREATE INDEX IF NOT EXISTS "EcommerceConnectorAccount_workspaceId_dataSourceId_idx" ON "EcommerceConnectorAccount"("workspaceId", "dataSourceId");
CREATE INDEX IF NOT EXISTS "EcommerceConnectorAccount_workspaceId_provider_idx" ON "EcommerceConnectorAccount"("workspaceId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OAuthState_workspaceId_fkey'
  ) THEN
    ALTER TABLE "OAuthState"
      ADD CONSTRAINT "OAuthState_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OAuthState_userId_fkey'
  ) THEN
    ALTER TABLE "OAuthState"
      ADD CONSTRAINT "OAuthState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EcommerceConnectorAccount_workspaceId_fkey'
  ) THEN
    ALTER TABLE "EcommerceConnectorAccount"
      ADD CONSTRAINT "EcommerceConnectorAccount_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EcommerceConnectorAccount_dataSourceId_fkey'
  ) THEN
    ALTER TABLE "EcommerceConnectorAccount"
      ADD CONSTRAINT "EcommerceConnectorAccount_dataSourceId_fkey"
      FOREIGN KEY ("dataSourceId") REFERENCES "DataSourceConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
