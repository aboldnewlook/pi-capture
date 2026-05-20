import * as fs from "node:fs";
import * as path from "node:path";
import type { CaptureConfig } from "./types.ts";
import { DEFAULT_LABELS, DEFAULT_POLICIES } from "./types.ts";

const CONFIG_PATH = path.join(".pi", "pi-capture.json");

export interface ConfigLoadResult {
  config: CaptureConfig;
  configPath: string;
}

export interface ConfigLoadError {
  error: string;
  hint: string;
}

export function loadConfig(cwd: string): ConfigLoadResult | ConfigLoadError {
  const configPath = path.join(cwd, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    return {
      error: `No config found at ${CONFIG_PATH}`,
      hint: `Create ${CONFIG_PATH} in your repo root. See: https://github.com/aboldnewlook/pi-capture#configure`,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    return {
      error: `Failed to parse ${CONFIG_PATH}: ${e instanceof Error ? e.message : String(e)}`,
      hint: "Ensure the file is valid JSON.",
    };
  }

  return { config: normalize(raw as Record<string, unknown>), configPath };
}

function normalize(raw: Record<string, unknown>): CaptureConfig {
  if (raw.backend !== "linear-cli") {
    throw new Error(`Unsupported backend: "${raw.backend}". Only "linear-cli" is supported in v0.1.`);
  }

  const lin = (raw.linear ?? {}) as Record<string, unknown>;
  if (!lin.initiative || typeof lin.initiative !== "string") {
    throw new Error(`linear.initiative is required in ${CONFIG_PATH}`);
  }

  const rawLabels = (lin.labels ?? {}) as Record<string, unknown>;
  const labels = {
    ...DEFAULT_LABELS,
    ...Object.fromEntries(
      Object.entries(rawLabels).filter(([, v]) => typeof v === "string"),
    ),
  };

  const rawPolicies = (raw.policies ?? {}) as Record<string, unknown>;
  const policies = {
    ...DEFAULT_POLICIES,
    ...Object.fromEntries(
      Object.entries(rawPolicies).filter(([, v]) => typeof v === "boolean"),
    ),
  };

  return {
    backend: "linear-cli",
    linear: {
      initiative: lin.initiative,
      projectPattern: typeof lin.projectPattern === "string" ? lin.projectPattern : "[XX] Y{YY} Q{Q}",
      projectPrefix: typeof lin.projectPrefix === "string" ? lin.projectPrefix : undefined,
      techDebtMilestone: typeof lin.techDebtMilestone === "string" ? lin.techDebtMilestone : "Tech Debt Y{YY} Q{Q}",
      labels,
    },
    prompts: Array.isArray(raw.prompts) ? (raw.prompts as string[]).filter((p) => typeof p === "string") : [],
    policies,
  };
}

export function isConfigError(result: ConfigLoadResult | ConfigLoadError): result is ConfigLoadError {
  return "error" in result;
}
