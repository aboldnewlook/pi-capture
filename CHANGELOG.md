# Changelog

## 0.2.0 — 2026-05-20

Two architectural changes. Per-repo `pi-capture.json` schema is unchanged;
no migration needed.

### Forked-context dispatch (orchestrator-context pollution fix)

`/capture` and `/capture:async` now dispatch into a forked subagent
context via the `pi-subagents` slash-bridge (`SLASH_SUBAGENT_REQUEST_EVENT`
on `pi.events`) instead of `pi.sendUserMessage()`. The orchestrator
session no longer absorbs every grep, file read, and `linear` shell-out;
only the classification proposal (or, for `:async`, the run id and final
ABNL-NN) crosses the boundary.

- `/capture` (interactive): two-dispatch shape. The slash command
  dispatches a recon subagent that classifies + drafts a body to
  `/tmp/capture-<slug>.md` + outputs a structured proposal block. The
  owner acks in the main chat; the orchestrator dispatches a separate
  filing subagent on ack.
- `/capture:async`: single forked dispatch with `async: true`. The
  subagent classifies, drafts the body, and files via `linear issue
  create --description-file ...` end-to-end without owner interaction.
- `/capture:triage`: still uses `sendUserMessage` for v0.2 — interactive
  queue walks require per-issue dispatch with intercom bridge support,
  which is v0.3 work. Tracked in README.

`pi-subagents` is now declared as a required (non-optional) peer
dependency.

### Reference-not-inline prompt paths

Project-specific guidance files (`prompts: [...]` in `pi-capture.json`)
are no longer read or inlined by the extension. The dispatched task
includes the *paths* and a directive telling the subagent to read them
itself, lazily, via its Read tool. The structured Linear config block
(labels, project pattern, milestone pattern) stays inlined — it's small
and the subagent needs it to dispatch CLI args correctly.

Net effect: dispatched task size is bounded (~1-2 KB) regardless of
how large a project's guidance files grow.

### Other

- Config loader now validates that every `prompts: [...]` path exists
  at extension load. Misconfigured repos fail loudly with an actionable
  error instead of silently producing prompts without guidance.
- Removed `recentCommits()`, `specsLayout()`, `adrIndex()`, and
  `customPrompts()` from `prompts.ts` — those were eager context
  gatherers in v0.1; the dispatched subagent now collects context
  itself with the same tools (grep, Read).
- `resolveContext()` no longer pre-calls `adapter.resolveProject()` —
  the subagent runs `linear project list` directly when needed.

## 0.1.0 — Initial release

- Three commands: `/capture`, `/capture:async`, `/capture:triage`.
- Pluggable adapter interface with `linear-cli` as the first backend.
- Per-repo config at `./.pi/pi-capture.json` with JSON-Schema validation.
- Conservative async-mode policies (no autonomous milestone / label /
  spec creation by default).
