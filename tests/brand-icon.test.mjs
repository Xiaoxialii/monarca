import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("site metadata uses the Monarca brand mark as browser icon", () => {
  const layout = read("app/layout.tsx");

  assert.ok(existsSync(join(root, "public/brand-mark.png")), "Brand mark asset should exist");
  assert.match(layout, /icons:\s*\{[\s\S]*icon:[\s\S]*\/brand-mark\.png/, "Browser icon should use the brand mark");
  assert.match(layout, /apple:[\s\S]*\/brand-mark\.png/, "Apple touch icon should use the brand mark");
});
