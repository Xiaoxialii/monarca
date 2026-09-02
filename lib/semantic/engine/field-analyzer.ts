import { inferValueType, normalizeFieldName } from "@/lib/semantic/engine/semantic-intelligence-engine";
import type { RawFieldObservation, SemanticValueType } from "@/lib/semantic/types";

export type FieldAnalyzerResult = {
  fields: RawFieldObservation[];
  structure: "order-like" | "product-like" | "ad-like" | "payment-like" | "unknown";
  confidence: number;
  key_patterns: string[];
};

export function analyzeRawFields(rawData: unknown): FieldAnalyzerResult {
  const rows = normalizeRows(rawData);
  const observations = new Map<string, RawFieldObservation>();

  for (const row of representativeRows(rows, 500)) {
    visit(row, [], observations);
  }

  const fields = Array.from(observations.values()).map((field) => ({
    ...field,
    valueType: dominantType(field.samples.map(inferValueType))
  }));
  const patternScores = scoreStructure(fields);
  const best = Object.entries(patternScores).sort((a, b) => b[1] - a[1])[0] as [FieldAnalyzerResult["structure"], number] | undefined;
  const structure = best && best[1] >= 0.18 ? best[0] : "unknown";

  return {
    fields,
    structure,
    confidence: Number(Math.min(0.98, best?.[1] ?? 0).toFixed(4)),
    key_patterns: detectKeyPatterns(fields)
  };
}

function representativeRows(rows: unknown[], maxRows: number) {
  if (rows.length <= maxRows) return rows;

  const selected = new Map<number, unknown>();
  const firstWindow = Math.min(50, rows.length);
  const lastWindow = Math.min(50, rows.length);

  for (let index = 0; index < firstWindow; index += 1) {
    selected.set(index, rows[index]);
  }

  for (let index = Math.max(0, rows.length - lastWindow); index < rows.length; index += 1) {
    selected.set(index, rows[index]);
  }

  const remaining = Math.max(0, maxRows - selected.size);
  if (remaining > 0) {
    const stride = rows.length / remaining;
    for (let offset = 0; offset < remaining; offset += 1) {
      const index = Math.min(rows.length - 1, Math.floor(offset * stride));
      selected.set(index, rows[index]);
    }
  }

  return Array.from(selected.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, row]) => row);
}

export function normalizeRows(rawData: unknown): unknown[] {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && typeof rawData === "object") {
    const object = rawData as Record<string, unknown>;
    const firstArray = Object.values(object).find((value) => Array.isArray(value));

    if (Array.isArray(firstArray) && firstArray.every((value) => value && typeof value === "object")) {
      return firstArray;
    }
  }

  return [rawData];
}

function visit(value: unknown, path: string[], observations: Map<string, RawFieldObservation>) {
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => visit(item, [...path, `[${index}]`], observations));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isSyntheticField(key)) continue;
      visit(nested, [...path, key], observations);
    }
    return;
  }

  const rawPath = path.join(".");
  const fieldName = path[path.length - 1] ?? "value";
  const observation = observations.get(rawPath) ?? {
    field: fieldName,
    path: rawPath,
    valueType: "unknown" as SemanticValueType,
    samples: [],
    context: path.slice(0, -1)
  };

  if (observation.samples.length < 12) observation.samples.push(value);
  observations.set(rawPath, observation);
}

function isSyntheticField(key: string) {
  return key.startsWith("__");
}

function dominantType(types: SemanticValueType[]) {
  const counts = new Map<SemanticValueType, number>();
  for (const type of types) {
    if (type === "null") continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

function scoreStructure(fields: RawFieldObservation[]) {
  const text = fields.map((field) => normalizeFieldName([field.path, field.field, ...field.context].join("_"))).join(" ");

  return {
    "order-like": scoreText(text, ["order", "purchase", "transaction", "customer", "sku", "quantity", "total", "created"]),
    "product-like": scoreText(text, ["product", "variant", "sku", "title", "price", "vendor", "category"]),
    "ad-like": scoreText(text, ["campaign", "ad", "spend", "impression", "click", "conversion", "cpc"]),
    "payment-like": scoreText(text, ["payment", "charge", "invoice", "amount", "currency", "customer"]),
    unknown: 0
  };
}

function scoreText(text: string, tokens: string[]) {
  const matches = tokens.filter((token) => text.includes(token)).length;

  return matches / tokens.length;
}

function detectKeyPatterns(fields: RawFieldObservation[]) {
  const patterns = new Set<string>();
  const names = fields.map((field) => normalizeFieldName(field.field));

  for (const name of names) {
    if (/price|total|amount|gmv|revenue|sales/.test(name)) patterns.add("money");
    if (/date|time|created|processed|paid/.test(name)) patterns.add("datetime");
    if (/sku|product|variant|item/.test(name)) patterns.add("product");
    if (/customer|buyer|user|client/.test(name)) patterns.add("customer");
    if (/campaign|ad|impression|click|spend/.test(name)) patterns.add("ads");
  }

  return Array.from(patterns);
}
