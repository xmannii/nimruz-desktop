![Nimruz banner](public/banner.png)

# Nimruz Desktop

**نیمروز** — an open-source Persian AI **workspace agent** for the desktop. Built with Electron, React, and the [Vercel AI SDK](https://github.com/vercel/ai).

[فارسی](README.fa.md)

> **v1.0.0** — Nimruz is no longer “just a chat app.” It is an agentic workspace: chat plus tools that can work inside your project folders, with approvals, artifacts, and local-first storage.

> **Experimental software** — expect rough edges. Please test it and [report issues on GitHub](https://github.com/xmannii/nimruz-desktop/issues).

Connect Codex through your ChatGPT account, [OpenRouter](https://openrouter.ai/), or any OpenAI-compatible provider. Tool-capable providers can work inside linked workspace folders with approvals, artifacts, and tasks; Codex runs as a subscription-backed conversational model in an isolated runtime. Chats, workspaces, memories, experts, skills, and settings remain local to your machine.

## Download

Pre-built **Windows** and **macOS** installers are published on every [release](https://github.com/xmannii/nimruz-desktop/releases).

| Platform | Installer | Latest |
| --- | --- | --- |
| **macOS** (Apple Silicon) | `.dmg` | [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest) |
| **Windows** | `.exe` (NSIS) | [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest) |
| **Linux** | AppImage | Build locally with `pnpm dist` |

See [CHANGELOG.md](CHANGELOG.md) for **v1.2.0** release notes (local Persian speech-to-text, voice input, and a focused chat mode).

### macOS install

1. Download the latest `.dmg` from [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest).
2. Open the DMG and drag **Nimruz** to **Applications**.
3. Open Nimruz using one of the methods below.

macOS builds are not code-signed or notarized yet, so Gatekeeper may block the app. The **“Nimruz is damaged and can’t be opened”** message is misleading — the app is fine; macOS is rejecting an unsigned download.

**Recommended:** Right-click **Nimruz** in Applications → **Open** → **Open** again. You only need to do this once.

**Alternative:** Remove the download quarantine flag, then open normally:

```bash
xattr -dr com.apple.quarantine /Applications/Nimruz.app
```

**If macOS already blocked the app:** Open **System Settings → Privacy & Security** and click **Open Anyway** next to the Nimruz entry.

### Windows install

1. Download the latest `.exe` installer from [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest).
2. Run the installer and follow the prompts.

## Features

### Agentic workspace

- **Workspaces** — link project folders; chats live under a workspace (with a default home workspace)
- **Agent tools** — read/list/search files, write and patch, shell commands, artifacts, and tasks
- **Workspace MCP tools** — connect stdio, HTTP, or SSE MCP servers; discovered tools are namespaced and require per-call approval
- **Approvals** — risky tools ask before running; optional “always allow” per workspace
- **Side panel** — files, artifacts, tasks, activity, and workspace settings
- **Composer context** — attach files/artifacts, workspace picker, and `@`-mentions

### Chat & models

- **Streaming chat** — markdown, code, math (KaTeX), Mermaid, RTL-first Persian UI
- **Tool timeline** — connected reasoning + tool steps; long runs compact into one expandable summary
- **Codex with ChatGPT sign-in** — sync and use models available to an eligible ChatGPT account in a restricted, isolated runtime
- **OpenRouter & custom providers** — browse models, set defaults, optional reasoning effort
- **Web fetch** — `fetch_url` for public pages (SSRF-safe HTML → text)
- **Auto titles** — conversations named from the first message
- **Chat management** — pin, export Markdown/JSON, copy/regenerate, search history

### Personalization & skills

- **Memories** — durable facts the assistant can save and forget
- **Experts (متخصص‌ها)** — reusable specialists via `/` in chat
- **Skills (مهارت‌ها)** — `SKILL.md` packs loaded on demand with `load_skill`
- **Personalization** — response style, custom instructions, profile context

### App polish

- **Appearance** — light/dark/system, color themes (including نیمروز), system font picker
- **Onboarding** — first-run tour (appearance, models, workspaces, chat basics)
- **Local-first** — SQLite in Electron `userData`; API keys in the OS keychain
- **Automated releases** — GitHub Actions publishes Windows + macOS installers when the version on `main` changes

## Screenshots

_Add screenshots here after publishing the 1.0 release._

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22.12.0 or newer
- [pnpm](https://pnpm.io/) 9 or newer

### Install and run

```bash
git clone https://github.com/xmannii/nimruz-desktop.git
cd nimruz-desktop
pnpm install
pnpm dev
```

On first launch:

1. Complete the short onboarding tour (or skip it).
2. Open **Settings → Models** and connect ChatGPT for Codex, add an OpenRouter key, or configure another provider.
3. Create or open a **workspace** and link a project folder when you want the agent to touch files.

Workspace-specific MCP servers can be added under **Workspace panel → Settings
→ MCP servers**. Test the connection before enabling it for agent turns. See
[Workspace MCP tools](docs/MCP.md) for supported transports, lifecycle, and the
current authentication boundary.

API keys are encrypted through macOS Keychain, Windows DPAPI, or a Linux libsecret/KWallet keyring. On Linux, storage is refused when only Electron's insecure `basic_text` backend is available.

No `.env` file is required for normal use — credentials are managed inside the app.

### Use a ChatGPT account with Codex

1. Open **Settings → Models → Codex** and select **Connect ChatGPT**.
2. Complete the OpenAI sign-in in your browser. A device-code flow is available as a fallback.
3. Return to Nimruz. The app syncs the Codex models currently available to the signed-in account; select one and start a chat.

Codex availability, model access, credits, and rate limits follow the signed-in account's ChatGPT plan and workspace policy. OpenAI currently documents Codex access across eligible Free, Go, Plus, Pro, Business, Enterprise, and Edu offerings; see [Codex pricing and plan availability](https://learn.chatgpt.com/docs/pricing) for the current details. Business, Enterprise, and Edu accounts also remain subject to their workspace administrator's permissions.

Nimruz uses Codex's supported ChatGPT browser sign-in and experimental app-server interface. Codex owns token refresh and stores the session in the operating-system keyring; Nimruz does not copy the session tokens into SQLite or a plaintext `auth.json` file. See OpenAI's [Codex authentication documentation](https://learn.chatgpt.com/docs/auth) for how ChatGPT sign-in, workspace controls, and credential storage work. Logging out from the Codex card clears the Codex session and Nimruz's local Codex thread mappings.

For local safety, Nimruz starts Codex with a least-privilege permission profile: commands can read only Codex's minimal runtime files and Nimruz's dedicated empty workspace, cannot write there, and have no network access. Shell, web-search, browser, connector, plugin, computer-use, and multi-agent tool surfaces are disabled, and no parent-process environment variables are exposed to model-run commands. This integration exposes Codex as a coding model inside Nimruz; it does **not** convert a ChatGPT subscription into general OpenAI API credit or replace an API key for custom providers. Codex usage is counted under the user's ChatGPT plan.

### Build a distributable

```bash
pnpm dist
```

Installers are written to `release/` (DMG / NSIS / AppImage depending on your platform).

### Release (GitHub Actions)

When you bump the version in `package.json` and push to `main`, GitHub Actions automatically:

1. Builds **Windows** (NSIS `.exe`) and **macOS** (`.dmg`) installers
2. Creates a GitHub Release with both artifacts attached

```bash
# 1. Change "version" in package.json (e.g. 1.0.0 → 1.0.1)
# 2. Update CHANGELOG.md (Persian; also powers Settings → تغییرات نسخه‌ها and What’s New)
# 3. Commit and push:
git add package.json CHANGELOG.md
git commit -m "Bump version to 1.0.1"
git push origin main
```

You can also run the **Release** workflow manually from the Actions tab (`workflow_dispatch`).

## Architecture

```
Electron main (Node)
├─ authenticated local HTTP server
│  ├─ POST /api/chat       → workspace ToolLoopAgent or Codex app-server
│  ├─ POST /api/agent/run  → workspace agent runtime (FS, shell, artifacts, tasks)
│  ├─ POST /api/chat/title → auto title generation (OpenAI-compatible)
│  └─ GET  /*              → hardened static renderer (production only)
├─ SQLite database    → chats, workspaces, roots, artifacts, tasks, runs, memories, experts, settings, Codex thread mappings
├─ Workspace files    → scoped paths under linked/managed roots
├─ Skills store       → ~/.nimruz/skills and standard agent skill paths
├─ safeStorage        → encrypted provider API keys
├─ Codex app-server   → managed ChatGPT auth, model sync, isolated native threads
└─ BrowserWindow → sandboxed Vite renderer
```

- **Dev:** Vite serves the renderer on `:5173` and proxies `/api` to the main-process server on `:43117`.
- **Prod:** the main-process server serves both the static renderer and the API on one random localhost port.

## Tech stack

| Layer | Tools |
| --- | --- |
| Desktop shell | Electron |
| UI | React 19, TanStack Router, Tailwind CSS 4, shadcn/ui |
| AI | Codex app-server, Vercel AI SDK, OpenRouter / OpenAI-compatible providers |
| Storage | Node SQLite (`node:sqlite`), OS keychain |
| Build | Vite, esbuild, electron-builder |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Vite + Electron in development |
| `pnpm build` | Build renderer and main process |
| `pnpm start` | Build and launch Electron |
| `pnpm dist` | Build platform installer |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run unit tests |

## Local data

Application data lives in Electron's platform-specific `userData` directory (folder name **Nimruz**) as `nimruz.sqlite3`. Codex keeps its app state in a separate `codex/` directory and operates in a dedicated `codex-workspace/`; authentication secrets remain in the OS credential store. Legacy IndexedDB/localStorage data is imported once and kept as a rollback copy. Saved API keys and Codex sessions are not portable between machines or OS users.

Skills are stored under `~/.nimruz/skills` (and other standard agent skill directories). Workspace-linked folders stay on disk where you pointed them; managed roots and artifacts are stored under app data.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and PR guidelines.

## License

This project is licensed under the [MIT License](LICENSE).
