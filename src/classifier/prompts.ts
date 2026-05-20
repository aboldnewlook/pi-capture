import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { CaptureConfig } from "../config/types.ts";
import type { ResolvedProject } from "../adapter/interface.ts";

function recentCommits(cwd: string): string {
  const result = spawnSync("git", ["-C", cwd, "log", "--oneline", "-20"], { encoding: "utf-8" });
  if (result.error || result.status !== 0) return "";
  const out = (result.stdout ?? "").trim();
  return out ? `Recent commits:\n${out}` : "";
}

function specsLayout(cwd: string): string {
  const specsDir = path.join(cwd, "specs");
  if (!fs.existsSync(specsDir)) return "";
  const entries = fs.readdirSync(specsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `  ${e.name}/`)
    .join("\n");
  return entries ? `Specs layout:\n${entries}` : "";
}

function adrIndex(cwd: string): string {
  const indexPath = path.join(cwd, "docs", "adr", "README.md");
  if (!fs.existsSync(indexPath)) return "";
  const content = fs.readFileSync(indexPath, "utf-8").split("\n").slice(0, 30).join("\n");
  return `ADR index (first 30 lines of docs/adr/README.md):\n${content}`;
}

function customPrompts(config: CaptureConfig, cwd: string): string {
  const parts: string[] = [];
  for (const promptPath of config.prompts) {
    const abs = path.resolve(cwd, promptPath);
    if (fs.existsSync(abs)) {
      parts.push(`--- ${promptPath} ---\n${fs.readFileSync(abs, "utf-8").trim()}`);
    }
  }
  return parts.length > 0 ? `Project-specific guidance:\n\n${parts.join("\n\n")}` : "";
}

function quarterLabel(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `Y${yy} Q${q}`;
}

function configSummary(config: CaptureConfig, project: ResolvedProject | null): string {
  const { labels, techDebtMilestone, projectPattern, projectPrefix } = config.linear;
  const resolvedProject = project
    ? `${project.name} (id: ${project.id})`
    : `(not yet resolved — use pattern: ${projectPattern.replace("{XX}", projectPrefix ?? "XX")})`;
  const techDebt = techDebtMilestone
    .replace("{YY}", String(new Date().getFullYear()).slice(-2))
    .replace("{Q}", String(Math.ceil((new Date().getMonth() + 1) / 3)))
    .replace("{XX}", projectPrefix ?? "");

  return `Linear config:
- Current quarter: ${quarterLabel()}
- Project: ${resolvedProject}
- Tech Debt milestone: "${techDebt}"
- Labels: bug="${labels.bug}", tech-debt="${labels.techDebt}", feature="${labels.feature}", spec-gap="${labels.specGap}"
- Triage label: "${labels.triage}"`;
}

export interface PromptContext {
  config: CaptureConfig;
  cwd: string;
  project: ResolvedProject | null;
}

export function buildCapturePrompt(issueText: string, ctx: PromptContext): string {
  const { config, cwd, project } = ctx;
  const { policies } = config;

  const sections = [
    `You are helping file an issue into Linear for this project.`,
    configSummary(config, project),
    customPrompts(config, cwd),
    recentCommits(cwd),
    specsLayout(cwd),
    adrIndex(cwd),
    `Issue text from user:\n${issueText}`,
    `Your task:
1. Classify the issue as one of: bug | tech-debt | feature | spec-gap
   - If the text is ambiguous, ask ONE clarifying question before classifying.
2. Propose:
   - A concise, imperative title
   - The appropriate label (from the config above)
   - Milestone: for bug/tech-debt → Tech Debt milestone; for feature/spec-gap → propose a named milestone in conversation if warranted, or none
   - For feature issues: propose a spec stub path (e.g. specs/000-product/f-<slug>/) if the scope warrants it
3. Present your classification and proposal to the owner for ack. They can adjust title, label, milestone, or spec stub.
4. On ack, file the issue using the linear CLI:
   \`\`\`
   # Resolve project if needed
   linear project list

   # For bug/tech-debt — check/create Tech Debt milestone:
   linear milestone list <projectId>
   # If not found: linear milestone create --project <projectId> --name "<techDebtMilestoneName>"

   # Create the issue:
   linear issue create \\
     --project <projectId> \\
     --title "<title>" \\
     --description "<body>" \\
     --label "<label>" \\
     ${policies.asyncMayCreateMilestone ? '' : '# (only for bug/tech-debt) '}--milestone <milestoneId>
   \`\`\`
5. The issue body must include:
   ## Original capture
   <verbatim issue text>
   ## Classification
   <kind and one-sentence reasoning>
6. If the owner approved a spec stub, create the file:
   specs/000-product/f-<slug>/spec.md
   with the issue text as raw input under a "## Raw capture" heading.
7. Report the created Linear issue ID (e.g. ABNL-42) and any files created.

If \`linear milestone\` is not a supported subcommand, omit the milestone from the create call and add a body checklist item: \`- [ ] Add to Tech Debt milestone in Linear\`.`,
  ].filter(Boolean).join("\n\n");

  return sections;
}

export function buildAsyncCapturePrompt(issueText: string, ctx: PromptContext): string {
  const { config, cwd, project } = ctx;
  const { policies } = config;

  const sections = [
    `You are filing an issue into Linear for this project without interaction. Execute immediately — do NOT ask the user any questions.`,
    configSummary(config, project),
    customPrompts(config, cwd),
    recentCommits(cwd),
    specsLayout(cwd),
    `Issue text from user:\n${issueText}`,
    `Your task (non-interactive — complete without prompting):
1. Classify the issue as: bug | tech-debt | feature | spec-gap
2. Write a concise, imperative title.
3. Build the issue body in this format:
   ## Original capture
   <verbatim issue text>
   ## Classification
   <kind> — <one-sentence reasoning>
   ## Proposed actions
   <checklist of things you could NOT do autonomously, e.g.:>
   ${!policies.asyncMayCreateMilestone ? '- [ ] Create named milestone: <name>  (if a non-Tech-Debt milestone is warranted)' : ''}
   ${!policies.asyncMayStubSpec ? '- [ ] Stub spec at specs/000-product/f-<slug>/  (if feature warrants it)' : ''}
4. File the issue using the linear CLI:
   \`\`\`
   # Find current-quarter project
   linear project list

   # For bug or tech-debt ONLY — ensure Tech Debt milestone exists (you MAY create this one):
   linear milestone list <projectId>
   # If not found: linear milestone create --project <projectId> --name "<techDebtMilestoneName>"

   # Create the issue (always include the triage label):
   linear issue create \\
     --project <projectId> \\
     --title "<title>" \\
     --description "<body>" \\
     --label "<classifiedLabel>" \\
     --label "${config.linear.labels.triage}"
   # Add --milestone <id> only for bug/tech-debt
   \`\`\`
5. Report the created issue ID (e.g. ABNL-42).

Conservative rules — NEVER break these:
- Never create labels. Use only: ${Object.values(config.linear.labels).join(", ")}
- Never create a named milestone autonomously${!policies.asyncMayCreateMilestone ? ' — propose in body checklist only' : ''}
- Never create spec stub files autonomously${!policies.asyncMayStubSpec ? ' — propose in body checklist only' : ''}
- Always add the triage label ("${config.linear.labels.triage}") to every issue you file
- If \`linear milestone\` is unsupported, skip the milestone and add a checklist item in the body
- Do NOT ask questions — classify and file immediately`,
  ].filter(Boolean).join("\n\n");

  return sections;
}

export function buildTriagePrompt(ctx: PromptContext): string {
  const { config, cwd, project } = ctx;

  const sections = [
    `You are triaging the needs-triage queue in Linear for this project.`,
    configSummary(config, project),
    customPrompts(config, cwd),
    specsLayout(cwd),
    `Your task:
1. Fetch the triage queue:
   \`\`\`
   linear issue list --project <projectId> --label "${config.linear.labels.triage}"
   \`\`\`
2. For each issue (one at a time), show the owner:
   - Issue ID + title
   - Label
   - Body (summarized, with the "## Proposed actions" checklist visible)
3. Ask the owner what to do. Options:
   - **accept** — remove the triage label (issue is correctly classified and filed)
   - **rename** — update the title
   - **relabel** — change the label to: ${Object.values(config.linear.labels).join(" | ")}
   - **milestone** — assign to a milestone (ask for the name; create if needed)
   - **stub-spec** — create specs/000-product/f-<slug>/spec.md with the issue body as raw input
   - **duplicate** — cancel the issue and reference the canonical one
   - **skip** — leave as-is and move to the next

4. Execute the approved action using the linear CLI:
   \`\`\`
   # Accept:
   linear issue update <id> --remove-label "${config.linear.labels.triage}"

   # Rename:
   linear issue update <id> --title "<new title>"

   # Relabel:
   linear issue update <id> --remove-label "<old>" --add-label "<new>"

   # Milestone (find or create):
   linear milestone list <projectId>
   linear milestone create --project <projectId> --name "<name>"
   linear issue update <id> --milestone <milestoneId>

   # Duplicate:
   linear issue update <id> --state canceled
   linear issue comment add <id> -b "Duplicate of <canonicalId>"

   # Stub spec:
   # Create the file, then accept the issue
   \`\`\`
5. After each action, confirm with the owner and move to the next issue.
6. Stop when all issues are processed or the owner says stop.
7. Report a summary: N accepted, N relabeled, N milestoned, N specced, N duplicates closed.

If there are no issues in the triage queue, report that and stop.`,
  ].filter(Boolean).join("\n\n");

  return sections;
}
