import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("database setup checkout submits a request instead of starting Stripe", () => {
  const paymentPage = read("components/payment-page.tsx");

  assert.match(
    paymentPage,
    /const usesStripe = false/,
    "Checkout plans should submit requests instead of starting Stripe"
  );
  assert.match(
    paymentPage,
    /fetch\("\/api\/help-requests"/,
    "Non-Stripe checkout should create a help request"
  );
  assert.match(
    paymentPage,
    /selectedPlan === "database-setup"[\s\S]*"搭建需求"/,
    "Database setup should show a setup request form title"
  );
  assert.match(
    paymentPage,
    /"填写信息后，我们会确认数据库搭建范围"/,
    "Database setup should explain that scope will be confirmed"
  );
  assert.match(
    paymentPage,
    /"提交成功！我们会评估数据源和业务复杂度，再确认最终报价"/,
    "Database setup should show the requested success message after submission"
  );
  assert.match(
    paymentPage,
    /"提交成功！我们会安排方案评审，并确认企业部署范围"/,
    "Enterprise consultation should show the requested success message after submission"
  );
  assert.match(
    paymentPage,
    /"提交成功！我们会在24小时内，与您联系！"/,
    "Professional fallback request should show the requested 24-hour contact message"
  );
  assert.match(
    paymentPage,
    /"评估需求"/,
    "Professional checkout should use needs-review wording instead of payment wording"
  );
  assert.match(
    paymentPage,
    /redirecting: "提交中\.\.\."/,
    "Checkout loading text should say submitting instead of redirecting to Stripe"
  );
  assert.match(
    paymentPage,
    /summaryTitle[\s\S]*"评估后报价"/,
    "Professional checkout should show quote-after-review wording instead of secure settlement"
  );
  assert.doesNotMatch(
    paymentPage,
    /selectedPlan === "professional" && response\.status === 401/,
    "Professional checkout should no longer rely on Stripe fallback for contact requests"
  );
  assert.match(
    paymentPage,
    /router\.back\(\)/,
    "Back action should return to the previous page when browser history exists"
  );
  assert.match(
    paymentPage,
    /!\s*usesStripe \? \(/,
    "The summary card should render only for request forms"
  );
  assert.match(
    paymentPage,
    /contactMethodLabel = localeKey === "zh" \? "工作邮箱\/微信"/,
    "Consultation forms should ask for work email or WeChat"
  );
  assert.doesNotMatch(
    paymentPage,
    /工作邮箱（选填）|Work email \(optional\)/,
    "Checkout form should not label the contact field as optional"
  );
  assert.match(
    paymentPage,
    /type=\{usesStripe \? "email" : "text"\}/,
    "Consultation forms should allow non-email contact values such as WeChat"
  );
});
