import type {
  DetectedIndustry,
  Industry,
  MetricGenerationInput,
  MetricInputTable
} from "@/lib/metric-generation/metric-types";
import { normalizeMetricToken } from "@/lib/metric-generation/metric-safety-rules";

const industrySignals: Record<Industry, string[]> = {
  ecommerce: [
    "order_id",
    "product_id",
    "customer_id",
    "quantity",
    "price",
    "discount",
    "payment",
    "refund",
    "shipping"
  ],
  saas: ["subscription", "plan", "mrr", "arr", "renewal", "churn", "account_id", "seat", "trial"],
  app_marketplace: ["app", "category", "rating", "reviews", "installs", "android", "ios", "price", "content_rating"],
  finance_stock: ["open", "high", "low", "close", "adj_close", "adjusted_close", "volume", "ticker", "date"],
  ads: ["campaign", "ad_group", "impressions", "clicks", "ctr", "cpc", "spend", "conversion"],
  content: ["views", "likes", "shares", "comments", "watch_time", "creator", "post"],
  crm_sales: ["lead", "opportunity", "deal", "pipeline", "stage", "close_date", "owner", "forecast"],
  support: ["ticket", "issue", "agent", "resolution", "sla", "csat", "priority"],
  logistics: ["shipment", "delivery", "warehouse", "route", "delay"],
  hr: ["employee", "salary", "department", "attrition", "tenure"],
  review_sentiment: ["review", "translated_review", "sentiment", "sentiment_polarity", "sentiment_subjectivity", "rating"],
  unknown: []
};

function tableTokens(table: MetricInputTable) {
  return [
    normalizeMetricToken(table.tableName),
    ...table.columns.map((column) => normalizeMetricToken(column.name)),
    ...table.columns.flatMap((column) => (column.sampleValues ?? []).slice(0, 5).map((value) => normalizeMetricToken(String(value))))
  ];
}

function scoreIndustry(input: MetricGenerationInput, industry: Industry) {
  const signals = industrySignals[industry];
  const tokens = input.tables.flatMap(tableTokens);
  const hits = signals.filter((signal) => {
    const normalizedSignal = normalizeMetricToken(signal);
    return tokens.some((token) => token === normalizedSignal || token.includes(normalizedSignal));
  });
  const tableNameHits = input.tables.filter((table) => {
    const name = normalizeMetricToken(table.tableName);
    return signals.some((signal) => name.includes(normalizeMetricToken(signal)));
  });
  const confidence = signals.length === 0
    ? 0
    : Math.min(0.96, Math.round(((hits.length / Math.min(signals.length, 8)) * 0.82 + tableNameHits.length * 0.04) * 100) / 100);

  return {
    industry,
    confidence,
    reasons: hits.slice(0, 8).map((hit) => `Matched signal: ${hit}`)
  };
}

export function detectIndustry(input: MetricGenerationInput): DetectedIndustry {
  const scored = (Object.keys(industrySignals) as Industry[])
    .filter((industry) => industry !== "unknown")
    .map((industry) => scoreIndustry(input, industry))
    .sort((a, b) => b.confidence - a.confidence);
  const primary = scored[0];

  if (!primary || primary.confidence < 0.25) {
    return {
      primary: "unknown",
      confidence: 0.35,
      reasons: ["No strong industry pattern detected"],
      secondaryCandidates: scored.slice(0, 3)
    };
  }

  return {
    primary: primary.industry,
    confidence: primary.confidence,
    reasons: primary.reasons.length > 0 ? primary.reasons : ["Matched industry-specific field combinations"],
    secondaryCandidates: scored.slice(1, 4).filter((item) => item.confidence > 0.2)
  };
}

export function detectTableIndustry(table: MetricInputTable): Industry {
  return detectIndustry({ tables: [table] }).primary;
}
