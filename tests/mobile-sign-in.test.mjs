import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("mobile sign-in defaults to password login and performs a full redirect after session activation", () => {
  const signInPanel = read("components/sign-in-panel.tsx");

  assert.match(
    signInPanel,
    /useState<"code" \| "other">\("other"\)/,
    "Password login should be the default visible sign-in mode"
  );
  assert.match(
    signInPanel,
    /function completeSignInRedirect\(path: string\)/,
    "Sign-in should use a dedicated completion redirect helper"
  );
  assert.match(
    signInPanel,
    /window\.location\.assign\(path\)/,
    "Completed sign-in should force a browser-level navigation for mobile browsers"
  );
  assert.match(
    signInPanel,
    /await setActive\(\{ session: result\.createdSessionId \}\);[\s\S]*router\.replace\(redirectPath\);[\s\S]*completeSignInRedirect\(redirectPath\);/,
    "Password sign-in should activate the session before redirecting"
  );
  assert.match(
    signInPanel,
    /isAlreadySignedInError\(caughtError\)[\s\S]*router\.replace\(redirectPath\);[\s\S]*completeSignInRedirect\(redirectPath\);/,
    "Already-signed-in mobile users should be sent to the dashboard"
  );
});

