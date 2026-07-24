# Remote monitoring and approvals

Nimruz can start a minimal process-local HTTP API from **Settings → Remote
access**. It is disabled by default and disabled again whenever the application
restarts.

The API intentionally binds only to `127.0.0.1` on a random port. To use it
from another machine, forward that port over SSH or a private-network tunnel:

```bash
ssh -N -L LOCAL_PORT:127.0.0.1:NIMRUZ_PORT USER@NIMRUZ_PC
```

The settings page displays the exact endpoint, tunnel command, and a fresh
256-bit bearer token. The token lives only in main-process memory and rotates
when the service is stopped and started.

## API

All requests require `Authorization: Bearer TOKEN`.

`GET /v1/status` returns up to 25 recent agent runs and the currently pending
native Codex approvals. Run status includes identifiers, provider/model,
timestamps, step count, and total tokens. Pending approvals include the risk,
reason, and redacted provider input needed to make the decision.

`POST /v1/approvals/APPROVAL_ID` accepts:

```json
{ "approved": true }
```

Use `false` to deny. A successful request resolves the same in-memory approval
promise used by the desktop UI, so Codex actually continues or stops. Remote
decisions are always one-time decisions; they can never create a session-wide
allow rule.

## Security boundary

- The service never listens on a LAN interface and has no port-forwarding or
  cloud relay feature.
- Browser-origin requests are rejected, responses disable caching, and failed
  authentication attempts are rate limited.
- Status does not return chat messages, tool output, terminal output, errors,
  secrets, or arbitrary workspace file content.
- There is no endpoint to send prompts, execute commands, edit files, start
  terminals, or change settings.
- Only live provider-native approvals are listed and resolvable. Durable rows
  from old or already-resolved approvals cannot be replayed.

Treat the token like a password for the lifetime of the session. Prefer an SSH
or authenticated private-network tunnel whose transport is encrypted.

Run the API security and end-to-end approval tests with:

```bash
pnpm exec tsx --test electron/remote-access/service.test.ts
```
