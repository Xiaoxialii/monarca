import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import jitiFactory from "jiti";
import { ConnectionStatus, DataSourceType } from "@prisma/client";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(process.cwd() + "/");
const { prisma } = jiti("./lib/prisma.ts");
const { excelRecordsFromBuffer } = jiti("./lib/file-upload-schema.ts");
const { runUnifiedIngestionPipeline } = jiti("./lib/ingestion/unified-ingestion-engine.ts");
const { writeCanonicalDatasetArtifacts } = jiti("./lib/snapshot/canonical-artifact-writer.ts");
const { ECOMMERCE_CANONICAL_SCHEMA_VERSION } = jiti("./lib/snapshot/canonical-snapshot-generator.ts");
const { uploadContentHash, uploadSourceFingerprint } = jiti("./lib/uploads/upload-dedupe.ts");
const { clearWorkspaceReportCaches } = jiti("./lib/report-cache-invalidation.ts");

const args = parseArgs(process.argv.slice(2));
const workspaceId = requireArg(args, "workspace-id");
const inputs = [
  {
    role: "commerce",
    provider: "amazon",
    businessSource: "amazon",
    filePath: requireArg(args, "commerce")
  },
  {
    role: "inventory",
    provider: "inventory",
    businessSource: "inventory",
    filePath: requireArg(args, "inventory")
  },
  {
    role: "ads",
    provider: "meta_ads",
    businessSource: "meta_ads",
    filePath: requireArg(args, "ads")
  }
];

try {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true }
  });
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

  const results = [];
  for (const input of inputs) {
    console.error(`[publish-canonical] start ${input.role}: ${path.basename(input.filePath)}`);
    const result = await publishOne(workspaceId, input);
    console.error(`[publish-canonical] done ${input.role}: ${result.dataSourceId} ${result.schemaSnapshotId}`);
    results.push(result);
  }

  console.error("[publish-canonical] clearing report caches");
  await clearWorkspaceReportCaches(prisma, workspaceId);
  console.log(JSON.stringify({
    ok: true,
    workspace: { id: workspace.id, name: workspace.name },
    canonicalSchemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    published: results
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function publishOne(workspaceId, input) {
  const absolutePath = path.resolve(input.filePath);
  const fileName = path.basename(absolutePath);
  console.error(`[publish-canonical] reading ${fileName}`);
  const fileBuffer = fs.readFileSync(absolutePath);
  const contentHash = uploadContentHash(fileBuffer);
  const sourceFingerprint = uploadSourceFingerprint({
    fileName,
    fileSize: fileBuffer.length,
    contentHash,
    sourceType: DataSourceType.EXCEL
  });
  console.error(`[publish-canonical] parsing ${fileName}`);
  const parsedRows = await excelRecordsFromBuffer(fileName, fileBuffer);
  console.error(`[publish-canonical] parsed ${fileName}: ${parsedRows.length} rows`);
  console.error(`[publish-canonical] normalizing ${fileName}`);
  const ingestion = await runUnifiedIngestionPipeline({
    source: "excel",
    workspace_id: workspaceId,
    payload: parsedRows
  });
  const tables = Object.fromEntries(Object.entries(ingestion.canonical_data.tables)
    .map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0]));
  console.error(`[publish-canonical] upserting data source ${fileName}`);
  const dataSource = await upsertDataSource({
    workspaceId,
    input,
    fileName,
    fileBuffer,
    contentHash,
    sourceFingerprint
  });
  console.error(`[publish-canonical] writing artifacts ${fileName}: ${dataSource.id}`);
  const fixedSchemaJson = await writeCanonicalDatasetArtifacts({
    workspaceId,
    dataSourceId: dataSource.id,
    sourceProvider: input.provider,
    fileName,
    canonicalDataset: {
      ...ingestion.canonical_data,
      metadata: {
        ...ingestion.canonical_data.metadata,
        source_platforms: [input.provider]
      }
    },
    manifest: {
      sourceProvider: input.provider,
      businessType: "ecommerce",
      dataMode: "upload_unified_canonical",
      confidenceScore: ingestion.canonical_data.metadata.mapping_confidence,
      latestBusinessDate: ingestion.canonical_data.metadata.normalized_at,
      sourceInferenceVersion: ingestion.source_inference?.inferenceVersion,
      semanticMappingVersion: "semantic-mapping-v2",
      canonicalSchemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION
    }
  });

  console.error(`[publish-canonical] storing schema snapshot ${fileName}: ${dataSource.id}`);
  const snapshot = await createMinimalSchemaSnapshot({
    workspaceId,
    dataSourceId: dataSource.id,
    schemaJson: fixedSchemaJson,
    input,
    ingestion,
    tables
  });

  console.error(`[publish-canonical] updating source schema ${dataSource.id}`);
  const semanticMappingCache = sourceSemanticMappingCache(fixedSchemaJson, ingestion);
  await prisma.dataSourceConnection.update({
    where: { id: dataSource.id },
    data: {
      schemas: {
        scannedAt: new Date().toISOString(),
        fileName,
        fileSize: fileBuffer.length,
        sourceProvider: input.provider,
        sourcePlatforms: [input.provider],
        tables: fixedSchemaJson.tables,
        semanticMappingCache,
        unifiedIngestion: {
          status: "READY",
          source: ingestion.source,
          detectedSchema: ingestion.detected_schema,
          semantic: ingestion.semantic,
          learning: ingestion.learning,
          sourceInference: ingestion.source_inference ?? null
        }
      },
      lastSyncAt: new Date()
    }
  });

  return {
    role: input.role,
    dataSourceId: dataSource.id,
    schemaSnapshotId: snapshot.id,
    fileName,
    parsedRows: parsedRows.length,
    tables
  };
}

function sourceSemanticMappingCache(schemaJson, ingestion) {
  const sourceFieldMappings = Array.isArray(ingestion.canonical_data?.metadata?.field_mappings)
    ? ingestion.canonical_data.metadata.field_mappings
    : [];

  return {
    ...(schemaJson.semanticMappingCache ?? {}),
    source: "unified_ingestion_source_fields",
    status: "READY",
    field_mappings: sourceFieldMappings
  };
}

async function createMinimalSchemaSnapshot({ workspaceId, dataSourceId, schemaJson, input, ingestion, tables }) {
  const nextVersion = (await prisma.schemaSnapshot.aggregate({
    where: { workspaceId },
    _max: { version: true }
  }))._max.version ?? 0;
  const publishedAt = new Date();
  const sourceFieldMappings = Array.isArray(ingestion.canonical_data?.metadata?.field_mappings)
    ? ingestion.canonical_data.metadata.field_mappings
    : [];
  const semanticMappingCache = sourceSemanticMappingCache(schemaJson, ingestion);
  const minimalSchemaJson = {
    businessType: "ecommerce",
    sourceProvider: input.provider,
    sourcePlatforms: [input.provider],
    source_platforms: [input.provider],
    schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    status: "ready",
    generatedAt: publishedAt.toISOString(),
    syncStartedAt: schemaJson.syncStartedAt ?? publishedAt.toISOString(),
    syncFinishedAt: schemaJson.syncFinishedAt ?? publishedAt.toISOString(),
    latestBusinessDate: schemaJson.latestBusinessDate ?? ingestion.canonical_data.metadata.normalized_at,
    dataMode: "upload_unified_canonical",
    confidenceScore: ingestion.canonical_data.metadata.mapping_confidence,
    missingFields: schemaJson.missingFields ?? [],
    estimationUsed: Boolean(schemaJson.estimationUsed),
    canonicalArtifactManifest: schemaJson.canonicalArtifactManifest,
    canonical_artifact_manifest: schemaJson.canonicalArtifactManifest,
    field_mappings: sourceFieldMappings,
    semanticLayer: schemaJson.semanticLayer ?? null,
    semanticMappingCache,
    unifiedIngestion: {
      status: "READY",
      source: ingestion.source,
      detectedSchema: ingestion.detected_schema,
      semantic: ingestion.semantic,
      learning: ingestion.learning,
      sourceInference: ingestion.source_inference ?? null
    },
    tables: schemaJson.tables,
    canonicalDataset: null,
    dashboardSnapshot: null,
    metrics: null
  };

  return prisma.schemaSnapshot.create({
    data: {
      workspaceId,
      dataSourceId,
      version: nextVersion + 1,
      status: ConnectionStatus.CONNECTED,
      schemaStatus: "READY",
      canonicalStatus: "READY",
      canonicalVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
      validationStatus: "VALID",
      sourceInferenceVersion: ingestion.source_inference?.inferenceVersion ?? null,
      semanticMappingVersion: "semantic-mapping-v2",
      productContextIndexVersion: "product-context-index-v1",
      publishedAt,
      schemaJson: minimalSchemaJson,
      qualityReport: {
        sourceProvider: input.provider,
        reportRole: input.role,
        canonicalArtifactManifest: schemaJson.canonicalArtifactManifest,
        canonical_artifact_manifest: schemaJson.canonicalArtifactManifest,
        field_mappings: sourceFieldMappings,
        semanticMappingCache: {
          version: semanticMappingCache.version,
          schemaHash: semanticMappingCache.schemaHash,
          generatedAt: semanticMappingCache.generatedAt,
          source: semanticMappingCache.source,
          status: semanticMappingCache.status,
          fieldMappingCount: sourceFieldMappings.length
        },
        tableCounts: tables,
        publishedBy: "scripts/publish-ecommerce-canonical-snapshots.mjs"
      }
    }
  });
}

async function upsertDataSource(input) {
  const existing = await prisma.dataSourceConnection.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: DataSourceType.EXCEL,
      contentHash: input.contentHash,
      isActive: true
    },
    orderBy: { createdAt: "desc" }
  });
  const data = {
    status: ConnectionStatus.CONNECTED,
    provider: "Excel",
    connectionMode: "Upload",
    authMethod: "File",
    contentHash: input.contentHash,
    sourceFingerprint: input.sourceFingerprint,
    config: {
      fileName: input.fileName,
      fileSize: input.fileBuffer.length,
      extension: input.fileName.split(".").pop()?.toLowerCase() ?? "xlsx",
      contentHash: input.contentHash,
      sourceFingerprint: input.sourceFingerprint,
      businessSource: input.input.businessSource,
      sourceProvider: input.input.provider,
      reportRole: input.input.role
    },
    connectedAt: new Date(),
    lastSyncAt: new Date()
  };

  if (existing) {
    return prisma.dataSourceConnection.update({
      where: { id: existing.id },
      data: {
        ...data,
        name: `Excel - ${input.fileName}`,
        isActive: true
      }
    });
  }

  return prisma.dataSourceConnection.create({
    data: {
      workspaceId: input.workspaceId,
      type: DataSourceType.EXCEL,
      name: `Excel - ${input.fileName}`,
      isActive: true,
      schemas: {
        scannedAt: new Date().toISOString(),
        fileName: input.fileName,
        fileSize: input.fileBuffer.length,
        sourceProvider: input.input.provider,
        sourcePlatforms: [input.input.provider],
        tables: []
      },
      ...data
    }
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}
