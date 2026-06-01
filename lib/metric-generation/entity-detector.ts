import type { BusinessEntity, MetricGenerationInput, MetricInputTable } from "@/lib/metric-generation/metric-types";
import { normalizeMetricToken } from "@/lib/metric-generation/metric-safety-rules";

const entitySignals: Record<string, string[]> = {
  user: ["user_id", "customer_id", "client_id", "account_id", "device_id"],
  order: ["order_id", "transaction_id", "invoice_id"],
  product: ["product_id", "sku", "item", "product_name"],
  app: ["app", "app_id", "package_name"],
  campaign: ["campaign_id", "campaign_name", "ad_group"],
  stock_price: ["open", "high", "low", "close", "volume"],
  review: ["review", "rating", "sentiment"],
  subscription: ["subscription_id", "plan", "mrr", "renewal"],
  ticket: ["ticket", "issue", "resolution", "agent"]
};

function detectTableEntities(table: MetricInputTable): BusinessEntity[] {
  const normalizedColumns = table.columns.map((column) => normalizeMetricToken(column.name));

  return Object.entries(entitySignals).flatMap(([entity, signals]) => {
    const evidence = signals.filter((signal) => {
      const normalizedSignal = normalizeMetricToken(signal);
      return normalizedColumns.some((column) => column === normalizedSignal || column.includes(normalizedSignal));
    });

    if (evidence.length === 0) {
      return [];
    }

    return [{
      entity,
      tableName: table.tableName,
      confidence: Math.min(0.95, Math.round((0.45 + evidence.length * 0.14) * 100) / 100),
      evidence: evidence.map((signal) => `Matched ${signal}`)
    }];
  });
}

export function detectBusinessEntities(input: MetricGenerationInput): BusinessEntity[] {
  return input.tables.flatMap(detectTableEntities);
}
