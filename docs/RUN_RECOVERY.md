# Run recovery, queued follow-ups, and steering

Nimruz keeps follow-up instructions durable instead of discarding input while
an agent turn is running.

## Queue and steering behavior

- Pressing Enter during an active turn stores the text as a follow-up. It is
  delivered after the current turn's final callback has persisted its messages.
- **Steer now** stores the instruction first, interrupts the current turn, then
  starts the steering instruction as the next turn.
- Steering instructions are ordered ahead of ordinary follow-ups. Messages
  within each class retain their creation order.
- Queued messages are text-only, capped at 20 per chat and 20,000 characters
  each. Attachments remain disabled while a turn is active because replaying
  transient browser data would not be crash-safe.
- Queue rows live in SQLite and cascade when their chat is deleted. The visible
  queue lets the user remove an instruction before it runs.

Codex has a short cleanup phase after an interrupted HTTP stream. Nimruz waits
for the native app-server chat lock to be released before starting the steering
turn, preventing an instruction from being lost to an “active response” race.

## Application restart recovery

Model streams and in-memory approval resolvers cannot survive an Electron
process exit. On startup Nimruz therefore:

1. marks unfinished `queued`, `running`, and `awaiting_approval` run rows as
   failed with an explicit restart explanation;
2. denies their pending approval records;
3. marks unfinished tool calls failed; and
4. preserves queued chat messages for delivery when the chat runtime opens.

This is recovery, not fabricated continuation: Nimruz never claims that a
provider turn resumed when its process no longer exists. Completed audit rows,
messages, checkpoints, and queued user intent remain intact.

## Verification

```bash
pnpm exec tsx --test electron/storage/database.test.ts electron/storage/migration.test.ts electron/codex/service.test.ts
pnpm typecheck
pnpm test
```

