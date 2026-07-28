import assert from "node:assert/strict";
import test from "node:test";

import { hashPin, parseCookies, tokenHash, verifyPin } from "../lib/security.ts";

test("hashes PINs with unique salts and verifies without plaintext storage", () => {
  const first = hashPin("2468");
  const second = hashPin("2468");
  assert.notEqual(first, second);
  assert.equal(first.includes("2468"), false);
  assert.equal(verifyPin("2468", first), true);
  assert.equal(verifyPin("0000", first), false);
});

test("hashes session tokens and parses cookie values", () => {
  assert.equal(tokenHash("token"), tokenHash("token"));
  assert.notEqual(tokenHash("token"), tokenHash("other"));
  const request = new Request("http://localhost", { headers: { cookie: "a=1; hyfit_session=hello%20world" } });
  assert.equal(parseCookies(request).get("hyfit_session"), "hello world");
});
