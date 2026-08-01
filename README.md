![Nimruz chat](public/screenshots/simple-chat.png)

# Nimruz Desktop

> An open-source, Persian-first desktop agent that can work in your files, understand your voice, and keep going from Telegram.

[Download the latest release](https://github.com/xmannii/nimruz-desktop/releases/latest) · [Report an issue](https://github.com/xmannii/nimruz-desktop/issues) · [فارسی](README.fa.md)

Nimruz is a local-first AI workspace for work that needs more than a chat box. Give it a project folder, ask for a result, and watch it inspect files, use tools, create artifacts, and ask for approval before sensitive actions. Speak in Persian with local Shenava transcription, or send the same desktop agent a message from Telegram.

> **Experimental software.** Nimruz is under active development. The Telegram relay is currently being tested in `dev` builds; use the latest stable GitHub Release for the main desktop app.

## The product in three moves

| Start with a workspace | Talk naturally | Continue from Telegram |
| --- | --- | --- |
| Link a project folder and give the agent real context. | Use Persian voice input instead of typing every thought. | Pair a BotFather bot and reach the agent from your phone. |
| It reads, searches, edits, runs approved commands, and makes deliverables. | Shenava transcribes speech locally on your device. | Text, voice notes, photos, documents, progress updates, and artifacts all flow through the bot. |

## Agentic workspace

Nimruz turns a conversation into a place where work can actually happen.

- Link one or more project folders to a workspace.
- Let the agent read, list, search, write, patch, and inspect files.
- Run shell commands, web searches, and workspace MCP tools; sensitive operations remain approval-gated.
- Break down longer work into plans, tasks, and independent subagents.
- Follow every run in a tool timeline, with files, artifacts, tasks, and activity in the side panel.
- Attach files and artifacts to a prompt, or mention them with `@`.

The important part is the boundary: Nimruz scopes tools to the selected workspace and keeps risky actions visible before they run.

## Persian voice-to-text

Speak once and keep moving. Download a Shenava speech model, select it in **Settings → Speech**, and use the microphone in chat or the dedicated transcription page.

- Persian speech recognition runs locally on the device.
- Record from the microphone or transcribe an audio file.
- Keep raw and corrected text side by side, then export the result.
- Use the same local transcription pipeline for Telegram voice notes.
- Optional AI cleanup can improve punctuation, spacing, and readability with your selected model.

## Telegram assistant

Your desktop agent does not have to stay in the desktop window. Connect a BotFather bot, pair your Telegram account, choose a workspace, and message Nimruz from your phone.

The Telegram assistant supports:

- Text prompts and voice notes.
- Photos with a vision-capable model, plus supported PDFs and text/code documents.
- Live progress while the agent is working.
- Recent conversations, model switching, stopping a run, and help from the bot keyboard.
- Artifact delivery back into the Telegram chat.

The app remains the runtime: Nimruz must be running for the bot to respond, and the selected workspace stays on your computer. Pairing is limited to the Telegram account that starts the one-time pairing flow. File writes, terminal commands, and other sensitive operations still require approval.

## Also included

- **Model choice** — Codex through ChatGPT sign-in, OpenAI, Anthropic, Google Gemini, OpenRouter, and generic OpenAI-compatible or local servers.
- **Skills and experts** — load `SKILL.md` packs on demand and call reusable specialists with `/`.
- **Memories and personalization** — save durable context and control the assistant's response style.
- **Web research** — search the web and read public pages through SSRF-safe tools.
- **Companion window** — open a small always-available chat with a global shortcut.
- **Persian-first UI** — RTL chat, Persian typography, light/dark/system themes, and the Nimruz color theme.

## Screenshots

These are real captures from Nimruz's Persian-first interface.

### Agentic tool calls

Give Nimruz a goal and follow the work as it searches, reasons, and uses tools inside the workspace.

![Nimruz agentic tool calls](public/screenshots/agentic-tool-calls.png)

### From a chat to a deliverable

The agent can turn a conversation into a concrete artifact you can preview and export.

![Nimruz artifact preview](public/screenshots/artifact.png)

### Persian speech-to-text

Shenava runs locally on the device: choose an audio file or record live, then review the raw and corrected transcript.

![Nimruz speech-to-text upload](public/screenshots/stt-1.png)

![Nimruz speech-to-text results](public/screenshots/stt-2.png)

<details>
<summary>Explore the rest of the app</summary>

### Model providers

Connect cloud, compatible, or local model providers from one place.

![Nimruz model providers](public/screenshots/model-providers.png)

### Personalization

Set the assistant's response style, profile context, and preferred instructions.

![Nimruz personalization](public/screenshots/personalization.png)

### Simple chat

For quick questions, use a lightweight conversation without workspace tools.

![Nimruz simple chat](public/screenshots/simple-chat.png)

</details>

The next screenshot worth adding is a Telegram run: voice note or text prompt → progress update → final answer → delivered artifact. See [docs/README-SCREENSHOTS.md](docs/README-SCREENSHOTS.md) for the exact capture state and redaction checklist.

## Download

Pre-built installers are published on every [GitHub Release](https://github.com/xmannii/nimruz-desktop/releases).

| Platform | Installer | Where to get it |
| --- | --- | --- |
| **macOS** (Apple Silicon) | `.dmg` | [Latest release](https://github.com/xmannii/nimruz-desktop/releases/latest) |
| **Windows** | `.exe` (NSIS) | [Latest release](https://github.com/xmannii/nimruz-desktop/releases/latest) |
| **Linux** | AppImage | Build locally with `pnpm dist` |

The rolling [`dev-latest`](https://github.com/xmannii/nimruz-desktop/releases/tag/dev-latest) prerelease may include Telegram assistant changes before they reach a stable release.

### macOS install

1. Download the latest `.dmg` from [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest).
2. Open the DMG and drag **Nimruz** to **Applications**.
3. Right-click **Nimruz** in Applications, choose **Open**, then choose **Open** again.

macOS builds are not code-signed or notarized yet. If Gatekeeper has already blocked the app, open **System Settings → Privacy & Security** and choose **Open Anyway** next to Nimruz. As a terminal alternative:

```bash
xattr -dr com.apple.quarantine /Applications/Nimruz.app
```

### Windows install

1. Download the latest `.exe` installer from [Releases](https://github.com/xmannii/nimruz-desktop/releases/latest).
2. Run the installer and follow the prompts.

## Quick start

1. Launch Nimruz and finish or skip the onboarding tour.
2. Open **Settings → Models → Providers** and connect a model provider. You can use Codex with an eligible ChatGPT account, OpenRouter, or an OpenAI-compatible/local provider.
3. Create or open a **workspace**, then link a project folder when you want the agent to work with files.
4. Start an agent chat with a concrete outcome, for example:

   > Inspect this project, summarize its structure, and create a short `TODO.md`. Ask before changing files.

5. Approve only the actions you want the agent to take.

### Turn on voice input

Open **Settings → Speech**, download a Shenava model, select it, and then use the microphone button in the chat composer. For longer recordings or files, open the **Transcribe** page.

### Connect Telegram

1. Message [@BotFather](https://t.me/BotFather) in Telegram, run `/newbot`, and copy the token.
2. In Nimruz, open **Settings → Telegram**, paste the token, and choose the workspace the bot may use.
3. Start the one-time pairing flow and open its link from the Telegram account you want to authorize.
4. Keep Nimruz running, then send a message or voice note to the bot.

The bot token is stored through the operating system's secure credential store. No `.env` file is needed for normal use.

## Local-first by default

Nimruz stores chats, workspaces, memories, experts, skills, settings, runs, tasks, and artifacts in its local application data. Provider API keys and the Codex session are kept in the operating system credential store. When you choose a cloud model, the relevant prompt and files are still sent to that provider to produce a response; Nimruz does not claim that cloud inference is local.

Workspace tools are path-scoped. Writes, shell commands, MCP calls, and other sensitive operations can ask for approval. Telegram is a remote input/output channel to the local desktop runtime, not a separate hosted copy of your workspace.

### Codex note

Nimruz can connect Codex through the supported ChatGPT sign-in flow and run it as a coding model in an isolated runtime. Codex does not gain access to Nimruz's linked workspaces, shell, web tools, MCP servers, or Telegram. This integration uses the signed-in ChatGPT account's Codex access; it does **not** turn a ChatGPT subscription into general OpenAI API credit.

## Build from source

### Prerequisites

- [Node.js](https://nodejs.org/) 22.13.0 or newer
- [pnpm](https://pnpm.io/) 9 or newer

```bash
git clone https://github.com/xmannii/nimruz-desktop.git
cd nimruz-desktop
pnpm install
pnpm dev
```

### Useful scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Vite and Electron in development |
| `pnpm build` | Build the renderer and Electron main process |
| `pnpm start` | Build and launch the desktop app |
| `pnpm dist` | Build a platform installer |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run unit tests |

Workspace-specific MCP servers can be configured under **Settings → MCP servers**. See [Workspace MCP tools](docs/MCP.md) for transports, lifecycle, and the current authentication boundary. For provider setup and adapter behavior, see [Model provider adapters](docs/PROVIDERS.md).

<details>
<summary>Architecture</summary>

```text
Electron main (Node)
├─ authenticated local HTTP server
│  ├─ /api/chat       → workspace ToolLoopAgent or Codex app-server
│  ├─ /api/agent/run → workspace agent runtime
│  └─ /api/chat/title → automatic chat title generation
├─ SQLite             → chats, workspaces, artifacts, tasks, runs, memories, experts, settings
├─ workspace files   → scoped paths under linked or managed roots
├─ skills store      → ~/.nimruz/skills and standard agent skill paths
├─ secure storage    → provider keys and Codex credentials
└─ BrowserWindow     → sandboxed Vite / React renderer
```

</details>

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and pull request guidelines. Product changes and release notes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).
