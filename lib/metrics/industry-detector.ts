import type { SchemaTable } from "@/lib/metric-validation";

export type RegistryIndustry = "ecommerce" | "generic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizedColumnSet(tables: SchemaTable[]) {
  return new Set(tables.flatMap((table) => table.columns.map((column) => normalize(column.name))));
}

export function detectRegistryIndustry(tables: SchemaTable[]): {
  industry: RegistryIndustry;
  confidence: number;
  reasons: string[];
} {
  const columns = normalizedColumnSet(tables);
  const ecommerceSignals = [
    "order_id",
    "order_date",
    "customer_id",
    "product_id",
    "category",
    "quantity",
    "unit_price",
    "gross_sales",
    "net_sales",
    "total_paid",
    "discount_amount",
    "is_returned",
    "customer_rating",
    "fulfillment_days",
    "sales_channel",
    "country"
  ];
  const matched = ecommerceSignals.filter((field) => columns.has(field));
  const hasCoreOrderShape = columns.has("order_id") && columns.has("order_date") &&
    (columns.has("net_sales") || columns.has("total_paid") || (columns.has("unit_price") && columns.has("quantity")));

  if (hasCoreOrderShape && matched.length >= 6) {
    return {
      industry: "ecommerce",
      confidence: Math.min(0.98, 0.55 + matched.length * 0.03),
      reasons: [`Matched ecommerce order fields: ${matched.join(", ")}`]
    };
  }

  return {
    industry: "generic",
    confidence: 0.5,
    reasons: ["No strong industry-specific field set was detected."]
  };
}

