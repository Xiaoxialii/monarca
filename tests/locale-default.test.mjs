import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("request locale uses cookie before IP geo and feeds first render", () => {
  const serverLocale = read("lib/server-locale.ts");
  const proxy = read("proxy.ts");
  const locale = read("lib/locale.ts");

  assert.match(serverLocale, /cookieStore\.get\(SERVER_LOCALE_COOKIE_KEY\)/, "Server locale should read the locale cookie first");
  assert.match(serverLocale, /x-vercel-ip-country/, "Server locale should inspect Vercel IP country");
  assert.match(serverLocale, /cf-ipcountry/, "Server locale should inspect Cloudflare IP country");
  assert.match(serverLocale, /chineseCountryCodes\.has\(normalized\) \? "zh" : "en"/, "Chinese-region IPs should default to Chinese");
  assert.match(serverLocale, /accept-language/, "Server locale should fall back to Accept-Language");
  assert.match(proxy, /response\.cookies\.set\(localeCookieKey, geoLocale/, "Proxy should persist IP-derived locale for later requests");
  assert.match(locale, /document\.cookie = `\$\{LOCALE_STORAGE_KEY\}=\$\{storedLocale\}/, "Client should sync stored manual locale into a cookie");
});

test("public and dashboard pages pass request locale into client components", () => {
  const expected = [
    ["app/page.tsx", /<Homepage defaultLocale=\{await getRequestLocale\("en"\)\}/],
    ["app/sign-in/page.tsx", /<SignInPanel defaultLocale=\{defaultLocale\}/],
    ["app/sign-up/page.tsx", /<SignUpPanel defaultLocale=\{defaultLocale\}/],
    ["app/checkout/professional/page.tsx", /<PaymentPage plan="professional" defaultLocale=\{await getRequestLocale\("en"\)\}/],
    ["app/support/page.tsx", /<SupportPage defaultLocale=\{await getRequestLocale\("en"\)\}/],
    ["app/dashboard/page.tsx", /<Dashboard view="reports" defaultLocale=\{await getRequestLocale\("en"\)\}/]
  ];

  for (const [file, pattern] of expected) {
    assert.match(read(file), pattern, `${file} should pass request locale to the client component`);
  }
});

