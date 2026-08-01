# README screenshot plan

The README now uses the captures currently available in `public/screenshots/`. Keep these names; they are descriptive and already referenced by both language versions.

## Current captures

| File | What it proves |
| --- | --- |
| `agentic-tool-calls.png` | The agent can plan work and use tools inside a workspace. |
| `artifact.png` | A conversation can produce a previewable artifact. |
| `stt-1.png` | Local speech-to-text setup with an active Shenava model. |
| `stt-2.png` | Raw and corrected Persian transcription with export actions. |
| `model-providers.png` | Cloud, compatible, and local model provider choices. |
| `personalization.png` | Response style and profile personalization. |
| `simple-chat.png` | Lightweight chat without workspace tools. |

## The next screenshot: Telegram

The product story is not complete without one Telegram capture. Use a dedicated test account and capture a small conversation containing:

1. a text prompt or voice note;
2. a visible progress update while the agent is working;
3. the final answer; and
4. a delivered Markdown, PDF, or other artifact when the task produces one.

Save it as `public/screenshots/telegram-assistant.png`. Use Telegram Desktop if the phone UI is too narrow to read. Redact account identifiers and private messages.

## Capture settings

- Use PNG at roughly 1600×1000 or another 16:10 desktop-friendly size.
- Keep the whole app window when the sidebar or tool timeline helps explain the feature; crop tightly when the UI is otherwise empty.
- Use one theme consistently across the set. The current captures use the dark theme.
- Remove API keys, bot tokens, private Telegram messages, usernames, home-directory paths, and personal account details.
- Prefer completed states over loading spinners or empty settings pages.

When the Telegram image is ready, add it after the artifact section in both README files:

```md
### Telegram assistant

The same local agent can be reached from a phone through Telegram.

![Nimruz Telegram assistant](public/screenshots/telegram-assistant.png)
```

On macOS, use **Shift–Command–5** for a window or selection capture. On Windows, use **Win–Shift–S** or Snipping Tool. Review every image at 100% before committing it; README screenshots should be readable without opening them in a new tab.
