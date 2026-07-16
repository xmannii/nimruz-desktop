![Nimruz banner](public/banner.png)

# Nimruz Desktop

**نیمروز** — an open-source Persian AI chat desktop app built with Electron, React, and the [Vercel AI SDK](https://github.com/vercel/ai).

> **Experimental software** — Nimruz is early-stage and may contain bugs or rough edges. Please test it, expect occasional issues, and [report problems on GitHub](https://github.com/xmannii/nimruz-desktop/issues) so we can fix them.

Nimruz connects to [OpenRouter](https://openrouter.ai/) (and custom OpenAI-compatible providers) so you can chat with many models from one native app. Chats, projects, memories, experts, skills, and personalization settings are stored locally on your machine.

## Download

Pre-built **Windows** and **macOS** installers are published automatically on every [release](https://github.com/xmannii/nimruz-desktop/releases).

| Platform | Installer | Latest |
| --- | --- | --- |
| **macOS** (Apple Silicon) | `.dmg` | [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest) |
| **Windows** | `.exe` (NSIS) | [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest) |
| **Linux** | AppImage | Build locally with `pnpm dist` |

See [CHANGELOG.md](CHANGELOG.md) for release notes. **v0.3.1** adds **`fetch_url`**, auto chat titles, pin/export/delete-all chats, and message copy/regenerate.

![Nimruz v0.3.1 release banner](public/release-v0.3.1-banner.png)

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

- **Streaming chat** — markdown, code blocks, math (KaTeX), Mermaid diagrams, and CJK support
- **OpenRouter integration** — browse, favorite, and switch models; optional reasoning effort controls
- **Custom providers** — add OpenAI-compatible endpoints with your own API keys
- **Web fetch** — the assistant can read public URLs with `fetch_url` (safe HTML-to-text extraction)
- **Auto chat titles** — conversations are named automatically from the first message
- **Projects** — organize conversations by topic or workflow
- **Memories** — the assistant can save and forget durable facts about you over time
- **Experts (متخصص‌ها)** — define reusable specialists (e.g. LinkedIn writer, code reviewer); pick one with `/` in chat and delegate work via expert tools
- **Skills (مهارت‌ها)** — install and author `SKILL.md` agent skills; the assistant loads instructions on demand with `load_skill`
- **Chat management** — pin chats, export as Markdown/JSON, copy/regenerate assistant replies, delete all chats
- **Personalization** — response style, custom instructions, and profile context
- **Local-first storage** — SQLite database in Electron `userData`; API keys encrypted with the OS keychain
- **Automated releases** — GitHub Actions builds and publishes Windows + macOS installers when the version in `package.json` changes on `main`

## Screenshots

_Add screenshots here after publishing the repository._

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

On first launch, open **Settings → Models** to add your OpenRouter API key. The key is encrypted through macOS Keychain, Windows DPAPI, or a Linux libsecret/KWallet keyring. On Linux, storage is refused when only Electron's insecure `basic_text` backend is available.

No `.env` file is required for normal use — credentials are managed inside the app.

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
# 1. Change "version" in package.json (e.g. 0.3.0 → 0.3.1)
# 2. Update CHANGELOG.md
# 3. Commit and push:
git add package.json CHANGELOG.md
git commit -m "Bump version to 0.3.1"
git push origin main
```

You can also run the **Release** workflow manually from the Actions tab (`workflow_dispatch`).

## Architecture

```
Electron main (Node)
├─ authenticated local HTTP server
│  ├─ POST /api/chat       → streamText + tools (memory, skills, experts, fetch_url)
│  ├─ POST /api/chat/title → auto title generation (OpenAI-compatible)
│  └─ GET  /*              → static renderer (production only)
├─ SQLite database    → chats, projects, memories, experts, settings
├─ Skills store       → ~/.nimruz/skills and standard agent skill paths
├─ safeStorage        → encrypted API keys
└─ BrowserWindow → sandboxed Vite renderer
```

- **Dev:** Vite serves the renderer on `:5173` and proxies `/api` to the main-process server on `:43117`.
- **Prod:** the main-process server serves both the static renderer and the chat API on one random localhost port.

## Tech stack

| Layer | Tools |
| --- | --- |
| Desktop shell | Electron |
| UI | React 19, TanStack Router, Tailwind CSS 4, shadcn/ui |
| AI | Vercel AI SDK, OpenRouter provider |
| Storage | better-sqlite3 (via Electron main), OS keychain |
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

Application data lives in Electron's platform-specific `userData` directory (folder name **Nimruz**) as `nimruz.sqlite3`. Legacy IndexedDB/localStorage data is imported once and kept as a rollback copy. Saved API keys are not portable between machines or OS users.

Skills are stored under `~/.nimruz/skills` (and other standard agent skill directories).

## Relationship to the web app

This repository is an independent desktop app. UI code under `src/components`, `src/lib`, and `src/hooks` was originally copied from a Next.js web client. The two apps can diverge; port UI changes manually when you want them in both places.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and PR guidelines.

## License

This project is licensed under the [MIT License](LICENSE).
