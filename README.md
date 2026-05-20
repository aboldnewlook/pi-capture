# pi-capture

A [Pi coding agent](https://pi.ai) extension for capturing issues, bugs, tech-debt items, and feature requests directly from conversation and filing them into Linear (or other configured backends).

## Commands

| Command | Mode | Description |
|---|---|---|
| `/capture <text>` | Interactive | Classify, propose, owner-ack, file |
| `/capture:async <text>` | Non-interactive | Classify and file immediately, tagged `needs-triage` |
| `/capture:triage` | Interactive | Walk the `needs-triage` queue |

## Install

```bash
npx pi-capture
```

This clones the extension into `~/.pi/agent/extensions/pi-capture/` and makes the three commands available in Pi.

To remove:

```bash
npx pi-capture --remove
```

## Configure

Add `.pi/pi-capture.json` to your repo root:

```jsonc
{
  "backend": "linear-cli",
  "linear": {
    "initiative": "7f9450f97e50",       // your Linear initiative slug
    "projectPattern": "[BC] Y{YY} Q{Q}", // {YY}=2-digit year, {Q}=quarter, {XX}=prefix
    "projectPrefix": "BC",              // replaces {XX} in the pattern
    "techDebtMilestone": "Tech Debt Y{YY} Q{Q}",
    "labels": {
      "bug": "bug",
      "techDebt": "tech-debt",
      "feature": "feature",
      "specGap": "spec-gap",
      "triage": "needs-triage",
      "ownerReview": "owner-review"
    }
  },
  "prompts": [
    ".pi/pi-capture-prompts.md"         // optional: project-specific classifier guidance
  ],
  "policies": {
    "asyncMayCreateMilestone": false,   // async never creates milestones (default)
    "asyncMayStubSpec": false,          // async never creates spec stubs (default)
    "asyncMayCreateLabels": false       // async never creates new labels (default)
  }
}
```

JSON Schema: [`pi-capture.schema.json`](./pi-capture.schema.json)

### Token reference

| Token | Resolves to |
|---|---|
| `{YY}` | 2-digit year (e.g. `26` for 2026) |
| `{Q}` | Quarter number (1–4) |
| `{XX}` | The `projectPrefix` value |

### Custom prompts

The `prompts` array points at markdown files loaded into every capture prompt. Use them for project-specific guidance the classifier should know:

- F-/T-* slug naming conventions
- Persona model (who the users are)
- §13 Linear workflow rules (e.g., "sub-issues = one per agent dispatch")
- Milestoning preferences

```markdown
<!-- .pi/pi-capture-prompts.md -->
## Project taxonomy

- **feature**: something that adds to the product (file under a F-* epic if one exists)
- **spec-gap**: a missing or wrong spec (stub under specs/000-product/f-<slug>/)
- **tech-debt**: anything that slows development without adding user value
- **bug**: broken behavior the user can observe

## Issue titles
Imperative, concise, no trailing period. Examples:
- "Fix crash when all search filters are empty"
- "Add phone verification to provider onboarding"
- "Migrate auth to magic-link (ADR-0018)"
```

## How it works

Each command loads `.pi/pi-capture.json`, pre-fetches the current-quarter Linear project (via the `linear` CLI), reads recent git commits and specs layout for context, and injects a structured prompt into the Pi conversation via `pi.sendUserMessage()`. The Pi agent then executes the prompt using its available tools (including the `linear` CLI via bash).

### `/capture` (interactive)

1. Agent classifies the issue.
2. May ask one clarifying question if ambiguous.
3. Proposes title, label, milestone, and (for features) a spec stub path.
4. Owner acks or adjusts.
5. Agent files the issue and optionally creates the spec stub.

### `/capture:async` (non-interactive)

1. Agent classifies immediately, no questions asked.
2. Files the issue with the `needs-triage` label.
3. Conservative scope — everything the agent *could not* create autonomously becomes a checklist item in the issue body for `/capture:triage` to action.

Conservative rules the async agent always follows:
- Never creates labels that don't exist in config.
- Never creates named milestones (only the rolling Tech Debt one is allowed, because it's deterministic and reversible).
- Never creates spec stub files.

### `/capture:triage`

Fetches all issues labelled `needs-triage` and walks them one by one. For each, the owner chooses: **accept**, **rename**, **relabel**, **milestone**, **stub-spec**, **duplicate**, or **skip**.

## Prerequisites

- `linear` CLI v2.x installed: `brew install schpet/tap/linear` or see [schpet/linear-cli](https://github.com/schpet/linear-cli)
- Authenticated: `linear auth login`
- `.pi/pi-capture.json` in the repo root

## Backend adapter interface

`pi-capture` is pluggable. Adding a new backend requires implementing `IBackendAdapter` from `src/adapter/interface.ts`:

```typescript
interface IBackendAdapter {
  resolveProject(date?: Date): Promise<ResolvedProject | null>;
  resolveMilestone(projectId: string, kind: MilestoneKind, name?: string): Promise<ResolvedMilestone | null>;
  createIssue(params: CreateIssueParams): Promise<string>;
  listTriageQueue(projectId: string, triageLabel: string): Promise<Issue[]>;
  updateIssue(id: string, patch: Partial<...>): Promise<void>;
  addLabel(id: string, label: string): Promise<void>;
  removeLabel(id: string, label: string): Promise<void>;
}
```

The `linear-cli` adapter is the only implementation in v0.1. A `github-issues` adapter (using `gh` CLI) is the obvious next target.

## Development

```bash
git clone https://github.com/aboldnewlook/pi-capture.git
cd pi-capture
npm install
npm test
```

TypeScript is run directly via Node's `--experimental-strip-types` — no compile step.
