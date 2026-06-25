import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("auth keeps Clerk username password flows with mobile-safe redirects", () => {
  const signInPanel = read("components/sign-in-panel.tsx");
  const signUpPanel = read("components/sign-up-panel.tsx");

  assert.match(signInPanel, /function PasswordSignIn/, "Sign-in should expose Clerk password login");
  assert.match(signInPanel, /identifier: trimmedIdentifier,[\s\S]*password/, "Sign-in should pass email or username identifiers directly to Clerk");
  assert.match(signUpPanel, /type=\{showPassword \? "text" : "password"\}/, "Sign-up should render password inputs");
  assert.match(
    signUpPanel,
    /signUp\.create\(\{\s*username: trimmedUsername,\s*password\s*\}\)/,
    "Username/password sign-up should pass username and password directly to Clerk"
  );
  assert.doesNotMatch(signUpPanel, /usernameToInternalEmail/, "Auth should not map usernames to synthetic email addresses");
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
