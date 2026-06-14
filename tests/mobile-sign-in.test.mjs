import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("mobile sign-in is passwordless and performs a full redirect after session activation", () => {
  const signInPanel = read("components/sign-in-panel.tsx");
  const signUpPanel = read("components/sign-up-panel.tsx");

  assert.doesNotMatch(signInPanel, /function PasswordSignIn/, "Sign-in should not expose a password form");
  assert.doesNotMatch(signInPanel, /type="password"/, "Sign-in should not render password inputs");
  assert.doesNotMatch(signUpPanel, /type=\{showPassword \? "text" : "password"\}/, "Sign-up should not render password inputs");
  assert.doesNotMatch(signUpPanel, /username:/, "Sign-up should not create username/password accounts");
  assert.match(
    signUpPanel,
    /password: createClerkManagedPassword\(\)/,
    "Passwordless sign-up should satisfy Clerk password-required settings without showing a password field"
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
    "Email-code sign-in should activate the session before redirecting"
  );
  assert.match(
    signUpPanel,
    /function completeSignUpRedirect\(path: string\)/,
    "Sign-up should also use a dedicated completion redirect helper"
  );
  assert.match(
    signUpPanel,
    /router\.replace\(redirectPath\);[\s\S]*completeSignUpRedirect\(redirectPath\);/,
    "Email-code sign-up should activate the session before redirecting"
  );
});
