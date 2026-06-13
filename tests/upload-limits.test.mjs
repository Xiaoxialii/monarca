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
  const r2Storage = read("lib/r2-storage.ts");

  for (const [path, source] of Object.entries(files)) {
    assert.match(source, /FILE_UPLOAD_MAX_BYTES/, `${path} should use the shared upload byte limit`);
  }

  assert.match(files["next.config.ts"], /middlewareClientMaxBodySize:\s*FILE_UPLOAD_MAX_BYTES/);
  assert.doesNotMatch(files["app/api/data-sources/upload/route.ts"], /MAX_UPLOAD_BYTES/);
  assert.doesNotMatch(files["app/api/uploads/presign/route.ts"], /MAX_DIRECT_UPLOAD_BYTES/);
  assert.doesNotMatch(files["app/api/data-sources/upload/complete/route.ts"], /MAX_DIRECT_UPLOAD_BYTES/);
  assert.doesNotMatch(files["components/dashboard.tsx"], /100 \* 1024 \* 1024/);
  assert.doesNotMatch(
    files["components/dashboard.tsx"],
    /file\.size <= FILE_UPLOAD_MAX_BYTES/,
    "Large upload fallback must not send files up to the app limit through Vercel Functions"
  );
  assert.match(files["components/dashboard.tsx"], /file\.size <= directApiUploadMaxBytes/);
  assert.match(
    r2Storage,
    /const endpoint = accountId \? `https:\/\/\$\{accountId\}\.r2\.cloudflarestorage\.com` : process\.env\.R2_ENDPOINT \|\| null/,
    "R2 endpoint should prefer the canonical account S3 API endpoint over an env override"
  );
});
