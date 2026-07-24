# Agent run observability

Every agent execution has a durable run record in SQLite. The workspace
**Activity** panel shows:

- provider and model, start time, terminal status, and wall-clock duration;
- provider-reported input, output, cached-input, reasoning, and total tokens;
- an estimated cost based on the selected model's configured input/output
  prices;
- approval decisions with their timestamps;
- model steps and their token/finish metadata; and
- tool input, redacted output or error, status, and actual execution duration.

The download button exports the selected run, steps, approvals, and tool calls
as JSON for debugging or issue reports.

## Data boundaries

Usage is provider-reported; a zero means the provider omitted usage, not that a
request consumed no tokens. Cost is an estimate and is also zero when local
catalog pricing is unknown. It is not a billing statement.

Tool payloads pass through Nimruz's credential redactor before persistence and
are capped at 120,000 characters. API keys remain in the operating-system
credential store. Run diagnostics do not include chat message history,
environment variables, terminal output, or credential material.

Native Codex commands and file changes are correlated by the app-server item
identifier. Approval moves a tool to `running`; the corresponding
`item/completed` notification moves it to `completed`. If a provider exits or
Nimruz restarts first, open rows are explicitly closed as failed instead of
remaining as phantom running tools.

## Schema and recovery

Schema version 13 adds token and estimated-cost columns to `agent_runs`.
Migration is additive and preserves existing history. Startup recovery continues
to mark interrupted runs, pending approvals, and active tool calls failed.

Run the persistence and lifecycle checks with:

```bash
pnpm exec tsx --test electron/agent/approval-broker.test.ts \
  electron/storage/database.test.ts \
  electron/storage/migration.test.ts
```
