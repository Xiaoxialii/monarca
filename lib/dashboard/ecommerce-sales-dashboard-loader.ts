import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { readR2ObjectText } from "@/lib/r2-storage";
import type { CanonicalDataset } from "@/lib/semantic/types";
import {
  ECOMMERCE_CANONICAL_SCHEMA_VERSION,
  ensureEcommerceCanonicalSnapshotFromDataSourceSchemas,
  isEcommerceCanonicalSchemaJson
} from "@/lib/snapshot/canonical-snapshot-generator";
import {
  adaptCanonicalDatasetForMetrics,
  buildEcommerceSalesDashboardData,
  emptyEcommerceCanonicalDataset,
  type EcommerceDashboardDecisionMode,
  type EcommerceSalesDashboardData
} from "@/lib/dashboard/ecommerce-sales-dashboard-data";

export type LoadDashboardResult = {
  data: EcommerceSalesDashboardData;
  state: "ready" | "empty" | "unavailable";
  message?: string;
  lineage?: {
    schemaSnapshotId: string;
    dataSourceId: string | null;
    manifestKey?: string;
    syncRunId?: string;
    checksum?: unknown;
  };
};

const TABLE_NAMES = [
  "ecommerce_orders",
  "ecommerce_order_items",
  "ecommerce_products",
  "ecommerce_customers",
  "ecommerce_refunds",
  "ecommerce_ads",
  "ecommerce_inventory"
] as const;

export async function loadEcommerceSalesDashboardData(input: {
  workspaceId: string;
  dataSourceId?: string | null;
  decisionMode?: EcommerceDashboardDecisionMode;
}): Promise<LoadDashboardResult> {
  let snapshots: Awaited<ReturnType<typeof findLatestEcommerceCanonicalSnapshots>>;

  try {
    snapshots = await findLatestEcommerceCanonicalSnapshots(input);
  } catch (error) {
    const localDataset = loadLatestLocalCanonicalArtifactDataset(input.workspaceId);

    if (localDataset) {
      return buildLocalArtifactDashboardResult(
        localDataset,
        input.dataSourceId ?? null,
        error instanceof Error ? `Loaded local canonical artifacts after database snapshot lookup failed: ${error.message}` : undefined,
        input.decisionMode
      );
    }

    throw error;
  }

  if (!snapshots.length) {
    await ensureEcommerceCanonicalSnapshotFromDataSourceSchemas({
      prisma,
      workspaceId: input.workspaceId,
      dataSourceId: input.dataSourceId ?? null
    });
    snapshots = await findLatestEcommerceCanonicalSnapshots(input);
  }

  if (!snapshots.length) {
    const localDataset = loadLatestLocalCanonicalArtifactDataset(input.workspaceId);

    if (localDataset) {
      return buildLocalArtifactDashboardResult(
        localDataset,
        input.dataSourceId ?? null,
        "Loaded local canonical artifacts because no ecommerce canonical snapshot was found.",
        input.decisionMode
      );
    }

    const spreadsheetDataset = await loadConnectedSpreadsheetCanonicalDataset(input);

    return {
      data: buildEcommerceSalesDashboardData(spreadsheetDataset ?? emptyEcommerceCanonicalDataset(), { decisionMode: input.decisionMode }),
      state: spreadsheetDataset ? "ready" : "empty",
      message: spreadsheetDataset ? undefined : "No ecommerce canonical snapshot is available yet."
    };
  }

  const artifactDatasets: CanonicalDataset[] = [];

  for (const snapshot of snapshots) {
    const schemaJson = objectValue(snapshot.schemaJson);
    try {
      artifactDatasets.push(await readCanonicalDatasetFromSnapshot(schemaJson));
    } catch (error) {
      const localDataset = loadLatestLocalCanonicalArtifactDataset(input.workspaceId);

      if (localDataset) {
        return buildLocalArtifactDashboardResult(
          localDataset,
          snapshot.dataSourceId,
          error instanceof Error ? `Loaded local canonical artifacts after canonical artifact read failed: ${error.message}` : undefined,
          input.decisionMode
        );
      }

      return {
        data: buildEcommerceSalesDashboardData(emptyEcommerceCanonicalDataset(sourcePlatforms(schemaJson)), { decisionMode: input.decisionMode }),
        state: "unavailable",
        message: error instanceof Error ? error.message : "Canonical ecommerce artifacts are unavailable.",
        lineage: lineage(snapshot.id, snapshot.dataSourceId, schemaJson)
      };
    }
  }

  const dataset = artifactDatasets.reduce((merged, current) => mergeCanonicalDatasets(merged, current));
  const adapted = adaptCanonicalDatasetForMetrics(dataset);
  const hasRows = Object.values(adapted.tables).some((rows) => rows.length > 0);
  if (!hasRows) {
    const localDataset = loadLatestLocalCanonicalArtifactDataset(input.workspaceId);

    if (localDataset) {
      return buildLocalArtifactDashboardResult(
        localDataset,
        snapshots[0].dataSourceId,
        "Loaded local canonical artifacts because ecommerce canonical tables were empty.",
        input.decisionMode
      );
    }
  }

  const data = buildEcommerceSalesDashboardData(adapted, { decisionMode: input.decisionMode });

  return {
    data,
    state: hasRows ? "ready" : "empty",
    message: hasRows ? undefined : "Ecommerce canonical tables are empty.",
    lineage: lineage(snapshots[0].id, snapshots[0].dataSourceId, objectValue(snapshots[0].schemaJson))
  };
}

export function loadLatestLocalEcommerceSalesDashboardData(
  workspaceId?: string | null,
  decisionMode?: EcommerceDashboardDecisionMode
): LoadDashboardResult | null {
  const localDataset = loadLatestLocalCanonicalArtifactDataset(workspaceId ?? null);
  if (!localDataset) return null;

  return buildLocalArtifactDashboardResult(localDataset, null, "Loaded local canonical artifacts.", decisionMode);
}

function buildLocalArtifactDashboardResult(
  dataset: CanonicalDataset,
  dataSourceId: string | null,
  message?: string,
  decisionMode?: EcommerceDashboardDecisionMode
): LoadDashboardResult {
  return {
    data: buildEcommerceSalesDashboardData(adaptCanonicalDatasetForMetrics(dataset), { decisionMode }),
    state: "ready",
    message,
    lineage: {
      schemaSnapshotId: "local-canonical-artifact",
      dataSourceId
    }
  };
}

function loadLatestLocalCanonicalArtifactDataset(workspaceId: string | null): CanonicalDataset | null {
  if (!localArtifactStoreEnabled()) {
    return null;
  }

  const canonicalRoot = path.resolve(
    process.env.MONARCA_LOCAL_ARTIFACT_DIR || path.join(process.cwd(), ".monarca-artifacts"),
    "canonical"
  );

  const workspaceRoot = workspaceId ? path.join(canonicalRoot, workspaceId) : canonicalRoot;
  const root = fs.existsSync(workspaceRoot) ? workspaceRoot : canonicalRoot;

  if (!fs.existsSync(root)) return null;

  const candidates: string[] = [];
  const walk = (directory: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const hasCanonicalTable = TABLE_NAMES.some((tableName) => fs.existsSync(path.join(directory, `${tableName}.jsonl`)));

    if (hasCanonicalTable) {
      candidates.push(directory);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(directory, entry.name));
    }
  };

  walk(root);
  const latestDirectory = candidates
    .map((directory) => ({
      directory,
      mtime: fs.statSync(directory).mtimeMs
    }))
    .sort((left, right) => right.mtime - left.mtime)[0]?.directory;

  if (!latestDirectory) return null;

  const tables: CanonicalDataset["tables"] = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_ads: [],
    ecommerce_inventory: []
  };

  for (const tableName of TABLE_NAMES) {
    const filePath = path.join(latestDirectory, `${tableName}.jsonl`);
    if (!fs.existsSync(filePath)) continue;
    tables[tableName] = parseJsonl(fs.readFileSync(filePath, "utf8"));
  }

  const acceptedRows = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
  if (!acceptedRows) return null;

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: ["local_canonical_artifact"],
      normalized_at: new Date(fs.statSync(latestDirectory).mtimeMs).toISOString(),
      unknown_fields: [],
      validation: {
        accepted_rows: acceptedRows,
        rejected_rows: 0,
        warnings: [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: 0.86
    }
  };
}

function localArtifactStoreEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_LOCAL_ARTIFACT_STORE === "true";
}

async function readCanonicalDatasetFromSnapshot(schemaJson: Record<string, unknown>): Promise<CanonicalDataset> {
  const tableArtifacts = Array.isArray(schemaJson.tables) ? schemaJson.tables : [];
  const tables: CanonicalDataset["tables"] = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_ads: [],
    ecommerce_inventory: []
  };

  for (const tableName of TABLE_NAMES) {
    const table = tableArtifacts.find((item) => objectValue(item).name === tableName);
    const artifactKey = typeof objectValue(table).artifactKey === "string" ? objectValue(table).artifactKey as string : null;
    if (!artifactKey) continue;

    tables[tableName] = parseJsonl(await readR2ObjectText(artifactKey));
  }

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: sourcePlatforms(schemaJson),
      normalized_at: typeof schemaJson.syncFinishedAt === "string"
        ? schemaJson.syncFinishedAt
        : typeof schemaJson.syncRunId === "string"
          ? String(schemaJson.syncRunId)
          : "1970-01-01T00:00:00.000Z",
      unknown_fields: [],
      validation: {
        accepted_rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: 0,
        warnings: Array.isArray(schemaJson.missingFields)
          ? schemaJson.missingFields.map((field) => ({ table: "ecommerce", field: String(field), reason: "upstream_missing_field" }))
          : [],
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: 0
      },
      mapping_confidence: Number(schemaJson.confidenceScore ?? 0)
    }
  };
}

export async function loadConnectedSpreadsheetCanonicalDataset(input: {
  workspaceId: string;
  dataSourceId?: string | null;
}): Promise<CanonicalDataset | null> {
  const sources = await prisma.dataSourceConnection.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      status: "CONNECTED",
      type: { in: ["EXCEL", "CSV"] },
      ...(input.dataSourceId ? { id: input.dataSourceId } : {})
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      provider: true,
      config: true,
      schemas: true
    }
  });

  const tables: CanonicalDataset["tables"] = {
    ecommerce_orders: [],
    ecommerce_order_items: [],
    ecommerce_products: [],
    ecommerce_customers: [],
    ecommerce_refunds: [],
    ecommerce_ads: [],
    ecommerce_inventory: []
  };
  const sourcePlatforms = new Set<string>();
  const warnings: CanonicalDataset["metadata"]["validation"]["warnings"] = [];

  for (const source of sources) {
    const workbookRows = readSpreadsheetRows(source);
    for (const sheet of workbookRows) {
      const sourceKind = sourceKindFromName(`${source.name} ${sheet.name}`);
      sourcePlatforms.add(sourceKind);

      sheet.rows.forEach((row, index) => {
        const normalized = normalizeRowKeys(row);
        const canonicalId = `${source.id}:${sheet.name}:${index + 1}`;
        const sku = stringField(normalized, "sku");
        const productName = stringField(normalized, "product_name", "product");
        const productId = stringField(normalized, "product_id") || sku || `${canonicalId}:product`;
        const quantity = numberField(normalized, "quantity", "qty") ?? 1;
        const price = numberField(normalized, "price", "unit_price");
        const revenue = numberField(normalized, "revenue", "net_sales", "total_paid", "gross_sales", "sales");
        const date = dateField(normalized, "order_date", "date", "month");
        const adSpend = numberField(normalized, "ad_spend", "spend");
        const roles = detectSchemaRoles(normalized, sourceKind);

        if (roles.isInventory && sku) {
          (tables.ecommerce_inventory ??= []).push({
            platform: sourceKind,
            source_id: canonicalId,
            sku,
            warehouse_id: stringField(normalized, "warehouse_id", "warehouse") || "default",
            stock_level: numberField(normalized, "stock_level", "on_hand", "inventory_quantity", "available_stock", "available") ?? 0,
            available_stock: numberField(normalized, "available_stock", "available", "stock_level", "on_hand", "inventory_quantity") ?? 0,
            reserved_stock: numberField(normalized, "reserved_stock", "reserved") ?? 0,
            reorder_point: numberField(normalized, "reorder_point") ?? undefined,
            fulfillment_days: numberField(normalized, "fulfillment_days", "fulfillment_time", "fulfillment_time_days") ?? undefined,
            date: date || new Date().toISOString().slice(0, 10),
            canonical_key: `${sourceKind}:inventory:${sku}:${stringField(normalized, "warehouse_id", "warehouse") || "default"}`
          });
        }

        if (roles.isAd && adSpend !== null) {
          const campaignId = stringField(normalized, "campaign_id", "campaign") || `${sourceKind}:campaign`;
          const adId = stringField(normalized, "ad_id") || canonicalId;
          if (adSpend !== null) {
            (tables.ecommerce_ads ??= []).push({
              platform: sourceKind,
              source_id: canonicalId,
              campaign_id: campaignId,
              ad_id: adId,
              spend: adSpend,
              impressions: numberField(normalized, "impressions") ?? 0,
              clicks: numberField(normalized, "clicks") ?? 0,
              conversions: numberField(normalized, "conversions") ?? 0,
              attribution_revenue: revenue ?? 0,
              date: date || "1970-01-01",
              canonical_key: `${sourceKind}:ads:${canonicalId}`
            });
          }
        }

        if (roles.isProduct || sku || productName) {
          tables.ecommerce_products.push({
            platform: sourceKind,
            source_id: canonicalId,
            product_id: productId,
            product_name: productName || productId,
            sku: sku || productId,
            price: price ?? revenue ?? 0,
            canonical_key: `${sourceKind}:product:${productId}:${sku || ""}`
          });
        }

        if (roles.isOrder && revenue !== null) {
          const orderId = stringField(normalized, "order_id") || canonicalId;
          const customerId = stringField(normalized, "customer_id");
          tables.ecommerce_orders.push({
            platform: sourceKind,
            source_id: canonicalId,
            order_id: orderId,
            revenue,
            order_date: date || "1970-01-01",
            currency: stringField(normalized, "currency") || "USD",
            customer_id: customerId || undefined,
            ad_id: stringField(normalized, "ad_id") || undefined,
            campaign_id: stringField(normalized, "campaign_id", "campaign") || undefined,
            cogs: numberField(normalized, "cogs", "cost", "unit_cost", "cost_price"),
            shipping_cost: numberField(normalized, "shipping_cost", "shipping_expense"),
            platform_fee: numberField(normalized, "platform_fee", "marketplace_fee", "selling_fee"),
            payment_fee: numberField(normalized, "payment_fee", "processing_fee", "transaction_fee"),
            fulfillment_cost: numberField(normalized, "fulfillment_cost", "pick_pack_cost", "handling_cost"),
            status: stringField(normalized, "status", "order_status") || "unknown",
            canonical_key: `${sourceKind}:order:${orderId}`
          });
          if (roles.isCustomer && customerId) {
            tables.ecommerce_customers.push({
              platform: sourceKind,
              source_id: canonicalId,
              customer_id: customerId,
              total_spent: revenue,
              customer_created_at: date || undefined,
              country: stringField(normalized, "country"),
              canonical_key: `${sourceKind}:customer:${customerId}`
            });
          }
          if (sku || productName) {
            tables.ecommerce_order_items.push({
              platform: sourceKind,
              source_id: canonicalId,
              order_id: orderId,
              product_id: productId,
              sku: sku || productId,
              quantity,
              price: price ?? (quantity ? revenue / quantity : revenue),
              ad_id: stringField(normalized, "ad_id") || undefined,
              campaign_id: stringField(normalized, "campaign_id", "campaign") || undefined,
              cogs: numberField(normalized, "cogs", "cost", "unit_cost", "cost_price"),
              canonical_key: `${sourceKind}:item:${orderId}:${sku || productId}`
            });
          }
        }

        const refundAmount = numberField(normalized, "refund_amount", "amount_refunded");
        if (refundAmount !== null) {
          const orderId = stringField(normalized, "order_id") || canonicalId;
          tables.ecommerce_refunds.push({
            platform: sourceKind,
            source_id: canonicalId,
            refund_id: stringField(normalized, "refund_id") || `${canonicalId}:refund`,
            order_id: orderId,
            amount: refundAmount,
            reason: stringField(normalized, "refund_reason", "reason"),
            canonical_key: `${sourceKind}:refund:${orderId}:${index + 1}`
          });
        }
      });
    }
  }

  const dedupedTables = {
    ecommerce_orders: dedupeRows(tables.ecommerce_orders, "canonical_key"),
    ecommerce_order_items: dedupeRows(tables.ecommerce_order_items, "canonical_key"),
    ecommerce_products: dedupeRows(tables.ecommerce_products, "canonical_key"),
    ecommerce_customers: dedupeRows(tables.ecommerce_customers, "canonical_key"),
    ecommerce_refunds: dedupeRows(tables.ecommerce_refunds, "canonical_key"),
    ecommerce_ads: dedupeRows(tables.ecommerce_ads ?? [], "canonical_key"),
    ecommerce_inventory: dedupeRows(tables.ecommerce_inventory ?? [], "canonical_key")
  };
  const acceptedRows = Object.values(dedupedTables).reduce((sum, rows) => sum + rows.length, 0);

  if (!acceptedRows) return null;

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables: dedupedTables,
    metadata: {
      source_platforms: Array.from(sourcePlatforms).sort(),
      normalized_at: new Date().toISOString(),
      unknown_fields: [],
      validation: {
        accepted_rows: acceptedRows,
        rejected_rows: 0,
        warnings,
        rejected: []
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: Object.values(tables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0) - acceptedRows
      },
      mapping_confidence: 0.86
    }
  };
}

async function findLatestEcommerceCanonicalSnapshots(input: {
  workspaceId: string;
  dataSourceId?: string | null;
}) {
  const dataSourceFilter = input.dataSourceId ? `and "dataSourceId" = $2` : "";
  const snapshots = await prisma.$queryRawUnsafe<Array<{
    id: string;
    dataSourceId: string | null;
    schemaJson: unknown;
  }>>(
    `
      select
        id,
        "dataSourceId",
        jsonb_build_object(
          'schemaVersion', "schemaJson"->>'schemaVersion',
          'schema_version', "schemaJson"->>'schema_version',
          'tables', "schemaJson"->'tables',
          'sourceProvider', "schemaJson"->>'sourceProvider',
          'sourcePlatforms', "schemaJson"->'sourcePlatforms',
          'source_platforms', "schemaJson"->'source_platforms',
          'syncFinishedAt', "schemaJson"->>'syncFinishedAt',
          'syncRunId', "schemaJson"->>'syncRunId',
          'manifestKey', "schemaJson"->>'manifestKey',
          'checksum', "schemaJson"->'checksum',
          'missingFields', "schemaJson"->'missingFields',
          'confidenceScore', "schemaJson"->'confidenceScore'
        ) as "schemaJson"
      from "SchemaSnapshot"
      where "workspaceId" = $1
        ${dataSourceFilter}
        and (
          "schemaJson"->>'schemaVersion' = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
          or "schemaJson"->>'schema_version' = '${ECOMMERCE_CANONICAL_SCHEMA_VERSION}'
        )
      order by "createdAt" desc
      limit 80
    `,
    ...(input.dataSourceId ? [input.workspaceId, input.dataSourceId] : [input.workspaceId])
  );

  const latestBySource = new Map<string, typeof snapshots[number]>();

  for (const snapshot of snapshots) {
    if (!isEcommerceCanonicalSchemaJson(snapshot.schemaJson)) continue;

    const sourceKey = snapshot.dataSourceId ?? snapshot.id;
    if (!latestBySource.has(sourceKey)) {
      latestBySource.set(sourceKey, snapshot);
    }
  }

  return Array.from(latestBySource.values());
}

function parseJsonl(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readSpreadsheetRows(source: {
  id: string;
  name: string;
  type: string;
  config: unknown;
}): Array<{ name: string; rows: Array<Record<string, unknown>> }> {
  const config = objectValue(source.config);
  const storage = objectValue(config.storage);
  const candidates = [
    typeof storage.path === "string" ? storage.path : null,
    typeof config.storedFilePath === "string" ? config.storedFilePath : null,
    typeof config.filePath === "string" ? config.filePath : null
  ].filter(Boolean) as string[];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  const inlineFileBase64 = typeof config.inlineFileBase64 === "string" ? config.inlineFileBase64 : null;
  const buffer = filePath
    ? fs.readFileSync(filePath)
    : inlineFileBase64
      ? Buffer.from(inlineFileBase64, "base64")
      : null;

  if (!buffer) return [];

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false
  });

  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      defval: null,
      raw: false
    }) as Array<Record<string, unknown>>
  }));
}

function sourceKindFromName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("meta") || normalized.includes("ads")) return "meta_ads";
  if (normalized.includes("amazon")) return "amazon";
  if (normalized.includes("shopify")) return "shopify";
  if (normalized.includes("inventory")) return "inventory";
  return "excel";
}

function normalizeRowKeys(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
      value
    ])
  );
}

function stringField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }

  return null;
}

function numberField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") continue;
    const normalized = value.replace(/[$,%\s,]/g, "");
    if (!normalized) continue;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function dateField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value !== "string" && typeof value !== "number") continue;

    const text = String(value).trim();
    if (!text) continue;
    if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function detectSchemaRoles(row: Record<string, unknown>, sourceKind: string) {
  const isOrder = hasOrderFields(row, sourceKind);
  const isAd = hasAdFields(row);

  return {
    isOrder,
    isAd,
    isInventory: hasInventoryFields(row),
    isCustomer: hasCustomerFields(row),
    isCost: hasCostFields(row),
    isProduct: hasProductFields(row)
  };
}

function hasOrderFields(row: Record<string, unknown>, sourceKind: string) {
  if (sourceKind === "meta_ads" && !stringField(row, "order_id")) return false;

  return Boolean(
    stringField(row, "order_id") ||
      (
        numberField(row, "revenue", "net_sales", "total_paid", "gross_sales", "sales") !== null &&
        (
          stringField(row, "sku", "product_id", "product_name") ||
          numberField(row, "quantity", "qty") !== null
        )
      )
  );
}

function hasAdFields(row: Record<string, unknown>) {
  return Boolean(
    stringField(row, "campaign_id", "ad_id", "adset_id") &&
      numberField(row, "spend", "ad_spend", "impressions", "clicks") !== null
  );
}

function hasInventoryFields(row: Record<string, unknown>) {
  return Boolean(
    stringField(row, "warehouse_id") ||
      numberField(row, "stock_level", "reserved_stock", "reorder_point", "fulfillment_days") !== null
  );
}

function hasCustomerFields(row: Record<string, unknown>) {
  return Boolean(stringField(row, "customer_id", "email_hash"));
}

function hasCostFields(row: Record<string, unknown>) {
  return Boolean(
    numberField(
      row,
      "cogs",
      "cost",
      "unit_cost",
      "cost_price",
      "shipping_cost",
      "platform_fee",
      "payment_fee",
      "fulfillment_cost"
    ) !== null
  );
}

function hasProductFields(row: Record<string, unknown>) {
  return Boolean(stringField(row, "sku", "product_id", "product_name", "product"));
}

function dedupeRows<T extends Record<string, unknown>>(rows: T[], key: string) {
  const deduped = new Map<string, T>();
  rows.forEach((row, index) => {
    const value = stringField(row, key) || `${index}`;
    deduped.set(value, row);
  });

  return Array.from(deduped.values());
}

function mergeCanonicalDatasets(left: CanonicalDataset, right: CanonicalDataset): CanonicalDataset {
  const tables = {
    ecommerce_orders: dedupeRows([...left.tables.ecommerce_orders, ...right.tables.ecommerce_orders], "canonical_key"),
    ecommerce_order_items: dedupeRows([...left.tables.ecommerce_order_items, ...right.tables.ecommerce_order_items], "canonical_key"),
    ecommerce_products: dedupeRows([...left.tables.ecommerce_products, ...right.tables.ecommerce_products], "canonical_key"),
    ecommerce_customers: dedupeRows([...left.tables.ecommerce_customers, ...right.tables.ecommerce_customers], "canonical_key"),
    ecommerce_refunds: dedupeRows([...left.tables.ecommerce_refunds, ...right.tables.ecommerce_refunds], "canonical_key"),
    ecommerce_ads: dedupeRows([...(left.tables.ecommerce_ads ?? []), ...(right.tables.ecommerce_ads ?? [])], "canonical_key"),
    ecommerce_inventory: dedupeRows([...(left.tables.ecommerce_inventory ?? []), ...(right.tables.ecommerce_inventory ?? [])], "canonical_key")
  };
  const leftValidation = left.metadata.validation;
  const rightValidation = right.metadata.validation;

  return {
    schema_version: ECOMMERCE_CANONICAL_SCHEMA_VERSION,
    tables,
    metadata: {
      source_platforms: Array.from(new Set([
        ...left.metadata.source_platforms,
        ...right.metadata.source_platforms
      ])).sort(),
      normalized_at: new Date().toISOString(),
      unknown_fields: [...left.metadata.unknown_fields, ...right.metadata.unknown_fields],
      validation: {
        accepted_rows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
        rejected_rows: leftValidation.rejected_rows + rightValidation.rejected_rows,
        warnings: [...leftValidation.warnings, ...rightValidation.warnings],
        rejected: [...leftValidation.rejected, ...rightValidation.rejected]
      },
      dedupe: {
        canonical_key_strategy: "hash(platform + source_id + order_id)",
        duplicate_count: left.metadata.dedupe.duplicate_count + right.metadata.dedupe.duplicate_count
      },
      mapping_confidence: Math.max(left.metadata.mapping_confidence, right.metadata.mapping_confidence)
    }
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourcePlatforms(schemaJson: Record<string, unknown>) {
  const provider = typeof schemaJson.sourceProvider === "string" ? schemaJson.sourceProvider : null;

  return provider ? [provider] : [];
}

function lineage(schemaSnapshotId: string, dataSourceId: string | null, schemaJson: Record<string, unknown>) {
  return {
    schemaSnapshotId,
    dataSourceId,
    manifestKey: typeof schemaJson.manifestKey === "string" ? schemaJson.manifestKey : undefined,
    syncRunId: typeof schemaJson.syncRunId === "string" ? schemaJson.syncRunId : undefined,
    checksum: schemaJson.checksum
  };
}
