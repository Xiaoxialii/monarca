CREATE TABLE IF NOT EXISTS "ConsultingRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "companyName" TEXT,
  "role" TEXT,
  "dataSources" TEXT,
  "painPoints" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "source" TEXT DEFAULT 'consulting_page',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsultingRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsultingRequest_createdAt_idx" ON "ConsultingRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "ConsultingRequest_status_createdAt_idx" ON "ConsultingRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsultingRequest_email_idx" ON "ConsultingRequest"("email");
