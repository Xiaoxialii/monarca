export type CogsSemanticType = "unit" | "total" | "unknown";

export type CogsSemanticInput = {
  cogs: unknown;
  quantity?: unknown;
  revenue?: unknown;
  price?: unknown;
  fieldName?: string;
};

export type CogsSemanticResolution = {
  cogs_type: CogsSemanticType;
  normalized_cogs: number;
  raw_cogs: number;
  unit_cogs: number;
  confidence: number;
  estimated_cost_flag: boolean;
  reason: string;
};

const UNIT_COST_FIELDS = new Set([
  "cost_price",
  "product_cost",
  "manufacturing_cost",
  "procurement_cost",
  "unit_cost",
  "unit_cogs"
]);

const TOTAL_COST_FIELDS = new Set([
  "cogs",
  "total_cogs",
  "total_cost",
  "line_cogs",
  "line_cost",
  "row_cogs",
  "row_cost"
]);

export function resolveCogsSemantic(input: CogsSemanticInput): CogsSemanticResolution | null {
  const rawCogs = finiteNumber(input.cogs);
  if (rawCogs === null) return null;

  const quantity = Math.max(1, finiteNumber(input.quantity) ?? 1);
  const revenue = finiteNumber(input.revenue);
  const explicitPrice = finiteNumber(input.price);
  const inferredPrice = revenue !== null && quantity > 0 ? revenue / quantity : null;
  const price = explicitPrice ?? inferredPrice;
  const fieldName = normalizeFieldName(input.fieldName);

  if (UNIT_COST_FIELDS.has(fieldName)) {
    return buildResolution({
      rawCogs,
      quantity,
      cogsType: "unit",
      confidence: 1,
      reason: `${fieldName || "cost"} is an explicit unit cost field`
    });
  }

  if (TOTAL_COST_FIELDS.has(fieldName) && fieldName !== "cogs") {
    return buildResolution({
      rawCogs,
      quantity,
      cogsType: "total",
      confidence: 1,
      reason: `${fieldName} is an explicit total cost field`
    });
  }

  if (price !== null && revenue !== null && revenue > 0) {
    const cogsRevenueRatio = rawCogs / revenue;

    if (cogsRevenueRatio < 0.8 && rawCogs < price) {
      return buildResolution({
        rawCogs,
        quantity,
        cogsType: "unit",
        confidence: 0.88,
        reason: "cogs is below unit price and below 80% of row revenue"
      });
    }

    if (rawCogs > price || isNearRevenueRange(cogsRevenueRatio)) {
      return buildResolution({
        rawCogs,
        quantity,
        cogsType: "total",
        confidence: 0.9,
        reason: "cogs is above unit price or already in row revenue range"
      });
    }
  }

  if (price !== null && rawCogs > price) {
    return buildResolution({
      rawCogs,
      quantity,
      cogsType: "total",
      confidence: 0.84,
      reason: "cogs is greater than unit price"
    });
  }

  return buildResolution({
    rawCogs,
    quantity,
    cogsType: "unit",
    confidence: 0.55,
    estimatedCostFlag: true,
    reason: "cogs semantic type is ambiguous; assumed unit cost"
  });
}

function buildResolution(input: {
  rawCogs: number;
  quantity: number;
  cogsType: CogsSemanticType;
  confidence: number;
  reason: string;
  estimatedCostFlag?: boolean;
}): CogsSemanticResolution {
  const normalizedCogs = input.cogsType === "total" ? input.rawCogs : input.rawCogs * input.quantity;
  return {
    cogs_type: input.cogsType,
    normalized_cogs: roundCurrency(normalizedCogs),
    raw_cogs: roundCurrency(input.rawCogs),
    unit_cogs: roundCurrency(input.cogsType === "total" ? input.rawCogs / input.quantity : input.rawCogs),
    confidence: roundRatio(input.confidence),
    estimated_cost_flag: input.estimatedCostFlag ?? false,
    reason: input.reason
  };
}

function isNearRevenueRange(ratio: number) {
  return ratio >= 0.2 && ratio <= 1.2;
}

function normalizeFieldName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}
