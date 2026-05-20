---
name: pi-capture
description: |
  Capture issues, bugs, and feature requests directly from conversation and file
  them to a configured backend (Linear via the linear CLI). Three commands:
  /capture for interactive filing, /capture:async for fire-and-forget, and
  /capture:triage for walking the needs-triage queue.
---

# pi-capture

Use this skill when the user wants to capture an issue, file a bug, log a tech-debt item, or triage previously-captured issues.

## Commands

### `/capture <issue text>`

Interactive. The agent reads `.pi/pi-capture.json`, gathers repo context (recent commits, specs layout, custom project prompts), classifies the issue, and proposes a title/label/milestone for the owner's approval before filing. The agent may ask ONE clarifying question if the issue text is ambiguous.

### `/capture:async <issue text>`

Non-interactive. The agent classifies and files immediately without asking questions. Always tags the issue `needs-triage`. Conservative scope:
- **Never** creates labels that don't exist in the config.
- **Never** creates named milestones — proposes them as body checklist items instead.
- **Never** creates spec stub files — proposes them as body checklist items instead.
- **May** auto-create the rolling Tech Debt milestone (deterministic, reversible).

### `/capture:triage`

Walks the `needs-triage` queue one issue at a time. For each issue, shows the owner what was filed and asks: accept | rename | relabel | milestone | stub-spec | duplicate | skip. Executes the approved action via the linear CLI and removes the triage label on accept.

## Configuration

`.pi/pi-capture.json` in the repo root. Minimal example:

```json
{
  "backend": "linear-cli",
  "linear": {
    "initiative": "7f9450f97e50",
    "projectPattern": "[BC] Y{YY} Q{Q}",
    "projectPrefix": "BC",
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
  "prompts": [".pi/pi-capture-prompts.md"],
  "policies": {
    "asyncMayCreateMilestone": false,
    "asyncMayStubSpec": false,
    "asyncMayCreateLabels": false
  }
}
```

The `prompts` array points to markdown files with project-specific classifier guidance (F-/T- slug conventions, persona model, AGENTS.md §13 rules, etc.). These are appended to every capture prompt.

## Prerequisites

- `linear` CLI v2.x installed and authenticated (`linear auth login`)
- `.pi/pi-capture.json` in the repo root
