import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeId } from "../src/adapter/linear-cli.ts";

test("assertSafeId rejects shell-metachar input", () => {
  const malicious = [
    "$(rm -rf /)",
    "abc;whoami",
    "`id`",
    "id && cat /etc/passwd",
    "id | tee /tmp/out",
    "../etc/passwd",
    "a b c",
    "a\nb",
  ];
  for (const bad of malicious) {
    assert.throws(
      () => assertSafeId(bad, "projectId"),
      /Invalid Linear/,
      `Expected rejection of: ${JSON.stringify(bad)}`,
    );
  }
});

test("assertSafeId accepts valid Linear IDs", () => {
  const valid = [
    "7d2e28c163b8",
    "ABNL-42",
    "abc-123_DEF",
    "85254c9d25f9",
    "a091fb326d04",
  ];
  for (const id of valid) {
    assert.doesNotThrow(() => assertSafeId(id, "id"), `Expected acceptance of: ${id}`);
  }
});
