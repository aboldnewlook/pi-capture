import { spawnSync } from "node:child_process";
import type {
  IBackendAdapter,
  Issue,
  CreateIssueParams,
  MilestoneKind,
  ResolvedMilestone,
  ResolvedProject,
} from "./interface.ts";
import type { CaptureConfig } from "../config/types.ts";

const LINEAR_CLI = process.env.LINEAR_CLI_PATH ?? "linear";

// Allows: hex slugs, TEAM-NNN codes, UUIDs, underscore. Rejects any shell-special chars.
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;
export function assertSafeId(id: string, name: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(
      `Invalid Linear ${name} "${id}": only alphanumeric, hyphens, and underscores allowed`,
    );
  }
}

function run(args: string[]): string {
  const result = spawnSync(LINEAR_CLI, args, { encoding: "utf-8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = result.stderr?.trim();
    throw new Error(msg || `${LINEAR_CLI} ${args[0]} exited with status ${result.status}`);
  }
  return (result.stdout ?? "").trim();
}

function resolveQuarterTokens(pattern: string, date: Date, prefix?: string): string {
  const yy = String(date.getFullYear()).slice(-2);
  const q = String(Math.ceil((date.getMonth() + 1) / 3));
  return pattern
    .replace("{YY}", yy)
    .replace("{Q}", q)
    .replace("{XX}", prefix ?? "");
}

export class LinearCliAdapter implements IBackendAdapter {
  private readonly config: CaptureConfig;

  constructor(config: CaptureConfig) {
    this.config = config;
    this.assertInstalled();
  }

  private assertInstalled(): void {
    const result = spawnSync(LINEAR_CLI, ["team", "list"], { encoding: "utf-8" });
    if (result.error || result.status !== 0) {
      throw new Error(
        `linear CLI not found or not authenticated.\n` +
        `Install: https://github.com/schpet/linear-cli\n` +
        `Auth:    linear auth login`,
      );
    }
  }

  async resolveProject(date: Date = new Date()): Promise<ResolvedProject | null> {
    const targetName = resolveQuarterTokens(
      this.config.linear.projectPattern,
      date,
      this.config.linear.projectPrefix,
    );

    let output: string;
    try {
      output = run(["project", "list"]);
    } catch {
      return null;
    }

    for (const line of output.split("\n").slice(1)) {
      const cols = line.trim().split(/\s{2,}/);
      if (cols.length >= 2) {
        const slug = cols[0]!.trim();
        const name = cols[1]!.trim();
        if (name === targetName) {
          return { id: slug, name };
        }
      }
    }

    return null;
  }

  async resolveMilestone(projectId: string, kind: MilestoneKind, name?: string): Promise<ResolvedMilestone | null> {
    if (kind === "none") return null;

    assertSafeId(projectId, "projectId");

    const targetName = name ?? resolveQuarterTokens(
      this.config.linear.techDebtMilestone,
      new Date(),
      this.config.linear.projectPrefix,
    );

    let output: string;
    try {
      output = run(["milestone", "list", projectId]);
    } catch {
      return null;
    }

    for (const line of output.split("\n").slice(1)) {
      const cols = line.trim().split(/\s{2,}/);
      if (cols.length >= 2) {
        const id = cols[0]!.trim();
        const mname = cols[1]!.trim();
        if (mname === targetName) {
          return { id, name: mname };
        }
      }
    }

    if (kind === "tech-debt") {
      try {
        const created = run(["milestone", "create", "--project", projectId, "--name", targetName]);
        const match = created.match(/([a-f0-9-]{8,})/);
        if (match) return { id: match[1]!, name: targetName };
      } catch {
        return null;
      }
    }

    return null;
  }

  async createIssue(params: CreateIssueParams): Promise<string> {
    assertSafeId(params.projectId, "projectId");

    const args = [
      "issue", "create",
      "--project", params.projectId,
      "--title", params.title,
      "--description", params.body,
      "--no-interactive",
    ];

    for (const label of params.labels) {
      args.push("--label", label);
    }

    if (params.milestoneId) {
      assertSafeId(params.milestoneId, "milestoneId");
      args.push("--milestone", params.milestoneId);
    }

    const output = run(args);
    const match = output.match(/([A-Z]+-\d+)/);
    if (!match) throw new Error(`Could not parse issue ID from: ${output}`);
    return match[1]!;
  }

  async listTriageQueue(projectId: string, triageLabel: string): Promise<Issue[]> {
    assertSafeId(projectId, "projectId");

    let output: string;
    try {
      output = run(["issue", "list", "--project", projectId, "--label", triageLabel]);
    } catch {
      return [];
    }

    const issues: Issue[] = [];
    for (const line of output.split("\n").slice(1)) {
      const cols = line.trim().split(/\s{2,}/);
      if (cols.length >= 2) {
        issues.push({
          id: cols[0]!.trim(),
          title: cols[1]!.trim(),
          body: "",
          labels: [triageLabel],
          projectId,
          milestoneId: null,
          url: "",
        });
      }
    }
    return issues;
  }

  async updateIssue(id: string, patch: Partial<Pick<Issue, "title" | "labels" | "milestoneId">>): Promise<void> {
    assertSafeId(id, "issueId");

    const args = ["issue", "update", id];
    if (patch.title) args.push("--title", patch.title);
    if (patch.milestoneId) {
      assertSafeId(patch.milestoneId, "milestoneId");
      args.push("--milestone", patch.milestoneId);
    }
    run(args);
  }

  async addLabel(id: string, label: string): Promise<void> {
    assertSafeId(id, "issueId");
    run(["issue", "update", id, "--add-label", label]);
  }

  async removeLabel(id: string, label: string): Promise<void> {
    assertSafeId(id, "issueId");
    run(["issue", "update", id, "--remove-label", label]);
  }
}

export function resolveQuarterTokensPublic(pattern: string, date: Date, prefix?: string): string {
  return resolveQuarterTokens(pattern, date, prefix);
}
