# Workspace MCP tools

Nimruz can connect a workspace agent to tools exposed by
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. The
configuration belongs to one workspace; it is not available in tool-free Chat
mode, Plan mode, Codex subscription chats, or other workspaces.

## Add a server

Open the app's **Settings**, choose **MCP servers**, and select the workspace
whose tools you want to manage. Nimruz supports:

- **stdio** — a local executable plus literal arguments. Put one argument on
  each line. Nimruz launches the executable directly (`shell: false`) with the
  workspace's primary folder as its working directory.
- **HTTP** — a streamable HTTP MCP endpoint and the default for new servers.
- **SSE** — a legacy Server-Sent Events MCP endpoint.

Save the server and use **Test connection**. A successful test reports the
number of tools returned by the server. Enabling a server makes its tools
available to new General/Agent-mode turns in that workspace.

## Choose servers for one chat

Open the **+** menu in the message composer to see the MCP servers configured
for that chat's workspace. Enabled workspace servers are selected by default.
You can uncheck one or more servers to exclude them from that chat without
changing the workspace setting; the selection is saved with the chat.

A server disabled in Settings remains visible but cannot be selected from the
composer. MCP is also unavailable in Chat or Plan mode, with Codex subscription
chats, or when the selected model does not support tools.

## Safety and lifecycle

- MCP tools are namespaced before they reach the model, so they cannot replace
  built-in Nimruz tools or tools from another server.
- Every MCP tool call requires explicit approval, even when the workspace
  auto-approves files, shell, or network access. MCP tools are third-party code
  and may perform actions outside the workspace.
- Stdio servers receive only a small environment allowlist plus
  `NIMRUZ_WORKSPACE`; Nimruz does not copy provider API keys or arbitrary parent
  environment variables into the child process.
- Connections are scoped to one agent run and closed on completion,
  cancellation, timeout, or failure. An unavailable optional server is reported
  by the connection test and does not prevent the rest of the workspace agent
  from running.

## Current authentication boundary

This release intentionally accepts no MCP environment secrets or authorization
headers. Server configuration is stored in local SQLite, while credentials
require OS-keychain-backed storage. Use an unauthenticated local/remote server
for now; authenticated MCP transports should be added only with dedicated
secure credential storage.
