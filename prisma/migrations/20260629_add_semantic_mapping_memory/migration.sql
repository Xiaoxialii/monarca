CREATE TABLE "SemanticMappingMemory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "normalizedFieldName" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '*',
    "mappedConcept" TEXT NOT NULL,
    "embeddingVector" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "userFeedbackScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "embeddingSimilarityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.32,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemanticMappingMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SemanticMappingMemory_workspaceId_platform_normalizedFieldName_mappedConcept_key"
ON "SemanticMappingMemory"("workspaceId", "platform", "normalizedFieldName", "mappedConcept");

CREATE INDEX "SemanticMappingMemory_workspaceId_platform_idx"
ON "SemanticMappingMemory"("workspaceId", "platform");

CREATE INDEX "SemanticMappingMemory_workspaceId_normalizedFieldName_idx"
ON "SemanticMappingMemory"("workspaceId", "normalizedFieldName");

CREATE INDEX "SemanticMappingMemory_workspaceId_mappedConcept_idx"
ON "SemanticMappingMemory"("workspaceId", "mappedConcept");

CREATE INDEX "SemanticMappingMemory_lastSeenAt_idx"
ON "SemanticMappingMemory"("lastSeenAt");

ALTER TABLE "SemanticMappingMemory"
ADD CONSTRAINT "SemanticMappingMemory_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
