import { Prisma, type PrismaClient } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";
import { buildEcommerceSalesDashboardData, adaptCanonicalDatasetForMetrics } from "@/lib/dashboard/ecommerce-sales-dashboard-data";
import type { CanonicalDataset } from "@/lib/semantic/types";

export const ECOMMERCE_CANONICAL_SCHEMA_VERSION = "ecommerce_canonical_v1" as const;

export const ECOMMERCE_CANONICAL_TABLES = [
  "ecommerce_orders",
  "ecommerce_order_items",
  "ecommerce_products",
  "ecommerce_customers",
  "ecommerce_refunds",
  "ecommerce_ads",
  "ecommerce_inventory"
] as const;

export type CanonicalSnapshotArtifact = {
  artifactKey: string;
  checksum: string;
  rowCount: number;
  columns?: Array<{ name: string; type?: string }>;
};

export type CanonicalSnapshotManifest = {
  manifestKey?: string | null;
  syncRunId?: string | null;
  checksum?: Record<string, string> | null;
  sourceProvider?: string | null;
  businessType?: string | null;
  latestBusinessDate?: string | null;
  dataMode?: string | null;
  confidenceScore?: number | null;
  missingFields?: string[];
  estimationUsed?: boolean;
  syncStartedAt?: string | null;
  syncFinishedAt?: string | null;
  analytics?: unknown;
  semanticLearning?: unknown;
  guardrailReport?: unknown;
};

export function buildCanonicalSnapshotJson(input: {
  manifest: CanonicalSnapshotManifest;
  artifacts: Record<string, CanonicalSnapshotArtifact>;
  canonicalDataset?: CanonicalDataset;
}) {
  const sourceProvider = input.manifest.sourceProvider ?? "canonical";
  const adaptedDataset = input.canonicalDataset ? adaptCanonicalDatasetForMetrics(input.canonicalDataset) : null;
  const dashboard = adaptedDataset ? buildEcommerceSalesDashboardData(adaptedDataset) : null;

  return {
    businessType: input.manifest.businessType ?? "ecommerce",
    sourceProvider,
    schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    status: "ready",
    generatedAt: new Date().toISOString(),
    manifestKey: input.manifest.manifestKey ?? null,
    syncRunId: input.manifest.syncRunId ?? null,
    checksum: input.manifest.checksum ?? checksumByArtifact(input.artifacts),
    latestBusinessDate: input.manifest.latestBusinessDate ?? null,
    dataMode: input.manifest.dataMode ?? null,
    confidenceScore: input.manifest.confidenceScore ?? dashboard?.quality.confidence_score ?? 0,
    missingFields: input.manifest.missingFields ?? dashboard?.quality.missing_fields ?? [],
    estimationUsed: input.manifest.estimationUsed ?? Boolean(dashboard?.quality.estimated_metrics.length),
    field_mappings: input.canonicalDataset?.metadata.field_mappings ?? [],
    syncStartedAt: input.manifest.syncStartedAt ?? null,
    syncFinishedAt: input.manifest.syncFinishedAt ?? null,
    metrics: dashboard?.metrics ?? null,
    quality: dashboard?.quality ?? null,
    dashboardSnapshot: dashboard,
    canonicalDataset: input.canonicalDataset ?? null,
    analytics: input.manifest.analytics ?? null,
    semanticLearning: input.manifest.semanticLearning ?? null,
    guardrailReport: input.manifest.guardrailReport ?? null,
    tables: ECOMMERCE_CANONICAL_TABLES
      .filter((name) => input.artifacts[name])
      .map((name) => ({
      name,
      rowCount: input.artifacts[name]?.rowCount ?? 0,
      artifactKey: input.artifacts[name]?.artifactKey ?? null,
      checksum: input.artifacts[name]?.checksum ?? null,
      columns: input.artifacts[name]?.columns ?? canonicalColumns(name)
    }))
  };
}

export async function storeCanonicalSchemaSnapshot(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  workspaceId: string;
  dataSourceId: string;
  status?: ConnectionStatus;
  schemaJson: ReturnType<typeof buildCanonicalSnapshotJson>;
  qualityReport?: Prisma.InputJsonValue;
}) {
  const nextVersion = (await input.prisma.schemaSnapshot.aggregate({
    where: { workspaceId: input.workspaceId },
    _max: { version: true }
  }))._max.version ?? 0;

  return input.prisma.schemaSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId,
      version: nextVersion + 1,
      status: input.status ?? ConnectionStatus.CONNECTED,
      schemaJson: input.schemaJson as Prisma.InputJsonValue,
      qualityReport: input.qualityReport ?? Prisma.JsonNull
    }
  });
}

export async function ensureEcommerceCanonicalSnapshotFromDataSourceSchemas(input: {
  prisma: PrismaClient;
  workspaceId: string;
  dataSourceId?: string | null;
}) {
  const dataSource = await input.prisma.dataSourceConnection.findFirst({
    where: {
      workspaceId: input.workspaceId,
      ...(input.dataSourceId ? { id: input.dataSourceId } : {}),
      isActive: true,
      status: ConnectionStatus.CONNECTED
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      schemas: true,
      config: true
    }
  });

  if (!dataSource) return null;

  const schemas = objectValue(dataSource.schemas);
  if (!isEcommerceCanonicalSchemaJson(schemas)) return null;

  const existing = await input.prisma.schemaSnapshot.findFirst({
    where: {
      workspaceId: input.workspaceId,
      dataSourceId: dataSource.id
    },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });

  if (existing) return null;

  return storeCanonicalSchemaSnapshot({
    prisma: input.prisma,
    workspaceId: input.workspaceId,
    dataSourceId: dataSource.id,
    status: ConnectionStatus.CONNECTED,
    schemaJson: {
      ...schemas,
      schemaVersion: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
      schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
      generatedAt: typeof schemas.generatedAt === "string" ? schemas.generatedAt : new Date().toISOString()
    } as ReturnType<typeof buildCanonicalSnapshotJson>,
    qualityReport: {
      ...(objectValue(dataSource.config).guardrailReport ? { guardrailReport: objectValue(dataSource.config).guardrailReport } : {}),
      manifestKey: typeof schemas.manifestKey === "string" ? schemas.manifestKey : null,
      syncRunId: typeof schemas.syncRunId === "string" ? schemas.syncRunId : null,
      generatedFrom: "DataSourceConnection.schemas"
    } as Prisma.InputJsonValue
  });
}

export function isEcommerceCanonicalSchemaJson(value: unknown) {
  const object = objectValue(value);
  return object.schemaVersion === ECOMMERCE_CANONICAL_SCHEMA_VERSION ||
    object.schema_version === ECOMMERCE_CANONICAL_SCHEMA_VERSION;
}

function checksumByArtifact(artifacts: Record<string, CanonicalSnapshotArtifact>) {
  return Object.fromEntries(Object.entries(artifacts).map(([table, artifact]) => [table, artifact.checksum]));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canonicalColumns(tableName: string) {
  const shared = ["workspace_id", "data_source_id", "source_provider", "source_account_id", "schema_version", "sync_run_id", "source_record_id", "raw_payload_hash", "normalized_at"];
  const tableFields: Record<string, string[]> = {
    ecommerce_orders: ["source_order_id", "order_id", "customer_id", "order_date", "order_status", "financial_status", "fulfillment_status", "country", "province", "city", "currency", "gross_sales", "discount_amount", "refund_amount", "net_sales", "tax_amount", "shipping_amount", "total_paid", "is_cancelled", "is_test", "is_paid", "created_at_source", "updated_at_source", "processed_at_source", "cancelled_at_source"],
    ecommerce_order_items: ["source_order_id", "source_line_item_id", "order_id", "order_item_id", "product_id", "variant_id", "sku", "product_name", "quantity", "unit_price", "gross_sales", "discount_amount", "refund_amount", "net_sales", "cogs", "product_cost", "shipping_cost", "fulfillment_cost", "warehouse_cost", "platform_fee", "payment_fee", "currency", "fulfillment_status"],
    ecommerce_products: ["source_product_id", "source_variant_id", "product_id", "variant_id", "sku", "product_name", "product_type", "category", "vendor", "brand", "status", "created_at_source", "updated_at_source"],
    ecommerce_customers: ["source_customer_id", "customer_id", "email_hash", "country", "province", "city", "customer_created_at", "total_orders", "total_spent", "currency"],
    ecommerce_refunds: ["source_refund_id", "source_order_id", "source_line_item_id", "refund_id", "order_id", "order_item_id", "refund_date", "refund_amount", "currency", "refund_reason"],
    ecommerce_ads: ["sku", "campaign_id", "adset_id", "ad_id", "spend", "impressions", "clicks", "conversions", "attribution_revenue", "date"],
    ecommerce_inventory: ["sku", "warehouse_id", "stock_level", "available_stock", "reserved_stock", "reorder_point", "fulfillment_days", "date"]
  };

  return [...shared, ...(tableFields[tableName] ?? [])].map((name) => ({ name, type: "canonical" }));
}
