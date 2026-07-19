import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("new product launch optimizer does not render hardcoded imported product data", () => {
  const component = read("components/new-product-launch-optimizer.tsx");

  assert.doesNotMatch(component, /NEW_001|Women's Summer Dress|Compact Travel Jewelry Case|Ceramic Bedside Lamp/, "Launch imported products must not be hardcoded demo SKUs");
  assert.match(component, /const IMPORTED_NEW_PRODUCTS[\s\S]*= \[\]/, "Imported products should default to an empty data-backed list");
  assert.match(component, /No imported new product data is available/, "Empty imported data should show an explicit empty state");
});
