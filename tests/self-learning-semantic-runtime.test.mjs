import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import jitiFactory from "jiti";

const require = createRequire(import.meta.url);
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = jitiFactory(process.cwd() + "/");
const {
  SelfLearningSemanticRuntime,
  InMemorySemanticMemoryStore,
  SemanticIntelligenceEngine,
  analyzeRawFields
} = jiti("./lib/semantic/index.ts");

test("self-learning runtime infers mappings and writes them back to memory", async () => {
  const memory = new InMemorySemanticMemoryStore();
  const runtime = new SelfLearningSemanticRuntime({ memory });
  const result = await runtime.run({
    platform: "new-platform",
    rawData: [
      {
        order_id: "O-1",
        gmv: 120,
        purchase_time: "2026-06-01T10:00:00Z",
        currency: "USD",
        seller_sku: "SKU-1",
        buyer_id: "C-1"
      }
    ]
  });
  const records = await memory.all();

  assert.equal(result.canonical_schema.schema_version, "ecommerce_canonical_v1");
  assert.equal(result.canonical_schema.tables.ecommerce_orders[0].revenue, 120);
  assert.equal(result.canonical_schema.tables.ecommerce_orders[0].customer_id, "C-1");
  assert.ok(records.some((record) => record.field_name === "gmv" && record.mapped_concept === "revenue"));
  assert.ok(records.every((record) => record.usage_count >= 1));
  assert.ok(result.learning.memory_size >= 3);
});

test("memory overrides engine when confidence is high and improves with repeated usage", async () => {
  const memory = new InMemorySemanticMemoryStore();
  await memory.upsertMapping({
    field_name: "net_amount_collected",
    platform: "*",
    mapped_to: "revenue",
    confidence: 0.91
  });
  const runtime = new SelfLearningSemanticRuntime({ memory });
  const first = await runtime.run({
    platform: "platform-a",
    rawData: [{ order_id: "A-1", net_amount_collected: 88, created_at: "2026-06-02", currency: "USD" }]
  });
  const second = await runtime.run({
    platform: "platform-b",
    rawData: [{ order_id: "B-1", net_amount_collected: 99, created_at: "2026-06-03", currency: "USD" }]
  });
  const record = (await memory.all()).find((item) => item.normalized_field_name === "net_amount_collected" && item.mapped_concept === "revenue");

  assert.equal(first.mappings.find((mapping) => mapping.field === "net_amount_collected")?.source, "memory");
  assert.equal(second.canonical_schema.tables.ecommerce_orders[0].revenue, 99);
  assert.ok(record.usage_count >= 3);
  assert.ok(record.confidence_score >= 0.91);
});

test("feedback loop corrects mappings and updates confidence without restarting runtime", async () => {
  const memory = new InMemorySemanticMemoryStore();
  const runtime = new SelfLearningSemanticRuntime({ memory });

  await runtime.run({
    platform: "ads-platform",
    rawData: [{ spend_total: 42, conversion_name: "purchase" }]
  });
  await runtime.run({
    platform: "ads-platform",
    rawData: [{ spend_total: 55, conversion_name: "purchase" }],
    feedbackEvents: [
      {
        field_name: "spend_total",
        corrected_mapping: "ad_spend",
        feedback: "edit"
      }
    ]
  });

  const records = await memory.all();
  const corrected = records.find((record) => record.normalized_field_name === "spend_total" && record.mapped_concept === "ad_spend");

  assert.ok(corrected, "corrected mapping should be stored");
  assert.ok(corrected.user_feedback_score > 0);
  assert.ok(corrected.confidence_score > 0.72);
});

test("field analyzer supports nested unknown payloads and marks anomalies", async () => {
  const analyzer = analyzeRawFields({
    envelope: {
      random: [
        { xqz: "???", nested: { blob: true } }
      ]
    }
  });
  const engine = new SemanticIntelligenceEngine();
  const result = engine.analyzeFields(analyzer.fields);

  assert.equal(analyzer.structure, "unknown");
  assert.ok(result.unknown_fields.length >= 1);
});

test("semantic runtime modules do not contain platform-specific provider branches", () => {
  const fs = require("node:fs");
  const files = [
    "lib/semantic/engine/semantic-intelligence-engine.ts",
    "lib/semantic/memory/semantic-memory-store.ts",
    "lib/semantic/mapper/semantic-mapper.ts",
    "lib/semantic/mapper/canonical-schema-engine.ts",
    "lib/semantic/runtime.ts"
  ];
  const source = files.map((file) => fs.readFileSync(join(process.cwd(), file), "utf8")).join("\n");

  assert.doesNotMatch(source, /provider\s*===\s*["']shopify|provider\s*===\s*["']amazon|provider\s*===\s*["']tiktok|if\s*\(\s*platform\s*===/i);
});
