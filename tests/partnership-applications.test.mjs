import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
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
const jiti = jitiFactory(process.cwd(), { interopDefault: true });
const {
  validateStorePartnershipApplication
} = jiti("./lib/partnership-applications.ts");

const validInput = {
  name: "张三",
  contact: " TEST@EXAMPLE.COM ",
  businessStage: "FACTORY_OR_SUPPLIER",
  storeOrProductUrl: "https://example.com/product",
  salesChannels: ["TAOBAO_TMALL"],
  otherSalesChannel: "",
  fulfillmentCapability: "DOMESTIC_DIRECT_SHIPPING",
  requestedServices: ["OVERSEAS_CREATOR_MARKETING"],
  otherRequestedService: "",
  businessDescription: "成熟产品，希望进入美国市场。",
  consentAccepted: true,
  website: ""
};

test("partnership application schema normalizes a valid application", () => {
  const result = validateStorePartnershipApplication(validInput);

  assert.equal(result.success, true);
  assert.equal(result.data.email, "test@example.com");
  assert.deepEqual(result.data.salesChannels, ["TAOBAO_TMALL"]);
  assert.equal(result.data.source, "PUBLIC_APPLICATION_PAGE");
});

test("partnership application rejects empty contact", () => {
  const result = validateStorePartnershipApplication({ ...validInput, contact: "" });

  assert.equal(result.success, false);
  assert.match(result.fieldErrors.contact, /请填写邮箱或微信号/);
});

test("partnership application requires a store or product URL", () => {
  const result = validateStorePartnershipApplication({
    ...validInput,
    storeOrProductUrl: ""
  });

  assert.equal(result.success, false);
  assert.match(result.fieldErrors.storeOrProductUrl, /请填写/);
});

test("partnership application rejects unsafe and invalid URLs", () => {
  const result = validateStorePartnershipApplication({
    ...validInput,
    businessStage: "OVERSEAS_EXPANDING_CHANNELS",
    storeOrProductUrl: "javascript:alert(1)"
  });

  assert.equal(result.success, false);
  assert.match(result.fieldErrors.storeOrProductUrl, /HTTP\/HTTPS/);
});

test("partnership application rejects missing requested services", () => {
  const result = validateStorePartnershipApplication({ ...validInput, requestedServices: [] });

  assert.equal(result.success, false);
  assert.match(result.fieldErrors.requestedServices, /至少选择一项/);
});

test("partnership application rejects missing consent", () => {
  const result = validateStorePartnershipApplication({ ...validInput, consentAccepted: false });

  assert.equal(result.success, false);
  assert.match(result.fieldErrors.consentAccepted, /同意/);
});

test("partnership application rejects no-online-channel combined with other channels", () => {
  const result = validateStorePartnershipApplication({
    ...validInput,
    salesChannels: ["NO_ONLINE_CHANNEL", "SHOPIFY"]
  });

  assert.equal(result.success, false);
  assert.match(result.fieldErrors.salesChannels, /不能同时选择其他渠道/);
});

test("partnership application database model and migration persist public applications", () => {
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const migration = fs.readFileSync("prisma/migrations/20260823_add_store_partnership_applications/migration.sql", "utf8");

  assert.match(schema, /model StorePartnershipApplication \{/);
  assert.match(schema, /email\s+String\?/);
  assert.match(schema, /wechat\s+String\?/);
  assert.match(schema, /salesChannels\s+Json/);
  assert.match(schema, /requestedServices\s+Json/);
  assert.match(migration, /StorePartnershipApplication_contact_check/);
  assert.match(migration, /StorePartnershipApplication_consent_check/);
});

test("partnership application API writes normalized records to database", () => {
  const api = fs.readFileSync("app/api/partnership-applications/route.ts", "utf8");

  assert.match(api, /prisma\.storePartnershipApplication\.create/);
  assert.match(api, /salesChannels:\s*validation\.data\.salesChannels/);
  assert.match(api, /requestedServices:\s*validation\.data\.requestedServices/);
  assert.doesNotMatch(api, /console\.log\(.*validation\.data/s);
});

test("partnership application duplicate submissions do not produce a database 500", () => {
  const api = fs.readFileSync("app/api/partnership-applications/route.ts", "utf8");

  assert.match(api, /findFirst\(\{[\s\S]*submittedAt:\s*\{\s*gte:\s*duplicateSince/);
  assert.match(api, /status:\s*409/);
  assert.match(api, /请勿重复提交/);
});

test("unauthorized users cannot enter admin partnership application management", () => {
  const adminPage = fs.readFileSync("app/admin/partnership-applications/page.tsx", "utf8");

  assert.match(adminPage, /requireWorkspaceRole\(\[WorkspaceRole\.OWNER,\s*WorkspaceRole\.ADMIN\]\)/);
  assert.match(adminPage, /redirect\("\/sign-in"\)/);
  assert.match(adminPage, /redirect\("\/dashboard"\)/);
});

test("admins can view details and update application status", () => {
  const adminPage = fs.readFileSync("app/admin/partnership-applications/page.tsx", "utf8");
  const statusRoute = fs.readFileSync("app/api/partnership-applications/[id]/route.ts", "utf8");

  assert.match(adminPage, /PartnershipApplicationStatusForm/);
  assert.match(adminPage, /selected\.businessDescription/);
  assert.match(statusRoute, /prisma\.storePartnershipApplication\.update/);
  assert.match(statusRoute, /allowedStatuses\.has/);
});
