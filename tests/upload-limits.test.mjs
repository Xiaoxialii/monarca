import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "../lib/upload-limits.ts";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("upload size limit is centralized and used by all upload paths", () => {
  assert.equal(FILE_UPLOAD_MAX_BYTES, 100 * 1024 * 1024);
  assert.equal(FILE_UPLOAD_MAX_MB, 100);

  const files = {
    "next.config.ts": read("next.config.ts"),
    "app/api/data-sources/upload/route.ts": read("app/api/data-sources/upload/route.ts"),
    "app/api/uploads/presign/route.ts": read("app/api/uploads/presign/route.ts"),
    "app/api/data-sources/upload/complete/route.ts": read("app/api/data-sources/upload/complete/route.ts"),
    "components/dashboard.tsx": read("components/dashboard.tsx")
  };

  for (const [path, source] of Object.entries(files)) {
    assert.match(source, /FILE_UPLOAD_MAX_BYTES/, `${path} should use the shared upload byte limit`);
  }

  assert.match(files["next.config.ts"], /middlewareClientMaxBodySize:\s*FILE_UPLOAD_MAX_BYTES/);
  assert.doesNotMatch(files["app/api/data-sources/upload/route.ts"], /MAX_UPLOAD_BYTES/);
  assert.doesNotMatch(files["app/api/uploads/presign/route.ts"], /MAX_DIRECT_UPLOAD_BYTES/);
  assert.doesNotMatch(files["app/api/data-sources/upload/complete/route.ts"], /MAX_DIRECT_UPLOAD_BYTES/);
  assert.doesNotMatch(files["components/dashboard.tsx"], /100 \* 1024 \* 1024/);
});
