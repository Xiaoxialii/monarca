import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
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
const { readR2ObjectText, writeR2ObjectText } = jiti("./lib/r2-storage.ts");

test("local artifact fallback writes and reads text when R2 is not configured", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    MONARCA_LOCAL_ARTIFACT_DIR: process.env.MONARCA_LOCAL_ARTIFACT_DIR
  };
  const dir = await mkdtemp(join(tmpdir(), "monarca-artifacts-"));

  try {
    process.env.NODE_ENV = "development";
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    process.env.MONARCA_LOCAL_ARTIFACT_DIR = dir;

    const result = await writeR2ObjectText({
      key: "workspaces/ws/connectors/shopify/ds/run/normalized/ecommerce_orders.jsonl",
      body: "{\"order_id\":\"1\"}\n",
      contentType: "application/x-ndjson"
    });

    assert.equal(result.bucket, "local-artifact-store");
    assert.equal(await readR2ObjectText(result.key), "{\"order_id\":\"1\"}\n");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});
