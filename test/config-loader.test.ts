import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, isConfigError } from "../src/config/loader.ts";
import { DEFAULT_LABELS, DEFAULT_POLICIES } from "../src/config/types.ts";

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-capture-test-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

function writeConfig(dir: string, content: unknown): void {
  const piDir = path.join(dir, ".pi");
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(path.join(piDir, "pi-capture.json"), JSON.stringify(content));
}

test("returns error when no config file exists", () => {
  withTempDir((dir) => {
    const result = loadConfig(dir);
    assert.ok(isConfigError(result));
    assert.ok(result.error.includes("No config found"));
  });
});

test("returns error when JSON is malformed", () => {
  withTempDir((dir) => {
    const piDir = path.join(dir, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    fs.writeFileSync(path.join(piDir, "pi-capture.json"), "{ bad json");
    const result = loadConfig(dir);
    assert.ok(isConfigError(result));
    assert.ok(result.error.includes("Failed to parse"));
  });
});

test("returns error when backend is missing", () => {
  withTempDir((dir) => {
    writeConfig(dir, { linear: { initiative: "abc123" } });
    const result = loadConfig(dir);
    assert.ok(isConfigError(result), "Expected config error for missing backend");
    assert.ok(result.error.includes("Invalid config"));
  });
});

test("normalizes minimal valid config with defaults", () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      backend: "linear-cli",
      linear: { initiative: "7f9450f97e50" },
    });
    const result = loadConfig(dir);
    assert.ok(!isConfigError(result), isConfigError(result) ? result.error : "");
    const { config } = result;
    assert.equal(config.backend, "linear-cli");
    assert.equal(config.linear.initiative, "7f9450f97e50");
    assert.equal(config.linear.projectPattern, "[XX] Y{YY} Q{Q}");
    assert.equal(config.linear.techDebtMilestone, "Tech Debt Y{YY} Q{Q}");
    assert.deepEqual(config.linear.labels, DEFAULT_LABELS);
    assert.deepEqual(config.policies, DEFAULT_POLICIES);
    assert.deepEqual(config.prompts, []);
  });
});

test("merges partial labels over defaults", () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      backend: "linear-cli",
      linear: {
        initiative: "abc",
        labels: { bug: "defect", triage: "pending-triage" },
      },
    });
    const result = loadConfig(dir);
    assert.ok(!isConfigError(result));
    const { labels } = result.config.linear;
    assert.equal(labels.bug, "defect");
    assert.equal(labels.triage, "pending-triage");
    assert.equal(labels.feature, DEFAULT_LABELS.feature);
  });
});

test("merges partial policies over defaults", () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      backend: "linear-cli",
      linear: { initiative: "abc" },
      policies: { asyncMayCreateMilestone: true },
    });
    const result = loadConfig(dir);
    assert.ok(!isConfigError(result));
    const { policies } = result.config;
    assert.equal(policies.asyncMayCreateMilestone, true);
    assert.equal(policies.asyncMayStubSpec, false);
    assert.equal(policies.asyncMayCreateLabels, false);
  });
});

test("classifier prompt includes issue text verbatim", async () => {
  const { buildAsyncCapturePrompt } = await import("../src/classifier/prompts.ts");
  withTempDir((dir) => {
    const config = {
      backend: "linear-cli" as const,
      linear: {
        initiative: "abc",
        projectPattern: "[BC] Y{YY} Q{Q}",
        projectPrefix: "BC",
        techDebtMilestone: "Tech Debt Y{YY} Q{Q}",
        labels: DEFAULT_LABELS,
      },
      prompts: [],
      policies: DEFAULT_POLICIES,
    };
    const issueText = "Search results crash when all filters are empty";
    const prompt = buildAsyncCapturePrompt(issueText, { config, cwd: dir, project: null });
    assert.ok(prompt.includes(issueText), "prompt must include verbatim issue text");
    assert.ok(prompt.includes("needs-triage"), "async prompt must mention triage label");
    assert.ok(prompt.includes("NEVER"), "async prompt must include conservative rules");
  });
});
