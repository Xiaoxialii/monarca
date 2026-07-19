ALTER TABLE "EcommerceConnectorAccount"
  ADD COLUMN IF NOT EXISTS "grantedScopes" TEXT,
  ADD COLUMN IF NOT EXISTS "requiredScopes" TEXT,
  ADD COLUMN IF NOT EXISTS "scopeStatus" TEXT NOT NULL DEFAULT 'OK';

UPDATE "EcommerceConnectorAccount"
SET
  "grantedScopes" = COALESCE("grantedScopes", "scopes"),
  "requiredScopes" = COALESCE("requiredScopes", 'read_orders,read_products,read_customers'),
  "scopeStatus" = COALESCE("scopeStatus", 'OK')
WHERE "provider" = 'shopify';
