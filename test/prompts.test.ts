import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildCapturePrompt, buildAsyncCapturePrompt, buildTriagePrompt } from "../src/classifier/prompts.ts";
import { DEFAULT_LABELS, DEFAULT_POLICIES } from "../src/config/types.ts";
import type { CaptureConfig } from "../src/config/types.ts";

const BASE_CONFIG: CaptureConfig = {
  backend: "linear-cli",
  linear: {
    initiative: "7f9450f97e50",
    projectPattern: "[BC] Y{YY} Q{Q}",
    projectPrefix: "BC",
    techDebtMilestone: "Tech Debt Y{YY} Q{Q}",
    labels: DEFAULT_LABELS,
  },
  prompts: [],
  policies: DEFAULT_POLICIES,
};

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-capture-prompts-test-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

test("capture prompt includes issue text verbatim", () => {
  withTempDir((dir) => {
    const issueText = "Search results crash when all filters are empty";
    const prompt = buildCapturePrompt(issueText, { config: BASE_CONFIG, cwd: dir });
    assert.ok(prompt.includes(issueText), "prompt must include verbatim issue text");
  });
});

test("capture prompt includes linear config summary", () => {
  withTempDir((dir) => {
    const prompt = buildCapturePrompt("test issue", { config: BASE_CONFIG, cwd: dir });
    assert.ok(prompt.includes("Linear config:"), "prompt must include linear config");
    assert.ok(prompt.includes("needs-triage"), "prompt must include triage label");
  });
});

test("capture prompt does NOT inline prompts file content", () => {
  withTempDir((dir) => {
    const piDir = path.join(dir, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    const secretContent = "SECRET_PROJECT_GUIDANCE_DO_NOT_INLINE";
    fs.writeFileSync(path.join(piDir, "guidance.md"), secretContent);
    const config = { ...BASE_CONFIG, prompts: ["./.pi/guidance.md"] };
    const prompt = buildCapturePrompt("test issue", { config, cwd: dir });
    assert.ok(!prompt.includes(secretContent), "prompt must NOT inline prompts file content");
    assert.ok(prompt.includes("./.pi/guidance.md"), "prompt must include the path reference");
  });
});

test("capture prompt with prompts paths includes read directive", () => {
  withTempDir((dir) => {
    const config = { ...BASE_CONFIG, prompts: ["./.pi/capture-prompts.md"] };
    const prompt = buildCapturePrompt("test issue", { config, cwd: dir });
    assert.ok(
      prompt.includes("read project-specific guidance"),
      "prompt must include directive to read guidance files",
    );
    assert.ok(prompt.includes("./.pi/capture-prompts.md"), "prompt must include the path");
  });
});

test("capture prompt with no prompts paths omits read directive", () => {
  withTempDir((dir) => {
    const prompt = buildCapturePrompt("test issue", { config: BASE_CONFIG, cwd: dir });
    assert.ok(
      !prompt.includes("read project-specific guidance"),
      "prompt without prompts must not include read directive",
    );
  });
});

test("async prompt includes issue text verbatim", () => {
  withTempDir((dir) => {
    const issueText = "Button label is cut off on mobile";
    const prompt = buildAsyncCapturePrompt(issueText, { config: BASE_CONFIG, cwd: dir });
    assert.ok(prompt.includes(issueText), "async prompt must include verbatim issue text");
  });
});

test("async prompt includes NEVER conservative rules", () => {
  withTempDir((dir) => {
    const prompt = buildAsyncCapturePrompt("test issue", { config: BASE_CONFIG, cwd: dir });
    assert.ok(prompt.includes("NEVER"), "async prompt must include conservative rules");
  });
});

test("async prompt includes triage label", () => {
  withTempDir((dir) => {
    const prompt = buildAsyncCapturePrompt("test issue", { config: BASE_CONFIG, cwd: dir });
    assert.ok(prompt.includes("needs-triage"), "async prompt must mention triage label");
  });
});

test("async prompt does NOT inline prompts file content", () => {
  withTempDir((dir) => {
    const piDir = path.join(dir, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    const secretContent = "SECRET_ASYNC_GUIDANCE_DO_NOT_INLINE";
    fs.writeFileSync(path.join(piDir, "guidance.md"), secretContent);
    const config = { ...BASE_CONFIG, prompts: ["./.pi/guidance.md"] };
    const prompt = buildAsyncCapturePrompt("test issue", { config, cwd: dir });
    assert.ok(!prompt.includes(secretContent), "async prompt must NOT inline prompts file content");
    assert.ok(prompt.includes("./.pi/guidance.md"), "async prompt must include the path reference");
  });
});

test("triage prompt includes triage label", () => {
  withTempDir((dir) => {
    const prompt = buildTriagePrompt({ config: BASE_CONFIG, cwd: dir });
    assert.ok(prompt.includes("needs-triage"), "triage prompt must include triage label");
  });
});
