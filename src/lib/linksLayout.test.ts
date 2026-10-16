import assert from "node:assert/strict";
import { test } from "node:test";
import { LINK_FOLDERS } from "./linksData";
import {
  DEFAULT_LINK_CARD_ORDER,
  isValidLinkCardOrder,
  normalizeLinkCardOrder,
  readLinkCardOrder,
} from "./linksLayout";

test("every card has a unique stable ID", () => {
  assert.equal(new Set(DEFAULT_LINK_CARD_ORDER).size, LINK_FOLDERS.length);
  assert.ok(DEFAULT_LINK_CARD_ORDER.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
});

test("a saved personal ordering is retained exactly", () => {
  const personalOrder = [...DEFAULT_LINK_CARD_ORDER].reverse();
  assert.deepEqual(readLinkCardOrder(JSON.stringify(personalOrder)), personalOrder);
});

test("older layouts discard removed IDs and append new cards without losing personal order", () => {
  const savedOrder = ["node-red", "retired-card", "internal-tools", "node-red", null];
  const normalized = normalizeLinkCardOrder(savedOrder);
  assert.deepEqual(normalized.slice(0, 2), ["node-red", "internal-tools"]);
  assert.deepEqual(
    normalized.slice(2),
    DEFAULT_LINK_CARD_ORDER.filter((id) => id !== "node-red" && id !== "internal-tools"),
  );
});

test("new users and malformed stored values get the complete default layout", () => {
  for (const savedValue of [null, undefined, "", "not-json", "null", "{}", "42", '"node-red"']) {
    assert.deepEqual(readLinkCardOrder(savedValue), DEFAULT_LINK_CARD_ORDER);
  }
  assert.notEqual(readLinkCardOrder(null), DEFAULT_LINK_CARD_ORDER);
});

test("saving rejects non-arrays, unknown IDs, non-string IDs, and duplicate cards", () => {
  for (const invalid of [null, undefined, {}, "node-red", ["missing-card"], [1], [null], ["gos", "gos"]]) {
    assert.equal(isValidLinkCardOrder(invalid), false);
  }
});

test("saving accepts complete or partial known orders, with empty order resetting defaults", () => {
  assert.equal(isValidLinkCardOrder(DEFAULT_LINK_CARD_ORDER), true);
  assert.equal(isValidLinkCardOrder(["internal-tools", "node-red"]), true);
  assert.equal(isValidLinkCardOrder([]), true);
  assert.deepEqual(normalizeLinkCardOrder([]), DEFAULT_LINK_CARD_ORDER);
});
