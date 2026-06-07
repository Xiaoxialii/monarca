import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Chinese report summary source avoids English template fallback", async () => {
  const source = await readFile(new URL("../lib/report-generation/report-section-builder.ts", import.meta.url), "utf8");
  const englishTemplateIndex = source.indexOf("giving a business-level signal");
  const englishBranchIndex = source.lastIndexOf('if (locale === "en")', englishTemplateIndex);

  assert.notEqual(englishTemplateIndex, -1);
  assert.notEqual(englishBranchIndex, -1);

  const zhFallbackSection = [
    source.slice(source.indexOf("function zhCommerceSummary"), source.indexOf("function zhBusinessSummaryForMetric")),
    source.slice(source.indexOf("function zhBusinessSummaryForMetric"), source.indexOf("function coreSummaryBullets"))
  ].join("\n");

  assert.equal(zhFallbackSection.includes("giving a business-level signal"), false);
  assert.equal(zhFallbackSection.includes("本次数据覆盖"), true);
  assert.equal(zhFallbackSection.includes("客户总数"), true);
  assert.equal(zhFallbackSection.includes("订单总数"), true);
  assert.equal(zhFallbackSection.includes("客户贡献、订单规模、商品表现、复购情况和销售趋势"), true);
});
