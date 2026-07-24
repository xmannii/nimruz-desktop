import readline from "node:readline";

// A tiny standards-speaking MCP server used by automated and live desktop
// tests. It deliberately has no package dependencies, network access, or
// filesystem access so failures identify the client integration itself.
const input = readline.createInterface({ input: process.stdin });

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

input.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (!("id" in message)) return;

  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "nimruz-echo-fixture", version: "1.0.0" },
      instructions: "Use echo only when the user asks to repeat text.",
    });
    return;
  }
  if (message.method === "tools/list") {
    respond(message.id, {
      tools: [
        {
          name: "echo",
          description: "Return the provided text.",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }
  if (message.method === "tools/call") {
    respond(message.id, {
      content: [
        {
          type: "text",
          text: String(message.params?.arguments?.text ?? ""),
        },
      ],
      isError: false,
    });
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "Method not found" },
    })}\n`
  );
});
