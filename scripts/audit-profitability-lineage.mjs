import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SAMPLE_SKUS = ["SKU_00479", "SKU_01299", "SKU_01588"];
const workspaceId = process.argv.find((arg) => arg.startsWith("--workspaceId="))?.split("=")[1];

if (!workspaceId) {
  console.error("Usage: node scripts/audit-profitability-lineage.mjs --workspaceId=<workspaceId>");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: ["error"]
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rows(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
}

function numberValue(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numberValue(value, Number.NaN);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stringValue(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstString(...values) {
  for (const value of values) {
    const parsed = stringValue(value);
    if (parsed) return parsed;
  }
  return "";
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sum(values) {
  return round(values.reduce((total, value) => total + value, 0));
}

function canonicalKey(row, index) {
  return firstString(row.canonical_key, row.source_id, row.id, row.order_item_id, row.line_item_id, row.order_id, `row-${index}`);
}

function dedupeByCanonicalKey(inputRows) {
  const map = new Map();
  inputRows.forEach((row, index) => {
    map.set(canonicalKey(row, index), row);
  });
  return [...map.values()];
}

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = accountId ? `https://${accountId}.r2.cloudflarestorage.com` : process.env.R2_ENDPOINT;
  if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) return null;
  return {
    endpoint,
    bucket: process.env.R2_BUCKET_NAME,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  };
}

function localArtifactPath(key) {
  const root = path.resolve(process.env.MONARCA_LOCAL_ARTIFACT_DIR || path.join(process.cwd(), ".monarca-artifacts"));
  const safeKey = key
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join(path.sep);
  return path.resolve(root, safeKey);
}

async function streamToBuffer(stream) {
  if (!stream || typeof stream !== "object" || !("transformToByteArray" in stream)) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return Buffer.from(await stream.transformToByteArray());
}

async function readArtifactText(key) {
  const config = r2Config();
  if (!config) return readFile(localArtifactPath(key), "utf8");
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return (await streamToBuffer(response.Body)).toString("utf8");
}

async function tableRowsFromSchema(schema, tableName) {
  const dataset = asRecord(schema.canonicalDataset ?? schema.canonical_dataset);
  const embeddedTables = asRecord(dataset.tables);
  const embedded = rows(embeddedTables[tableName]);
  if (embedded.length) return embedded;

  const tableArtifacts = rows(schema.tables);
  const table = tableArtifacts.find((item) => asRecord(item).name === tableName);
  const artifactKey = typeof asRecord(table).artifactKey === "string" ? asRecord(table).artifactKey : null;
  if (!artifactKey) return [];
  const text = await readArtifactText(artifactKey);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && shouldKeepLine(tableName, line))
    .map((line) => JSON.parse(line));
}

function shouldKeepLine(tableName, line) {
  if (tableName === "ecommerce_order_items" || tableName === "ecommerce_ads") {
    return SAMPLE_SKUS.some((sku) => line.includes(sku));
  }
  return false;
}

function cogsTrace(row) {
  const quantity = numberValue(row.quantity, 1);
  const revenue = firstNumber(row.revenue, row.net_sales, firstNumber(row.price, row.unit_price) * quantity);
  const price = firstNumber(row.price, row.unit_price, quantity ? revenue / quantity : 0);
  const candidates = [
    ["cost_price", row.cost_price],
    ["product_cost", row.product_cost],
    ["manufacturing_cost", row.manufacturing_cost],
    ["procurement_cost", row.procurement_cost],
    ["unit_cost", row.unit_cost],
    ["total_cogs", row.total_cogs],
    ["line_cogs", row.line_cogs],
    ["line_cost", row.line_cost],
    ["row_cogs", row.row_cogs],
    ["row_cost", row.row_cost],
    ["cogs", row.cogs]
  ];
  const found = candidates.find(([, value]) => Number.isFinite(numberValue(value, Number.NaN)));
  if (!found) {
    const normalized = round((quantity ? revenue / quantity : 0) * 0.45 * quantity);
    return {
      raw_cost_field: null,
      raw_cost_value: null,
      cost_semantic: "estimated",
      normalized_cogs_formula: "estimated unit revenue * 0.45 * quantity",
      normalized_cogs: normalized
    };
  }

  const [field, raw] = found;
  const rawCost = numberValue(raw);
  const totalField = ["total_cogs", "line_cogs", "line_cost", "row_cogs", "row_cost"].includes(field);
  const unitField = ["cost_price", "product_cost", "manufacturing_cost", "procurement_cost", "unit_cost"].includes(field);
  let costSemantic = "total";
  if (unitField) costSemantic = "unit";
  if (field === "cogs") {
    const cogsRevenueRatio = revenue ? rawCost / revenue : 0;
    costSemantic = rawCost < price && cogsRevenueRatio < 0.8 ? "unit" : "total";
  }
  if (totalField) costSemantic = "total";
  return {
    raw_cost_field: field,
    raw_cost_value: rawCost,
    cost_semantic: costSemantic,
    normalized_cogs_formula: costSemantic === "unit" ? `${field} * quantity` : field,
    normalized_cogs: round(costSemantic === "unit" ? rawCost * quantity : rawCost)
  };
}

async function loadLatestCanonicalDatasets() {
  const snapshots = await prisma.$queryRaw`
    select
      snapshot.id,
      snapshot."dataSourceId",
      source.name,
      source.type,
      snapshot."createdAt",
      snapshot."schemaJson"
    from "SchemaSnapshot" snapshot
    left join "DataSourceConnection" source
      on source.id = snapshot."dataSourceId"
      and source."workspaceId" = snapshot."workspaceId"
    where snapshot."workspaceId" = ${workspaceId}
      and snapshot."dataSourceId" is not null
      and source."isActive" = true
      and source."status" = 'CONNECTED'
      and snapshot."canonicalStatus" = 'READY'
      and snapshot."canonicalVersion" = 'ecommerce_canonical_v1'
      and (
        snapshot."schemaJson"->>'schemaVersion' = 'ecommerce_canonical_v1'
        or snapshot."schemaJson"->>'schema_version' = 'ecommerce_canonical_v1'
      )
    order by snapshot."createdAt" desc
    limit 40
  `;

  const latestBySource = new Map();
  for (const snapshot of snapshots) {
    if (!latestBySource.has(snapshot.dataSourceId)) latestBySource.set(snapshot.dataSourceId, snapshot);
  }

  const datasets = [];
  for (const snapshot of latestBySource.values()) {
    const schema = asRecord(snapshot.schemaJson);
    const dataset = asRecord(schema.canonicalDataset ?? schema.canonical_dataset);
    const tables = asRecord(dataset.tables);
    datasets.push({
      snapshotId: snapshot.id,
      dataSourceId: snapshot.dataSourceId,
      dataSourceName: snapshot.name,
      dataSourceType: snapshot.type,
      createdAt: snapshot.createdAt,
      hasEmbeddedDataset: Boolean(Object.keys(tables).length),
      tables: {
        ecommerce_order_items: await tableRowsFromSchema(schema, "ecommerce_order_items"),
        ecommerce_ads: await tableRowsFromSchema(schema, "ecommerce_ads"),
        ecommerce_orders: await tableRowsFromSchema(schema, "ecommerce_orders"),
        ecommerce_products: await tableRowsFromSchema(schema, "ecommerce_products")
      }
    });
  }

  return datasets;
}

async function loadLatestOptimizationRows() {
  const [cache] = await prisma.$queryRaw`
    select "queueRowsJson"
    from "OptimizationReportCache"
    where "workspaceId" = ${workspaceId}
      and mode = 'full'
    order by "updatedAt" desc
    limit 1
  `;
  return rows(cache?.queueRowsJson);
}

function sourceTrace(dataset, sku) {
  const orderItems = dataset.tables.ecommerce_order_items.filter((row) => stringValue(row.sku) === sku);
  const ads = dataset.tables.ecommerce_ads.filter((row) => {
    const directSku = firstString(row.sku, row.product_sku, row.item_sku, row.variant_sku);
    return directSku === sku || JSON.stringify(row).includes(sku);
  });
  const duplicateItemKeys = duplicateKeys(orderItems);
  const duplicateAdKeys = duplicateKeys(ads);
  const itemRows = orderItems.map((row, index) => {
    const quantity = numberValue(row.quantity, 1);
    const revenue = firstNumber(row.revenue, row.net_sales, firstNumber(row.price, row.unit_price) * quantity);
    const cogs = cogsTrace(row);
    return {
      source: dataset.dataSourceName,
      platform: firstString(row.platform, dataset.dataSourceType),
      canonical_key: canonicalKey(row, index),
      order_id: firstString(row.order_id),
      sku: stringValue(row.sku),
      quantity,
      revenue,
      ...cogs,
      shipping_cost: firstNumber(row.shipping_cost, row.shipping_expense, row.shipping_fee, row.carrier_cost, row.postage_cost),
      platform_fee: firstNumber(row.platform_fee, row.marketplace_fee, row.selling_fee, row.commission_fee),
      payment_fee: firstNumber(row.payment_fee, row.processing_fee, row.transaction_fee, row.stripe_fee),
      fulfillment_cost: firstNumber(row.fulfillment_cost, row.handling_cost, row.pick_pack_cost, row.warehouse_cost, row.storage_cost)
    };
  });

  const adRows = ads.map((row, index) => ({
    source: dataset.dataSourceName,
    platform: firstString(row.platform, dataset.dataSourceType),
    canonical_key: canonicalKey(row, index),
    campaign_id: firstString(row.campaign_id, row.utm_campaign),
    ad_id: firstString(row.ad_id, row.id),
    sku: firstString(row.sku, row.product_sku, row.item_sku, row.variant_sku),
    sku_reference_detected: JSON.stringify(row).includes(sku),
    raw_ad_spend: firstNumber(row.spend, row.ad_spend),
    attribution_revenue: firstNumber(row.attribution_revenue, row.purchase_value, row.revenue)
  }));

  return {
    source: dataset.dataSourceName,
    dataSourceId: dataset.dataSourceId,
    itemRows,
    adRows,
    duplicateItemKeys,
    duplicateAdKeys,
    raw: {
      revenue: sum(itemRows.map((row) => row.revenue)),
      quantity: sum(itemRows.map((row) => row.quantity)),
      cogs: sum(itemRows.map((row) => row.normalized_cogs)),
      ads: sum(adRows.map((row) => row.raw_ad_spend)),
      shipping: sum(itemRows.map((row) => row.shipping_cost)),
      platform_fee: sum(itemRows.map((row) => row.platform_fee)),
      payment_fee: sum(itemRows.map((row) => row.payment_fee))
    }
  };
}

function duplicateKeys(inputRows) {
  const counts = new Map();
  inputRows.forEach((row, index) => {
    const key = canonicalKey(row, index);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
}

function deltaPercent(canonical, raw) {
  if (!raw) return canonical ? null : 0;
  return Math.round(((canonical - raw) / raw) * 10000) / 100;
}

async function main() {
  const datasets = await loadLatestCanonicalDatasets();
  const optimizationRows = await loadLatestOptimizationRows();
  const optimizationBySku = new Map(optimizationRows.map((row) => [stringValue(row.sku ?? row.sku_id), row]));

  const output = {
    workspaceId,
    datasets: datasets.map((dataset) => ({
      snapshotId: dataset.snapshotId,
      dataSourceId: dataset.dataSourceId,
      dataSourceName: dataset.dataSourceName,
      dataSourceType: dataset.dataSourceType,
      createdAt: dataset.createdAt,
      hasEmbeddedDataset: dataset.hasEmbeddedDataset,
      counts: Object.fromEntries(Object.entries(dataset.tables).map(([key, value]) => [key, value.length]))
    })),
    skus: {}
  };

  for (const sku of SAMPLE_SKUS) {
    const traces = datasets.map((dataset) => sourceTrace(dataset, sku));
    const mergedItemRows = traces.flatMap((trace) => trace.itemRows);
    const mergedAdRows = traces.flatMap((trace) => trace.adRows);
    const dedupedItems = dedupeByCanonicalKey(mergedItemRows);
    const dedupedAds = dedupeByCanonicalKey(mergedAdRows);
    const rawTotals = {
      revenue: sum(dedupedItems.map((row) => row.revenue)),
      quantity: sum(dedupedItems.map((row) => row.quantity)),
      cogs: sum(dedupedItems.map((row) => row.normalized_cogs)),
      ads: sum(dedupedAds.map((row) => row.raw_ad_spend)),
      shipping: sum(dedupedItems.map((row) => row.shipping_cost)),
      platform_fee: sum(dedupedItems.map((row) => row.platform_fee)),
      payment_fee: sum(dedupedItems.map((row) => row.payment_fee)),
      fulfillment_cost: sum(dedupedItems.map((row) => row.fulfillment_cost))
    };
    const canonical = asRecord(optimizationBySku.get(sku));
    output.skus[sku] = {
      revenueLineage: {
        bySource: traces.map((trace) => ({ source: trace.source, revenue: trace.raw.revenue, quantity: trace.raw.quantity })),
        canonicalRevenue: firstNumber(canonical.revenue),
        rawMergedRevenue: rawTotals.revenue
      },
      cogsLineage: {
        rows: mergedItemRows,
        canonicalCogs: firstNumber(canonical.cogs),
        rawMergedCogs: rawTotals.cogs,
        cogsDeltaPercent: deltaPercent(firstNumber(canonical.cogs), rawTotals.cogs)
      },
      adsLineage: {
        rows: mergedAdRows,
        canonicalAds: firstNumber(canonical.ads_spend, canonical.ad_cost_allocated),
        rawMergedAds: rawTotals.ads,
        adsDeltaPercent: deltaPercent(firstNumber(canonical.ads_spend, canonical.ad_cost_allocated), rawTotals.ads)
      },
      reconciliation: {
        rawTotals,
        canonical: {
          revenue: firstNumber(canonical.revenue),
          cogs: firstNumber(canonical.cogs),
          operatingCost: firstNumber(canonical.operating_cost),
          ads: firstNumber(canonical.ads_spend, canonical.ad_cost_allocated),
          totalCost: firstNumber(canonical.total_cost),
          netProfit: firstNumber(canonical.net_profit),
          margin: firstNumber(canonical.margin),
          optimizationAllowed: canonical.optimization_allowed,
          profitabilityConfidence: firstNumber(canonical.profitability_confidence)
        }
      }
    };
  }

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
