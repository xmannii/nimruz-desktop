import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type {
  RemoteAccessSession,
  RemoteAccessStatus,
} from "@/lib/remote-access";
import type { AppDatabase } from "../storage/database";
import type { RunApprovalBroker } from "../agent/approval-broker";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 4_096;
const MAX_AUTH_FAILURES_PER_MINUTE = 20;

type FailureWindow = { count: number; startedAt: number };

function json(
  response: ServerResponse,
  status: number,
  value: unknown
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function secureTokenEquals(presented: string, expected: string): boolean {
  const presentedHash = createHash("sha256").update(presented).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

/**
 * A deliberately small remote surface for monitoring runs and resolving
 * provider-native approvals. It binds to loopback only; users reach it through
 * an authenticated SSH/private-network tunnel instead of exposing HTTP on LAN.
 */
export class RemoteAccessService {
  readonly #database: AppDatabase;
  readonly #approvals: RunApprovalBroker;
  readonly #failures = new Map<string, FailureWindow>();
  #server: Server | null = null;
  #token: string | null = null;
  #endpoint: string | null = null;
  #starting: Promise<RemoteAccessSession> | null = null;

  constructor(database: AppDatabase, approvals: RunApprovalBroker) {
    this.#database = database;
    this.#approvals = approvals;
  }

  getStatus(): RemoteAccessStatus {
    return {
      enabled: this.#server !== null,
      endpoint: this.#endpoint,
    };
  }

  async start(): Promise<RemoteAccessSession> {
    if (this.#server && this.#token && this.#endpoint) {
      return { enabled: true, endpoint: this.#endpoint, token: this.#token };
    }
    if (this.#starting) return this.#starting;
    this.#starting = this.#start();
    try {
      return await this.#starting;
    } finally {
      this.#starting = null;
    }
  }

  async #start(): Promise<RemoteAccessSession> {
    const token = randomBytes(32).toString("base64url");
    const server = http.createServer((request, response) => {
      void this.#handle(request, response, token);
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(0, LOOPBACK_HOST, () => {
        server.off("error", onError);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Remote access did not receive a TCP port.");
    }

    this.#server = server;
    this.#token = token;
    this.#endpoint = `http://${LOOPBACK_HOST}:${address.port}`;
    return {
      enabled: true,
      endpoint: this.#endpoint,
      token,
    };
  }

  async stop(): Promise<RemoteAccessStatus> {
    if (this.#starting) {
      await this.#starting.catch(() => undefined);
    }
    const server = this.#server;
    this.#server = null;
    this.#token = null;
    this.#endpoint = null;
    this.#failures.clear();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    return this.getStatus();
  }

  async #handle(
    request: IncomingMessage,
    response: ServerResponse,
    expectedToken: string
  ): Promise<void> {
    try {
      // Browser origins are unnecessary for the tunnel client and rejecting
      // them keeps a malicious web page from exercising this localhost API.
      if (request.headers.origin) {
        json(response, 403, { error: "Browser-origin requests are rejected." });
        return;
      }
      if (!this.#authorize(request, expectedToken)) {
        json(response, 401, { error: "Invalid remote access token." });
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/v1/status") {
        const runs = this.#database.listAgentRuns({ limit: 25 }).map((run) => ({
          id: run.id,
          workspaceId: run.workspaceId,
          chatId: run.chatId,
          status: run.status,
          model: run.model,
          providerId: run.providerId,
          stepCount: run.stepCount,
          totalTokens: run.totalTokens ?? 0,
          startedAt: run.startedAt,
          updatedAt: run.updatedAt,
          finishedAt: run.finishedAt,
        }));
        const pendingApprovals = this.#approvals.listPending().map((entry) => ({
          id: entry.approval.id,
          runId: entry.approval.runId,
          toolName: entry.approval.toolName,
          risk: entry.approval.risk,
          reason: entry.approval.reason,
          input: JSON.parse(entry.toolCall.inputJson),
          createdAt: entry.approval.createdAt,
        }));
        json(response, 200, {
          generatedAt: Date.now(),
          runs,
          pendingApprovals,
        });
        return;
      }

      const approvalMatch = url.pathname.match(/^\/v1\/approvals\/([^/]+)$/);
      if (request.method === "POST" && approvalMatch) {
        const body = await readJson(request);
        const approved =
          typeof body === "object" &&
          body !== null &&
          "approved" in body &&
          (body as { approved?: unknown }).approved;
        if (typeof approved !== "boolean") {
          json(response, 400, { error: "approved must be a boolean." });
          return;
        }
        const resolved = this.#approvals.resolve(
          decodeURIComponent(approvalMatch[1]),
          { approved, forSession: false }
        );
        if (!resolved) {
          json(response, 409, {
            error: "Approval is no longer pending or does not exist.",
          });
          return;
        }
        json(response, 200, { resolved: true, approved });
        return;
      }

      json(response, 404, { error: "Not found." });
    } catch (error) {
      const message =
        error instanceof SyntaxError
          ? "Request body must be valid JSON."
          : error instanceof Error &&
              error.message === "Request body is too large."
            ? error.message
            : "Request could not be completed.";
      json(response, 400, {
        error: message,
      });
    }
  }

  #authorize(request: IncomingMessage, expectedToken: string): boolean {
    const key = request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const current = this.#failures.get(key);
    const window =
      current && now - current.startedAt < 60_000
        ? current
        : { count: 0, startedAt: now };
    if (window.count >= MAX_AUTH_FAILURES_PER_MINUTE) return false;

    const header = request.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (secureTokenEquals(presented, expectedToken)) {
      this.#failures.delete(key);
      return true;
    }
    window.count += 1;
    this.#failures.set(key, window);
    return false;
  }
}
