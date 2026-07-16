
## Verdict

Nimruz should become **“میزکار هوشمند فارسی” — a Persian-first, local-first agent workbench**, not merely a better chat client.

The winning combination is:

- **Claude Cowork’s** controlled folder access, explicit plans, and reversible local-file work.
- **ChatGPT Work’s** unified workspace, plugin ecosystem, and creation of finished documents, spreadsheets, slides, and web artifacts.
- **Manus Desktop’s** visible autonomous execution, browser operation, parallel research agents, and task-oriented deliverables.

Nimruz already has the right foundation: Electron, local SQLite, encrypted credentials, projects, memories, experts, `SKILL.md`, OpenAI-compatible providers, and a sandboxed renderer. fileciteturn4file0L50-L64 fileciteturn4file0L116-L141

---

# What to borrow from each competitor

## Claude Cowork: controlled local work

Cowork’s strongest design is its workflow: the user selects folders or applications, Claude proposes a plan, and then performs file and office-document operations inside a restricted environment. It targets nontechnical work such as organizing files, analyzing spreadsheets, producing reports, converting formats, and working with calendars or inboxes. Anthropic has also introduced customizable plugins for common business workflows. citeturn483557news3turn576109news6turn483557news5

**Copy these ideas:**

- Folder-scoped permissions rather than whole-machine access.
- Read-only access by default.
- Plan preview before execution.
- File diffs and undo checkpoints.
- Sandboxed command execution.
- User-visible permission requests.
- Plugins that package instructions, tools, and templates together.

## ChatGPT Work: one workspace for everything

ChatGPT Work combines conversational assistance and Codex-like execution. It can gather context from files and connected applications and create documents, spreadsheets, presentations, and web applications. It also exposes integrations such as Gmail, Drive, Slack, calendars, and business applications through a unified plugin surface. citeturn626294news1turn626294news2

**Copy these ideas:**

- One project containing chats, files, tasks, sources, and deliverables.
- A unified plugin directory.
- Finished artifacts rather than pasted Markdown.
- Long-running tasks with resumable state.
- Ability to hand control back and forth between user and agent.

**Do not copy its UX fragmentation.** The introduction of separate Work/Codex surfaces and reduced visibility of familiar chat and project navigation produced significant user complaints. Keep Nimruz’s chat history and projects visible regardless of whether the user is chatting, researching, or running a task. citeturn626294news0

## Manus Desktop: visible execution and parallel agents

Manus Desktop’s “My Computer” mode can work with local files and commands. Its browser operator can use existing browser sessions, navigate sites, extract data, and fill forms. Wide Research divides work among isolated subagents and synthesizes their findings. Manus also emphasizes finished deliverables and integrations through email and Slack. citeturn345114view2turn337244view2turn838594view0turn838594view3turn838594view5

**Copy these ideas:**

- Dedicated task center.
- Live action timeline.
- Pause, cancel, retry, and intervene.
- Parallel research workers.
- Browser trace and screenshots.
- Deliverables panel containing files, sources, and summaries.
- Tasks started from email, messages, files, or scheduled triggers.

---

# Nimruz’s current architectural gap

The current Nimruz tool registry contains memory, expert management, `fetch_url`, and optional `load_skill`. fileciteturn11file0L15-L63

The chat handler executes tools directly inside a `streamText` request and stops after eight steps. Experts are nested `generateText` calls that receive a task and return text; they do not have isolated workspaces, persistent state, independent tools, or verification. fileciteturn14file0L217-L272 fileciteturn15file0L12-L40

That is enough for an assistant, but not for a Cowork/Manus-style agent.

**The next major feature should therefore be a durable Agent Runtime—not another individual tool.**

---

# Recommended architecture

## 1. Add a persistent Agent Runtime

Do not execute long workflows directly inside `/api/chat`.

Create a separate runtime with this lifecycle:

```text
User request
    ↓
Planner
    ↓
Capability and permission check
    ↓
Executor
    ↓
Verifier
    ↓
Deliverables + execution report
```

Add database entities such as:

```text
agent_runs
agent_steps
agent_events
artifacts
workspace_grants
permission_requests
checkpoints
citations
scheduled_tasks
connector_accounts
```

Each run should be:

- Persisted immediately.
- Resumable after application restart.
- Pausable and cancellable.
- Append-only for auditing.
- Able to retry only the failed step.
- Connected to a project, chat, model, files, and deliverables.

Your current SQLite migration system already provides a clean place for these additions. fileciteturn28file0L113-L190

Suggested layout:

```text
electron/agent/
  runtime.ts
  planner.ts
  executor.ts
  verifier.ts
  scheduler.ts
  event-store.ts
  permissions.ts
  checkpoints.ts

electron/tools/
  filesystem.ts
  shell.ts
  browser.ts
  research.ts
  artifacts.ts
  connectors.ts

electron/workers/
  sandbox-worker.ts
  browser-worker.ts

src/components/work/
  run-view.tsx
  plan-card.tsx
  activity-timeline.tsx
  permission-dialog.tsx
  artifact-panel.tsx
  sources-panel.tsx
```

## 2. Build capability-based permissions

Every tool should declare:

```ts
type ToolCapability = {
  id: string;
  risk: "read" | "reversible-write" | "external-action" | "blocked";
  scopes: string[];
  requiresApproval: boolean;
  supportsDryRun: boolean;
  supportsUndo: boolean;
};
```

Recommended policy:

| Level | Examples | Behaviour |
|---|---|---|
| Read | Read file, search folder, fetch page | Can run automatically inside approved scope |
| Reversible write | Create document, rename file, edit spreadsheet | Show grouped plan and diff |
| External action | Send email, submit form, publish post, install package | Explicit approval for each action |
| Blocked | Payment, identity submission, irreversible deletion | User completes manually |

Do not rely on an LLM-based permission classifier alone. Research on coding and MCP agents shows that ambiguous file modifications, prompt injection, and insufficient tool-argument visibility can bypass weak safety layers. citeturn483557academia6turn483557academia4turn483557academia7

## 3. Implement a real local workspace

Start with deterministic filesystem work before general mouse-and-keyboard automation.

Tools:

```text
workspace_select
list_files
search_files
read_file
read_document
create_file
patch_file
copy_file
move_file
rename_file
create_folder
compare_versions
restore_checkpoint
```

Rules:

- Only user-selected folders.
- Read-only initial grant.
- No default access to the home directory.
- Block `.ssh`, browser profiles, wallets, and credential directories.
- Snapshot files before modifying them.
- Show before/after diffs.
- Keep generated artifacts inside a project workspace.

This should be Nimruz’s equivalent of Cowork’s folder selection, but with a clearer audit trail.

## 4. Add first-class artifact creation

Users should receive an editable file, not a Markdown imitation of one.

Use free JavaScript libraries already compatible with your Electron stack:

- `docx` for Word documents. fileciteturn25file0L7-L9
- ExcelJS for reading and writing styled XLSX files. fileciteturn26file0L3-L8
- PptxGenJS for editable PowerPoint files, including RTL text, charts, tables, templates, and Electron support. fileciteturn24file0L13-L35
- HTML and Markdown as intermediate editable formats.
- LibreOffice headless as an optional local conversion and PDF-rendering backend.

Create an **Artifact Studio** with:

- Preview.
- Open in system application.
- Edit one section.
- Regenerate one slide or table.
- Export to DOCX/XLSX/PPTX/PDF.
- Validate that the generated file opens.
- Inspect clipping, missing fonts, broken formulas, and empty slides.

Persian templates should include:

- رزومه فارسی و دوزبانه
- نامه اداری
- صورت‌جلسه
- پروپوزال دانشگاهی
- گزارش پژوهشی
- پیش‌فاکتور و فاکتور
- ارائه دفاع پایان‌نامه
- گزارش فروش و منابع انسانی
- نامه پذیرش یا مکاتبه دانشگاهی

## 5. Add Playwright browser execution

Use Playwright rather than unrestricted operating-system GUI automation for the first browser release. It provides browser isolation, resilient locators, authentication-state reuse, screenshots, video, network information, and execution traces. It is explicitly designed for browser automation and AI-agent workflows. fileciteturn17file0L7-L20 fileciteturn17file0L65-L90

Implement two modes:

### Safe browser

- Fresh isolated browser profile.
- Used for research and public pages.
- No existing logins.
- Automatic execution allowed.

### Personal browser

- User explicitly connects an existing session.
- Domain-by-domain permission.
- Reading may be automatic.
- Sending, publishing, applying, purchasing, or submitting always pauses for approval.

Display:

- Current URL.
- Intended next action.
- Screenshot.
- Extracted text.
- Form values before submission.
- Playwright trace after completion.

General desktop computer-use should come later. Current benchmarks show that multi-application desktop agents remain unreliable, particularly when workflows cross three or more applications. citeturn612750academia3turn612750academia4

## 6. Build a Persian research engine

Expand `fetch_url` into a complete research subsystem. The current tool only reads one public URL. fileciteturn9file0L7-L18

Recommended free stack:

1. **SearXNG** as the default self-hosted metasearch backend. It is open-source and designed without user tracking or profiling. fileciteturn19file0L17-L18
2. Current safe URL extraction.
3. Playwright fallback for JavaScript-heavy pages.
4. Local document parsing.
5. Citation and evidence store.
6. Parallel subagents for wide research.

Persian-aware search should automatically generate:

```text
Original Persian query
Formal Persian alternative
Colloquial Persian alternative
English translation
Pinglish/transliterated alternative
Site-specific Iranian queries
```

Each research worker should have:

- A separate context.
- A distinct search lane.
- A source limit.
- A duplication check.
- A requirement to attach evidence to every claim.

The final synthesizer should merge results only after source deduplication and contradiction checks.

## 7. Add MCP as the plugin layer

Keep `SKILL.md`, but distinguish responsibilities:

- **Skill:** instructions, workflow, examples, domain knowledge.
- **Tool:** executable capability.
- **MCP server:** external tools, resources, authentication, and application integration.
- **Expert:** specialized reasoning profile.
- **Template:** artifact structure and visual style.

The MCP TypeScript SDK supports clients, tools, resources, prompts, HTTP, and stdio transports and works in Node.js. As of July 16, 2026, use the supported v1.x branch for production rather than the still-beta v2 release. fileciteturn16file0L7-L11 fileciteturn16file0L35-L53

Every installed MCP server should show:

- Command or endpoint.
- Requested filesystem access.
- Network access.
- Tools exposed.
- Package version and checksum.
- Trust level.
- Exact arguments before sensitive calls.

Suggested trust labels:

```text
Built into Nimruz
Locally audited
Community plugin
Remote service
Untrusted
```

## 8. Make local models the default path

Add automatic discovery for:

- Ollama.
- LM Studio.
- llama.cpp servers.
- Any OpenAI-compatible LAN endpoint.
- Self-hosted vLLM or SGLang servers.

Ollama already provides native Windows, macOS, Linux, Docker, and a local REST API, making it an appropriate zero-configuration default. fileciteturn18file0L13-L41 fileciteturn18file0L92-L107

Allow separate model assignments:

```text
Chat model
Planner model
Tool-calling model
Verifier model
Vision model
Embedding model
Fast background model
```

Provider priority should be:

```text
1. Fully local
2. User-hosted LAN/server
3. Free remote endpoint
4. User-provided paid API
5. OpenRouter fallback
```

Before enabling agent mode, run a small capability test for each model:

- Persian instruction following.
- Structured JSON.
- Tool selection.
- Tool-argument accuracy.
- Long-context consistency.
- Persian/English mixed text.
- Recovery from tool errors.

---

# Persian and Iranian UX layer

This is where Nimruz can become meaningfully better than all three products.

## Language handling

Use a normalization layer that understands:

- Arabic `ي/ك` versus Persian `ی/ک`.
- Half-space and ZWNJ.
- Persian, Arabic, and Latin digits.
- Mixed RTL/LTR text.
- Persian filenames containing English technical terms.
- Formal, neutral, and conversational Iranian Persian.
- Preservation of the user’s original text during copy and export.

Half-spaces and normalization remain material challenges for Persian language processing, while formal-only datasets perform poorly on colloquial Persian. citeturn482543academia1turn482543academia0turn482543academia2

The TypeScript PersianTools package already provides digit conversion, Persian character cleanup, half-space utilities, phone and national-ID validation, Sheba/card utilities, and Iranian geographic helpers. fileciteturn22file0L24-L60

## Iranian localization

Implement globally:

- Jalali and Gregorian dates side by side.
- Iran timezone handling.
- تومان/ریال toggle.
- Persian and Latin digit preference.
- Saturday-first week.
- Correct RTL tables and charts.
- Persian sorting and searching.
- Iranian phone, postal, national-code, Sheba, and bank-card field formats.
- Formal نامه‌نگاری conventions.
- Persian typography inspection before export.

For date manipulation and validation, `jalaali-js` provides typed Persian/Gregorian conversion while the browser’s `Intl` API can handle most display formatting. fileciteturn23file0L3-L13 fileciteturn23file0L18-L43

## Privacy indicators

Every task should visibly state:

```text
مدل: محلی / ابری
داده ارسال‌شده: هیچ / متن / فایل
ابزارهای فعال: ...
پوشه‌های مجاز: ...
هزینه تقریبی: رایگان / ...
```

A user should never need to guess whether a Persian document, national code, contract, résumé, or financial spreadsheet is leaving the machine.

---

# Product UX

Use one consistent application shell:

```text
گفت‌وگو     انجام کار     پژوهش
```

These should be views of the same project—not separate products.

The **انجام کار** view should contain:

1. Request.
2. Proposed plan.
3. Required permissions.
4. Live activity.
5. Files changed.
6. Sources consulted.
7. Deliverables.
8. Verification report.

A task card should always provide:

```text
Pause
Stop
Approve
Reject
Change plan
Take control
Undo
Retry failed step
```

---

# Implementation order

## P0 — Turn Nimruz into an agent

- Persistent run/event database.
- Planner–executor–verifier loop.
- Permission and risk engine.
- Folder-scoped filesystem tools.
- Checkpoints and undo.
- Task activity UI.
- Ollama and local-provider auto-discovery.
- DOCX, XLSX, and PPTX generation.

## P1 — Research and browser work

- SearXNG integration.
- Citation database and source viewer.
- Playwright browser worker.
- Browser traces and screenshots.
- Parallel research subagents.
- Artifact verification.
- Persian query expansion.

## P2 — Ecosystem and automation

- MCP client and plugin registry.
- IMAP/SMTP, CalDAV, Git, WebDAV, and local application adapters.
- Scheduled and recurring tasks.
- Email/message-triggered tasks.
- Shared workflow and template marketplace.
- Optional encrypted synchronization.

## P3 — Restricted desktop control

- Accessibility-tree-based application control.
- Application-specific adapters.
- Vision fallback only when deterministic APIs fail.
- Per-application permissions.
- Mandatory approval for all external or irreversible actions.

---

# The first release I would build

Call it **Nimruz Workbench / میزکار نیمروز** and limit its initial promise to:

> «یک پوشه را به نیمروز بدهید؛ فایل‌ها را بررسی، مرتب و خلاصه می‌کند و از آن‌ها گزارش، ورد، اکسل یا پاورپوینت فارسی می‌سازد—با اجرای محلی، برنامه قابل مشاهده و امکان بازگردانی تغییرات.»

That first release would already deliver most of Claude Cowork’s high-value workflow, part of ChatGPT Work’s artifact creation, and Manus’s visible task execution—without attempting the least reliable part first: unrestricted control of the entire computer.

Want a weekly watch for new Cowork, ChatGPT Work, and Manus features that should enter Nimruz’s backlog?