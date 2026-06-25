import type { SchemaTable } from "@/lib/metric-validation";

export type RegistryIndustry = "ecommerce" | "logistics_service_kpi" | "generic";

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
  const logisticsSignals = [
    "branch_name",
    "total_score",
    "rating",
    "national_rank",
    "province_rank",
    "pickup_score",
    "timeliness_score",
    "delivery_standard_score",
    "problem_resolution_score",
    "bonus_penalty_score",
    "ticket_id",
    "ticket_type",
    "customer_request_type",
    "service_scene",
    "unresolved_reason",
    "is_followup_unresolved",
    "is_second_ticket",
    "is_repeat_contact",
    "is_urge_order",
    "is_counted_in_resolution_rate"
  ];
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
  const matchedLogistics = logisticsSignals.filter((field) => columns.has(field));
  const hasBranchKpiShape = columns.has("branch_name") &&
    columns.has("total_score") &&
    (columns.has("problem_resolution_score") || columns.has("national_rank") || columns.has("province_rank"));
  const hasResolutionShape = columns.has("ticket_id") &&
    columns.has("branch_name") &&
    (columns.has("ticket_type") || columns.has("unresolved_reason") || columns.has("customer_request_type"));

  if ((hasBranchKpiShape && matchedLogistics.length >= 5) || (hasResolutionShape && matchedLogistics.length >= 4)) {
    return {
      industry: "logistics_service_kpi",
      confidence: Math.min(0.98, 0.62 + matchedLogistics.length * 0.025),
      reasons: [`Matched logistics branch KPI and ticket-resolution fields: ${matchedLogistics.join(", ")}`]
    };
  }

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
