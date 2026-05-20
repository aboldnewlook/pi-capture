/**
 * Verifies that the extension command handlers dispatch via pi.events
 * (the slash-subagent bridge) and do NOT call pi.sendUserMessage.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DEFAULT_LABELS, DEFAULT_POLICIES } from "../src/config/types.ts";

const SLASH_SUBAGENT_REQUEST_EVENT = "subagent:slash:request";

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-capture-ext-test-"));
  return fn(dir).finally(() => fs.rmSync(dir, { recursive: true }));
}

function writeConfig(dir: string, content: unknown): void {
  const piDir = path.join(dir, ".pi");
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(path.join(piDir, "pi-capture.json"), JSON.stringify(content));
}

/** Minimal ExtensionAPI mock that records calls. */
function makeMockPI() {
  const emitted: Array<{ channel: string; data: unknown }> = [];
  const sentMessages: string[] = [];
  const commands: Map<string, (args: string, ctx: unknown) => Promise<void>> = new Map();

  const pi = {
    events: {
      emit(channel: string, data: unknown) {
        emitted.push({ channel, data });
      },
      on(_channel: string, _handler: unknown) {
        return () => {};
      },
    },
    sendUserMessage(content: string) {
      sentMessages.push(content);
    },
    registerCommand(name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, def.handler);
    },
  };

  return { pi, emitted, sentMessages, commands };
}

function makeMockCtx(cwd: string) {
  return {
    cwd,
    hasUI: false,
    ui: { notify: () => {} },
  };
}

test("/capture dispatches via pi.events, does NOT call sendUserMessage", async () => {
  await withTempDir(async (dir) => {
    writeConfig(dir, {
      backend: "linear-cli",
      linear: { initiative: "abc" },
    });

    const { pi, emitted, sentMessages, commands } = makeMockPI();
    const { default: registerCaptureExtension } = await import("../src/extension/index.ts");
    registerCaptureExtension(pi as never);

    const handler = commands.get("capture");
    assert.ok(handler, "capture command must be registered");
    await handler("Search results crash when filters are empty", makeMockCtx(dir));

    assert.equal(sentMessages.length, 0, "/capture must NOT call sendUserMessage");
    assert.equal(emitted.length, 1, "/capture must emit exactly one event");
    assert.equal(emitted[0]!.channel, SLASH_SUBAGENT_REQUEST_EVENT);

    const payload = emitted[0]!.data as { requestId: string; params: Record<string, unknown> };
    assert.ok(typeof payload.requestId === "string" && payload.requestId.length > 0, "requestId must be set");
    assert.equal(payload.params.agent, "worker");
    assert.equal(payload.params.async, false, "/capture must be foreground (async: false)");
    assert.ok(typeof payload.params.task === "string", "task must be a string");
    assert.ok(
      (payload.params.task as string).includes("Search results crash"),
      "task must include the issue text",
    );
  });
});

test("/capture:async dispatches via pi.events with async:true, does NOT call sendUserMessage", async () => {
  await withTempDir(async (dir) => {
    writeConfig(dir, {
      backend: "linear-cli",
      linear: { initiative: "abc" },
    });

    const { pi, emitted, sentMessages, commands } = makeMockPI();
    const { default: registerCaptureExtension } = await import("../src/extension/index.ts");
    registerCaptureExtension(pi as never);

    const handler = commands.get("capture:async");
    assert.ok(handler, "capture:async command must be registered");
    await handler("Button label is cut off on mobile", makeMockCtx(dir));

    assert.equal(sentMessages.length, 0, "/capture:async must NOT call sendUserMessage");
    assert.equal(emitted.length, 1, "/capture:async must emit exactly one event");
    assert.equal(emitted[0]!.channel, SLASH_SUBAGENT_REQUEST_EVENT);

    const payload = emitted[0]!.data as { requestId: string; params: Record<string, unknown> };
    assert.equal(payload.params.async, true, "/capture:async must be async:true");
    assert.ok(
      (payload.params.task as string).includes("Button label is cut off"),
      "task must include the issue text",
    );
  });
});

test("/capture dispatched task does NOT contain inlined prompts file content", async () => {
  await withTempDir(async (dir) => {
    const piDir = path.join(dir, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    const secretContent = "SECRET_GUIDANCE_MUST_NOT_BE_INLINED_BY_EXTENSION";
    fs.writeFileSync(path.join(piDir, "prompts.md"), secretContent);

    writeConfig(dir, {
      backend: "linear-cli",
      linear: { initiative: "abc" },
      prompts: ["./.pi/prompts.md"],
    });

    const { pi, emitted, commands } = makeMockPI();
    const { default: registerCaptureExtension } = await import("../src/extension/index.ts");
    registerCaptureExtension(pi as never);

    const handler = commands.get("capture");
    assert.ok(handler, "capture command must be registered");
    await handler("some issue", makeMockCtx(dir));

    const payload = emitted[0]!.data as { params: { task: string } };
    assert.ok(
      !payload.params.task.includes(secretContent),
      "dispatched task must NOT contain inlined prompts file content",
    );
    assert.ok(
      payload.params.task.includes("./.pi/prompts.md"),
      "dispatched task must include the path reference",
    );
  });
});

test("/capture:triage uses sendUserMessage (v0.2 known — migrates in v0.3)", async () => {
  await withTempDir(async (dir) => {
    writeConfig(dir, {
      backend: "linear-cli",
      linear: { initiative: "abc" },
    });

    const { pi, emitted, sentMessages, commands } = makeMockPI();
    const { default: registerCaptureExtension } = await import("../src/extension/index.ts");
    registerCaptureExtension(pi as never);

    const handler = commands.get("capture:triage");
    assert.ok(handler, "capture:triage command must be registered");
    await handler("", makeMockCtx(dir));

    assert.equal(emitted.length, 0, "/capture:triage must NOT emit subagent events in v0.2");
    assert.equal(sentMessages.length, 1, "/capture:triage must use sendUserMessage in v0.2");
  });
});
