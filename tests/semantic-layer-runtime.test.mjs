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
const { SemanticLayerRuntime } = jiti("./lib/semantic-layer-runtime.ts");

function ecommerceContext() {
  const runtime = new SemanticLayerRuntime();

  return runtime.createContext({
    workspaceId: "workspace-a",
    dataSource: { id: "source-ecommerce" },
    schemaSnapshot: {
      version: 3,
      schemaJson: {
        metricRegistry: {
          metricRegistryId: "ecommerce:test",
          industry: "ecommerce"
        },
        tables: [
          {
            name: "orders",
            columns: [
              { name: "order_id", type: "text" },
              { name: "order_date", type: "date" },
              { name: "category", type: "text", semanticName: "product_category" },
              { name: "revenue", type: "number" }
            ]
          }
        ]
      },
      qualityReport: {}
    },
    metrics: [
      {
        id: "metric-gmv",
        name: "GMV",
        lineageJson: {
          metricId: "gmv",
          businessName: "GMV",
          displayName: "Gross Merchandise Value"
        }
      }
    ]
  });
}

test("semantic context is scoped to one data source and domain", () => {
  const context = ecommerceContext();

  assert.equal(context.workspaceId, "workspace-a");
  assert.equal(context.dataSourceId, "source-ecommerce");
  assert.equal(context.domain, "ecommerce");
  assert.equal(context.snapshotVersion, "3");
  assert.deepEqual(context.allowedMetricIds.sort(), ["gmv", "metric-gmv"].sort());
  assert.ok(context.allowedMetrics.includes("GMV"));
  assert.ok(context.allowedDimensions.includes("category"));
  assert.ok(context.allowedDimensions.includes("product_category"));
});

test("semantic runtime blocks cross-domain metric execution", () => {
  const runtime = new SemanticLayerRuntime();
  const context = ecommerceContext();

  assert.throws(
    () => runtime.assertQueryAllowed({ domain: "logistics", metricIds: ["metric-gmv"] }, context),
    /Cross-domain data leak blocked/
  );
});

test("semantic runtime enforces metric and dimension allowlists", () => {
  const runtime = new SemanticLayerRuntime();
  const context = ecommerceContext();

  assert.throws(
    () => runtime.assertQueryAllowed({ domain: "ecommerce", metricIds: ["ticket_resolution_rate"] }, context),
    /Metric not allowed in this domain/
  );
  assert.throws(
    () => runtime.assertQueryAllowed({ domain: "ecommerce", dimensions: ["branch_name"] }, context),
    /Invalid dimension for this data source/
  );
});

test("semantic runtime validates result trace and cache identity", () => {
  const runtime = new SemanticLayerRuntime();
  const context = ecommerceContext();

  assert.doesNotThrow(() => runtime.validateNoCrossDomainLeak({
    metricResults: [
      {
        metricId: "metric-gmv",
        metricName: "GMV",
        metricDomain: "ecommerce",
        dataSourceId: "source-ecommerce"
      }
    ]
  }, context));

  assert.throws(
    () => runtime.validateNoCrossDomainLeak({
      metricResults: [
        {
          metricId: "ticket_resolution_rate",
          metricName: "问题解决率",
          metricDomain: "logistics_service_kpi",
          dataSourceId: "source-logistics"
        }
      ]
    }, context),
    /Cross-domain data leak blocked/
  );

  assert.deepEqual(runtime.semanticCacheIdentity(context, "query-hash"), {
    dataSourceId: "source-ecommerce",
    dataSourceIds: ["source-ecommerce"],
    domain: "ecommerce",
    snapshotVersion: "3",
    schemaHash: context.schemaHash,
    queryHash: "query-hash"
  });
});
