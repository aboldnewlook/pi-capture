import { execSync } from "node:child_process";
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

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
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
  constructor(private readonly config: CaptureConfig) {
    this.assertInstalled();
  }

  private assertInstalled(): void {
    try {
      run(`${LINEAR_CLI} team list 2>&1 | head -1`);
    } catch {
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
      output = run(`${LINEAR_CLI} project list`);
    } catch {
      return null;
    }

    // Output format: SLUG  NAME  STATUS  ...
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

    const targetName = name ?? resolveQuarterTokens(
      this.config.linear.techDebtMilestone,
      new Date(),
      this.config.linear.projectPrefix,
    );

    let output: string;
    try {
      // linear milestone list is unconfirmed in the CLI — fall back gracefully
      output = run(`${LINEAR_CLI} milestone list ${projectId} 2>/dev/null`);
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

    // Tech Debt milestone may be auto-created per conservative policy
    if (kind === "tech-debt") {
      try {
        const created = run(
          `${LINEAR_CLI} milestone create --project ${projectId} --name ${JSON.stringify(targetName)}`,
        );
        // Expect "Created milestone: <id>" or similar
        const match = created.match(/([a-f0-9-]{8,})/);
        if (match) return { id: match[1]!, name: targetName };
      } catch {
        // Non-fatal — the agent prompt includes a fallback note
        return null;
      }
    }

    return null;
  }

  async createIssue(params: CreateIssueParams): Promise<string> {
    const labelFlags = params.labels.map((l) => `--label ${JSON.stringify(l)}`).join(" ");
    const milestoneFlag = params.milestoneId ? `--milestone ${params.milestoneId}` : "";

    const cmd = [
      LINEAR_CLI,
      "issue create",
      `--project ${params.projectId}`,
      `--title ${JSON.stringify(params.title)}`,
      `--description ${JSON.stringify(params.body)}`,
      labelFlags,
      milestoneFlag,
    ].filter(Boolean).join(" ");

    const output = run(cmd);
    // Expect "Created issue: ABNL-42\nhttps://..." or just the URL
    const match = output.match(/([A-Z]+-\d+)/);
    if (!match) throw new Error(`Could not parse issue ID from: ${output}`);
    return match[1]!;
  }

  async listTriageQueue(projectId: string, triageLabel: string): Promise<Issue[]> {
    let output: string;
    try {
      output = run(
        `${LINEAR_CLI} issue list --project ${projectId} --label ${JSON.stringify(triageLabel)}`,
      );
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
    const parts: string[] = [`${LINEAR_CLI} issue update ${id}`];
    if (patch.title) parts.push(`--title ${JSON.stringify(patch.title)}`);
    if (patch.milestoneId) parts.push(`--milestone ${patch.milestoneId}`);
    run(parts.join(" "));
  }

  async addLabel(id: string, label: string): Promise<void> {
    run(`${LINEAR_CLI} issue update ${id} --add-label ${JSON.stringify(label)}`);
  }

  async removeLabel(id: string, label: string): Promise<void> {
    run(`${LINEAR_CLI} issue update ${id} --remove-label ${JSON.stringify(label)}`);
  }
}

export function resolveQuarterTokensPublic(pattern: string, date: Date, prefix?: string): string {
  return resolveQuarterTokens(pattern, date, prefix);
}
