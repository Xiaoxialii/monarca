import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("auth keeps password and email-code flows with mobile-safe redirects", () => {
  const signInPanel = read("components/sign-in-panel.tsx");
  const signUpPanel = read("components/sign-up-panel.tsx");

  assert.match(signInPanel, /function PasswordSignIn/, "Sign-in should keep username/password login");
  assert.match(signInPanel, /type="password"/, "Sign-in should render a password input");
  assert.match(signUpPanel, /type=\{showPassword \? "text" : "password"\}/, "Sign-up should keep password inputs");
  assert.match(signUpPanel, /username: trimmedUsername/, "Sign-up should keep username/password account creation");
  assert.match(
    signUpPanel,
    /password: createClerkManagedPassword\(\)/,
    "Email-code sign-up should satisfy Clerk password-required settings without showing a password field in that flow"
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
