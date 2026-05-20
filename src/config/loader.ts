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

  try {
    return { config: normalize(raw as Record<string, unknown>), configPath };
  } catch (e) {
    return {
      error: `Invalid config in ${CONFIG_PATH}: ${e instanceof Error ? e.message : String(e)}`,
      hint: "Check the JSON against the schema at https://github.com/aboldnewlook/pi-capture/blob/main/pi-capture.schema.json",
    };
  }
}

function normalize(raw: Record<string, unknown>): CaptureConfig {
  if (raw.backend !== "linear-cli") {
    throw new Error(`Unsupported backend: "${raw.backend}". Only "linear-cli" is supported in v0.1.`);
  }

  if (!raw.linear || typeof raw.linear !== "object") {
    throw new Error(`linear config block is required when backend is "linear-cli"`);
  }

  const lin = raw.linear as Record<string, unknown>;
  if (!lin.initiative || typeof lin.initiative !== "string") {
    throw new Error(`linear.initiative is required and must be a string`);
  }

  const labels = { ...DEFAULT_LABELS };
  if (lin.labels !== undefined) {
    if (typeof lin.labels !== "object" || lin.labels === null) {
      throw new Error(`linear.labels must be an object`);
    }
    const rawLabels = lin.labels as Record<string, unknown>;
    const validKeys = Object.keys(DEFAULT_LABELS);
    for (const [key, value] of Object.entries(rawLabels)) {
      if (!validKeys.includes(key)) {
        throw new Error(`Unknown label key "${key}". Valid keys: ${validKeys.join(", ")}`);
      }
      if (typeof value !== "string") {
        throw new Error(`linear.labels.${key} must be a string, got ${typeof value}`);
      }
      (labels as Record<string, string>)[key] = value;
    }
  }

  const policies = { ...DEFAULT_POLICIES };
  if (raw.policies !== undefined) {
    if (typeof raw.policies !== "object" || raw.policies === null) {
      throw new Error(`policies must be an object`);
    }
    const rawPolicies = raw.policies as Record<string, unknown>;
    const validKeys = Object.keys(DEFAULT_POLICIES);
    for (const [key, value] of Object.entries(rawPolicies)) {
      if (!validKeys.includes(key)) {
        throw new Error(`Unknown policy key "${key}". Valid keys: ${validKeys.join(", ")}`);
      }
      if (typeof value !== "boolean") {
        throw new Error(`policies.${key} must be a boolean, got ${typeof value}`);
      }
      (policies as Record<string, boolean>)[key] = value;
    }
  }

  return {
    backend: "linear-cli",
    linear: {
      initiative: lin.initiative,
      projectPattern: typeof lin.projectPattern === "string" ? lin.projectPattern : "[XX] Y{YY} Q{Q}",
      projectPrefix: typeof lin.projectPrefix === "string" ? lin.projectPrefix : undefined,
      techDebtMilestone: typeof lin.techDebtMilestone === "string" ? lin.techDebtMilestone : "Tech Debt Y{YY} Q{Q}",
      labels,
    },
    prompts: Array.isArray(raw.prompts)
      ? (raw.prompts as unknown[]).map((p, i) => {
          if (typeof p !== "string") throw new Error(`prompts[${i}] must be a string`);
          return p;
        })
      : [],
    policies,
  };
}

export function isConfigError(result: ConfigLoadResult | ConfigLoadError): result is ConfigLoadError {
  return "error" in result;
}
