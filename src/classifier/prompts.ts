import type { CaptureConfig } from "../config/types.ts";

function quarterLabel(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `Y${yy} Q${q}`;
}

function configSummary(config: CaptureConfig): string {
  const { labels, techDebtMilestone, projectPattern, projectPrefix } = config.linear;
  const yy = String(new Date().getFullYear()).slice(-2);
  const q = String(Math.ceil((new Date().getMonth() + 1) / 3));
  const techDebt = techDebtMilestone
    .replace("{YY}", yy)
    .replace("{Q}", q)
    .replace("{XX}", projectPrefix ?? "");
  return `Linear config:
- Current quarter: ${quarterLabel()}
- Project: (not yet resolved — use pattern: ${projectPattern.replace("{XX}", projectPrefix ?? "XX")})
- Tech Debt milestone: "${techDebt}"
- Labels: bug="${labels.bug}", tech-debt="${labels.techDebt}", feature="${labels.feature}", spec-gap="${labels.specGap}"
- Triage label: "${labels.triage}"`;
}

/**
 * Returns a directive telling the subagent to read project-specific guidance
 * from disk rather than receiving it inline. Paths come from pi-capture.json.
 */
function promptPathsDirective(prompts: string[]): string {
  if (prompts.length === 0) return "";
  const list = prompts.map((p) => `  - ${p}`).join("\n");
  return `Before classifying, read project-specific guidance from these files in the repo:\n${list}\nFollow any internal references those files name (e.g. AGENTS.md sections, ADR index, spec directories) as needed.`;
}

export interface PromptContext {
  config: CaptureConfig;
  cwd: string;
}

export function buildCapturePrompt(issueText: string, ctx: PromptContext): string {
  const { config } = ctx;

  return [
    "You are helping classify and propose a Linear issue for this project. Do NOT file yet — produce a proposal only.",
    configSummary(config),
    promptPathsDirective(config.prompts),
    `Issue text from user:\n${issueText}`,
    `Your task:
1. ${config.prompts.length > 0 ? "Read the project-specific guidance files listed above first." : ""}
   Classify the issue as one of: bug | tech-debt | feature | spec-gap
   - If the text is ambiguous, ask ONE clarifying question before classifying.
2. Gather repo context as needed: recent \`git log --oneline -20\`, skim specs/ and docs/adr/README.md,
   grep for relevant call sites. Grep first; never guess file locations.
3. Draft the issue body (save it to /tmp/capture-<slug>.md) using this structure:
   ## Original capture
   <verbatim issue text>
   ## Analysis
   <surface affected, files/components involved, relevant journey/epic>
   ## Acceptance
   - [ ] <criterion 1>
   - [ ] Unit / Vitest test added or updated
   - [ ] (UI) Playwright journey suite extended
4. Propose to the owner:
   - Title (concise, imperative)
   - Kind: <bug|tech-debt|feature|spec-gap>
   - Label, project, milestone, priority, parent epic (if any)
   - For features: proposed spec stub path if scope warrants it
5. End your response with exactly this block so the orchestrator knows how to proceed:
   ---
   CAPTURE PROPOSAL
   bodyPath: /tmp/capture-<slug>.md
   title: <title>
   label: <label>
   project: <projectId or pattern>
   milestone: <milestoneId or "none">
   priority: <1-4>
   parent: <ABNL-NN or "none">
   ---
   AWAIT ACK: Owner must reply "y" (or adjustments) before filing.`,
  ].filter(Boolean).join("\n\n");
}

export function buildAsyncCapturePrompt(issueText: string, ctx: PromptContext): string {
  const { config } = ctx;
  const { policies } = config;

  return [
    "You are filing an issue into Linear for this project without interaction. Execute immediately — do NOT ask the user any questions.",
    configSummary(config),
    promptPathsDirective(config.prompts),
    `Issue text from user:\n${issueText}`,
    `Your task (non-interactive — complete without prompting):
1. ${config.prompts.length > 0 ? "Read the project-specific guidance files listed above first." : ""}
   Classify the issue as: bug | tech-debt | feature | spec-gap.
2. Gather repo context: \`git log --oneline -20\`, skim specs/ and docs/adr/README.md if present.
3. Write a concise, imperative title.
4. Build the issue body (write to /tmp/capture-<slug>.md):
   ## Original capture
   <verbatim issue text>
   ## Classification
   <kind> — <one-sentence reasoning>
   ## Proposals (for triage)
   ${!policies.asyncMayCreateMilestone ? "- [ ] Propose milestone: <name>  (if a non-Tech-Debt milestone is warranted)" : ""}
   ${!policies.asyncMayStubSpec ? "- [ ] Stub spec at specs/000-product/f-<slug>/  (if feature warrants it)" : ""}
5. File the issue:
   \`\`\`
   # Find current-quarter project
   linear project list

   # For bug/tech-debt ONLY — ensure Tech Debt milestone exists (you MAY create this one):
   linear milestone list --project <projectId>
   # If not found: linear milestone create --project <projectId> --name "<techDebtMilestoneName>"

   # Create the issue:
   linear issue create \\
     --project <projectId> \\
     --title "<title>" \\
     --description-file /tmp/capture-<slug>.md \\
     --label "<classifiedLabel>" \\
     --label "${config.linear.labels.triage}" \\
     --no-interactive
   # Add --milestone <id> only for bug/tech-debt
   \`\`\`
6. Report the created issue ID (e.g. ABNL-42).

Conservative rules — NEVER break these:
- NEVER create labels. Use only: ${Object.values(config.linear.labels).join(", ")}
- NEVER create a named milestone${!policies.asyncMayCreateMilestone ? " — propose in body checklist only" : ""}
- NEVER create spec stub files${!policies.asyncMayStubSpec ? " — propose in body checklist only" : ""}
- ALWAYS add the triage label ("${config.linear.labels.triage}") to every issue you file
- Do NOT ask questions — classify and file immediately`,
  ].filter(Boolean).join("\n\n");
}

export function buildTriagePrompt(ctx: PromptContext): string {
  const { config } = ctx;

  return [
    "You are triaging the needs-triage queue in Linear for this project.",
    configSummary(config),
    promptPathsDirective(config.prompts),
    `Your task:
1. Fetch the triage queue:
   \`\`\`
   linear project list
   linear issue list --project <projectId> --label "${config.linear.labels.triage}"
   \`\`\`
2. For each issue (one at a time), show the owner:
   - Issue ID + title
   - Label
   - Body (summarized, with the "## Proposals (for triage)" checklist visible)
3. Ask the owner what to do. Options:
   - **accept** — remove the triage label (issue is correctly classified and filed)
   - **rename** — update the title
   - **relabel** — change the label to: ${Object.values(config.linear.labels).join(" | ")}
   - **milestone** — assign to a milestone (ask for the name; create if needed)
   - **stub-spec** — create specs/000-product/f-<slug>/spec.md with the issue body as raw input
   - **duplicate** — cancel the issue and reference the canonical one
   - **skip** — leave as-is and move to the next
4. Execute the approved action:
   \`\`\`
   # Accept:
   linear issue update <id> --remove-label "${config.linear.labels.triage}"
   # Rename:
   linear issue update <id> --title "<new title>"
   # Relabel:
   linear issue update <id> --remove-label "<old>" --add-label "<new>"
   # Milestone:
   linear milestone list --project <projectId>
   linear milestone create --project <projectId> --name "<name>"
   linear issue update <id> --milestone <milestoneId>
   # Duplicate:
   linear issue update <id> --state canceled
   linear issue comment add <id> -b "Duplicate of <canonicalId>"
   \`\`\`
5. After each action, confirm and move to the next issue.
6. Stop when all issues are processed or the owner says stop.
7. Report a summary: N accepted, N relabeled, N milestoned, N specced, N duplicates closed.

If there are no issues in the triage queue, report that and stop.`,
  ].filter(Boolean).join("\n\n");
}
