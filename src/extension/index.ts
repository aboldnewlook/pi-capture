import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, isConfigError } from "../config/loader.ts";
import type { CaptureConfig } from "../config/types.ts";
import {
  buildCapturePrompt,
  buildAsyncCapturePrompt,
  buildTriagePrompt,
  type PromptContext,
} from "../classifier/prompts.ts";

// Event names from pi-subagents slash bridge.
// Used as strings to avoid a hard dependency on pi-subagents.
const SLASH_SUBAGENT_REQUEST_EVENT = "subagent:slash:request";

function makePromptContext(config: CaptureConfig, cwd: string): PromptContext {
  return { config, cwd };
}

function dispatchSubagent(
  pi: ExtensionAPI,
  task: string,
  opts: { async: boolean; model?: string },
): void {
  const requestId = randomUUID();
  pi.events.emit(SLASH_SUBAGENT_REQUEST_EVENT, {
    requestId,
    params: {
      agent: "worker",
      task,
      context: "fresh",
      async: opts.async,
      model: opts.model ?? "claude-sonnet-4-6",
    },
  });
}

export default function registerCaptureExtension(pi: ExtensionAPI): void {
  pi.registerCommand("capture", {
    description: "Classify and propose a Linear issue (recon runs in forked context): /capture <issue text>",
    handler: async (args, ctx) => {
      const issueText = args.trim();
      if (!issueText) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /capture <issue text>", "error");
        return;
      }

      const result = loadConfig(ctx.cwd);
      if (isConfigError(result)) {
        if (ctx.hasUI) ctx.ui.notify(`pi-capture: ${result.error}\n${result.hint}`, "error");
        return;
      }

      const promptCtx = makePromptContext(result.config, ctx.cwd);
      dispatchSubagent(pi, buildCapturePrompt(issueText, promptCtx), { async: false });
    },
  });

  pi.registerCommand("capture:async", {
    description: "Non-interactively classify and file an issue (fully async, tags needs-triage): /capture:async <issue text>",
    handler: async (args, ctx) => {
      const issueText = args.trim();
      if (!issueText) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /capture:async <issue text>", "error");
        return;
      }

      const result = loadConfig(ctx.cwd);
      if (isConfigError(result)) {
        if (ctx.hasUI) ctx.ui.notify(`pi-capture: ${result.error}\n${result.hint}`, "error");
        return;
      }

      const promptCtx = makePromptContext(result.config, ctx.cwd);
      dispatchSubagent(pi, buildAsyncCapturePrompt(issueText, promptCtx), { async: true });
    },
  });

  // /capture:triage keeps sendUserMessage for v0.2 — triage is an interactive
  // queue walk that requires bidirectional back-and-forth per issue. Migrating
  // it to a forked subagent context requires per-issue dispatch with intercom
  // bridge support, which is v0.3 work.
  pi.registerCommand("capture:triage", {
    description: "Walk the needs-triage Linear issue queue: /capture:triage",
    handler: async (_args, ctx) => {
      const result = loadConfig(ctx.cwd);
      if (isConfigError(result)) {
        if (ctx.hasUI) ctx.ui.notify(`pi-capture: ${result.error}\n${result.hint}`, "error");
        return;
      }

      const promptCtx = makePromptContext(result.config, ctx.cwd);
      pi.sendUserMessage(buildTriagePrompt(promptCtx));
    },
  });
}
