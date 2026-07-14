# Nimruz — Desktop

Persian AI chat desktop app (Electron + Vite). The React UI is rendered by
Vite; the `/api/chat` streaming route runs inside the Electron main process
through an authenticated local HTTP server. Users configure their OpenRouter API
key inside the app.

## Architecture

```
Electron main (Node)
├─ authenticated local HTTP server
│  ├─ POST /api/chat  → streamText + OpenRouter
│  └─ GET  /*         → static renderer (production only)
├─ SQLite database    → chats, projects, memories, personalization
├─ safeStorage        → encrypted OpenRouter API key
└─ BrowserWindow → sandboxed Vite renderer
```

- **Dev:** Vite serves the renderer on `:5173` and proxies `/api` to the
  main-process server on `:43117`.
- **Prod:** the main-process server serves both the static renderer and the
  chat API on one random localhost port.

## Setup

```bash
pnpm install
```

After launch, open Settings → Connection to save and test an OpenRouter API
key. The key is encrypted through macOS Keychain, Windows DPAPI, or a Linux
libsecret/KWallet keyring. Linux refuses to store it when only Electron's
insecure `basic_text` backend is available.

## Develop

```bash
pnpm dev
```

## Build a distributable

```bash
pnpm dist   # outputs to release/ (dmg / nsis / AppImage)
```

## Relationship to the web app

This is an independent app. The UI under `src/components`, `src/lib`, and
`src/hooks` was copied from the Next.js web app. The two apps can diverge;
port UI changes manually when you want them in both.

## Local data

Application data is stored in Electron's platform-specific `userData`
directory (folder name **Nimruz**) as `nimruz.sqlite3`. Existing
IndexedDB/localStorage data is imported once and retained as a rollback copy.
Saved API keys are intentionally not portable between machines or
operating-system users.
