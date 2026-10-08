import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jwt-simple";
import { formatJwtPayload } from "./jwtPayload";

const claims = { sub: "123", name: "Test user", roles: ["reader"] };
const secret = "test-secret";
const token = jwt.encode(claims, secret, "HS256");

test("verified JWT payloads become formatted editor text", () => {
  const text = formatJwtPayload(jwt.decode(token, secret, false, "HS256"));
  assert.equal(typeof text, "string");
  assert.equal(text, JSON.stringify(claims, null, 2));
  assert.deepEqual(JSON.parse(text), claims);
});

test("payloads remain readable when signature verification fails", () => {
  assert.throws(() => jwt.decode(token, "wrong-secret", false, "HS256"));
  const text = formatJwtPayload(jwt.decode(token, "wrong-secret", true, "HS256"));
  assert.deepEqual(JSON.parse(text), claims);
});

test("legacy objects loaded from local storage become editor text", () => {
  const saved = JSON.parse(JSON.stringify({ payload: claims }));
  assert.equal(formatJwtPayload(saved.payload), JSON.stringify(claims, null, 2));
});

test("existing text is preserved and other JSON values produce strings", () => {
  const text = '{ "sub": "123" }';
  assert.equal(formatJwtPayload(text), text);
  for (const payload of [null, true, 42, ["reader"]]) {
    const result = formatJwtPayload(payload);
    assert.equal(typeof result, "string");
    assert.deepEqual(JSON.parse(result), payload);
  }
  assert.equal(formatJwtPayload(undefined), "");
});
