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
    /const usesStripe = selectedPlan === "professional"/,
    "Only the professional plan should use Stripe checkout"
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
