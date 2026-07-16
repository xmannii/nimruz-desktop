# Changelog

All notable changes to Nimruz Desktop are documented here.

## [0.3.1] — 2026-07-16

### Highlights

- **`fetch_url` tool** — the assistant can read public web pages (HTML cleaned to text, SSRF-safe).
- **Auto chat titles** — first message triggers a background title request; sidebar animates the new name (falls back to the user's prompt on failure).
- **Chat UX** — copy/regenerate on assistant messages, export chats (Markdown/JSON), pin chats, delete all chats.

### Web

- `fetch_url` agent tool with HTML stripping, entity decoding, and private-network blocking
- Expandable Persian tool UI in chat for fetch results

### Chat & sidebar

- Automatic title generation via `POST /api/chat/title` (minimal OpenAI-compatible request, works across imported providers)
- Typing animation for sidebar chat titles
- Pin chats with a dedicated pinned section
- Export single chat as Markdown or JSON from the sidebar menu
- Copy and regenerate actions on assistant messages
- Delete all chats (with confirmation) in the sidebar footer
- Hidden scrollbar on chat history list

### Fixes

- Tooltip triggers no longer nest `<button>` inside `<button>` (copy/regenerate, composer)
- Tool invocation UI refactored to shared Marker-based components

---

## [0.3.0] — 2026-07-16

### Highlights

- **Experts (متخصص‌ها)** — create reusable specialists in Settings, invoke them with `/` in chat, and route work through delegated expert tools.
- **Skills polish** — conditional prompts and cleaner tool UI alongside the skills system introduced in 0.2.0.
- **Automated releases** — Windows (NSIS) and macOS (DMG) installers built and published on every version bump to `main`.

### Experts

- User-defined experts with name, slug, instructions, triggers, and enable/disable toggle
- Slash-command picker in chat with RTL-friendly suggestions and keyboard navigation
- Selected expert shown as a badge; message text stays clean while routing via `selectedExpertSlug`
- Dynamic `expert_*` delegation tools (nested model call per expert)
- `create_expert` tool for chat-based expert creation
- Settings templates, validation, and usage guide

### Improvements

- Reorganized AI tools under `src/lib/ai/tools/` (memory, skills, expert management, delegation)
- Conditional system prompts — expert/skill sections only when relevant
- Shared expandable tool-invocation UI for memory, skill, and expert tools
- Expert validation uses shared limits; max-entry guard on chat-created experts

### Contributors

Thanks to [**@mshojaei77**](https://github.com/mshojaei77) for the original experts feature ([#2](https://github.com/xmannii/nimruz-desktop/pull/2)) — user-defined experts, expert tools, settings UI, and initial chat integration.

---

## [0.2.0] — 2026-07-16

### Highlights

- **Agent skills** — discover, enable, and author `SKILL.md` skills; the assistant loads them with `load_skill`.
- Unified settings sidebar for chat and settings navigation.

---

## [0.1.3] — 2026-07-15

- Fix release builds skipping electron-builder publish.

---

## [0.1.0] — 2026-07-15

- Initial public release — streaming Persian chat, OpenRouter, projects, memories, personalization, local SQLite storage.

[0.3.1]: https://github.com/xmannii/nimruz-desktop/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/xmannii/nimruz-desktop/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/xmannii/nimruz-desktop/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/xmannii/nimruz-desktop/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/xmannii/nimruz-desktop/releases/tag/v0.1.0
