import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, isConfigError } from "../config/loader.ts";
import type { CaptureConfig } from "../config/types.ts";
import { LinearCliAdapter } from "../adapter/linear-cli.ts";
import {
  buildCapturePrompt,
  buildAsyncCapturePrompt,
  buildTriagePrompt,
  type PromptContext,
} from "../classifier/prompts.ts";

async function resolveContext(config: CaptureConfig, cwd: string): Promise<PromptContext> {
  let project = null;
  if (config.backend === "linear-cli") {
    const adapter = new LinearCliAdapter(config); // throws loudly if CLI missing or unauthed
    try {
      project = await adapter.resolveProject();
    } catch {
      // project resolution is non-fatal — agent falls back to projectPattern in prompt
    }
  }
  return { config, cwd, project };
}

export default function registerCaptureExtension(pi: ExtensionAPI): void {
  pi.registerCommand("capture", {
    description: "Interactively classify and file an issue to Linear: /capture <issue text>",
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

      const promptCtx = await resolveContext(result.config, ctx.cwd);
      pi.sendUserMessage(buildCapturePrompt(issueText, promptCtx));
    },
  });

  pi.registerCommand("capture:async", {
    description: "Non-interactively file an issue to Linear (tagged needs-triage): /capture:async <issue text>",
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

      const promptCtx = await resolveContext(result.config, ctx.cwd);
      pi.sendUserMessage(buildAsyncCapturePrompt(issueText, promptCtx));
    },
  });

  pi.registerCommand("capture:triage", {
    description: "Walk the needs-triage Linear issue queue: /capture:triage",
    handler: async (_args, ctx) => {
      const result = loadConfig(ctx.cwd);
      if (isConfigError(result)) {
        if (ctx.hasUI) ctx.ui.notify(`pi-capture: ${result.error}\n${result.hint}`, "error");
        return;
      }

      const promptCtx = await resolveContext(result.config, ctx.cwd);
      pi.sendUserMessage(buildTriagePrompt(promptCtx));
    },
  });
}
