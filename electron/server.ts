import http from "node:http";
import { Readable } from "node:stream";
import { promises as fs } from "node:fs";
import path from "node:path";
import { handleChatRequest, type ChatRequestBody } from "./chat-handler";

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function readJsonBody(req: http.IncomingMessage): Promise<ChatRequestBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        tooLarge = true;
        reject(new Error("Request body is too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function pipeWebResponse(
  webResponse: Response,
  res: http.ServerResponse
): Promise<void> {
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(webResponse.status, headers);

  if (webResponse.body) {
    Readable.fromWeb(webResponse.body as never).pipe(res);
  } else {
    res.end();
  }
}

async function serveStatic(
  rendererDir: string,
  urlPath: string,
  res: http.ServerResponse
): Promise<void> {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const relative = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const resolved = path.join(rendererDir, relative);

  // Prevent path traversal outside the renderer directory.
  if (!resolved.startsWith(rendererDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    // SPA fallback: unknown routes (e.g. /chat/:id) return index.html.
    try {
      const fallback = await fs.readFile(path.join(rendererDir, "index.html"));
      res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
      res.end(fallback);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}

type StartServerOptions = {
  port?: number;
  rendererDir?: string;
  sessionToken: string;
  resolveChatModel: (
    providerId?: string,
    modelId?: string
  ) => import("./chat-handler").ResolvedChatModel | null;
  allowedOrigins?: string[];
};

function isLoopbackHost(host: string | undefined): boolean {
  return Boolean(
    host &&
      (/^127\.0\.0\.1:\d+$/.test(host) || /^localhost:\d+$/.test(host))
  );
}

function getAllowedOrigin(
  req: http.IncomingMessage,
  allowedOrigins: Set<string>
): string | null {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (allowedOrigins.has(origin)) return origin;
  if (isLoopbackHost(req.headers.host) && origin === `http://${req.headers.host}`) {
    return origin;
  }
  return null;
}

export function startServer(
  options: StartServerOptions
): Promise<{ server: http.Server; port: number }> {
  const {
    port = 0,
    rendererDir,
    sessionToken,
    resolveChatModel,
    allowedOrigins = [],
  } = options;
  const originAllowlist = new Set(allowedOrigins);

  const server = http.createServer(async (req, res) => {
    if (!isLoopbackHost(req.headers.host)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const requestOrigin = req.headers.origin;
    const allowedOrigin = getAllowedOrigin(req, originAllowlist);
    if (requestOrigin && !allowedOrigin) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type"
      );
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";

    if (url.startsWith("/api/chat") && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${sessionToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      try {
        const body = await readJsonBody(req);
        const webResponse = await handleChatRequest(body, resolveChatModel);
        await pipeWebResponse(webResponse, res);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
      return;
    }

    if (rendererDir && req.method === "GET") {
      await serveStatic(rendererDir, url, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const boundPort =
        typeof address === "object" && address ? address.port : port;
      resolve({ server, port: boundPort });
    });
  });
}
