import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

type Fetch = typeof fetch;

export type ResumableDownloadOptions = {
  url: string;
  destination: string;
  expectedBytes: number;
  expectedSha256: string;
  signal: AbortSignal;
  onProgress?: (downloadedBytes: number) => void;
  fetch?: Fetch;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
};

class DownloadResponseError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: { retryable: boolean; retryAfterMs?: number | null }
  ) {
    super(message);
    this.name = "DownloadResponseError";
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

class DownloadIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadIntegrityError";
  }
}

function abortError() {
  return new DOMException("The download was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? abortError();
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(headers: Headers) {
  const value = headers.get("retry-after");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function isRetryableError(error: unknown) {
  if (error instanceof DownloadResponseError) return error.retryable;
  if (error instanceof DownloadIntegrityError) return true;

  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : null;
  if (
    code &&
    ["EACCES", "EDQUOT", "EISDIR", "EMFILE", "ENFILE", "ENOSPC", "EROFS"].includes(
      code
    )
  ) {
    return false;
  }

  // Node's fetch reports connection and response-stream failures as TypeError,
  // while socket failures may surface as ordinary Errors with a nested cause.
  return error instanceof Error;
}

function parseContentRange(value: string | null) {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(value ?? "");
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === "*" ? null : Number(match[3]),
  };
}

async function existingFileBytes(destination: string, expectedBytes: number) {
  try {
    const info = await stat(destination);
    if (!info.isFile() || info.size > expectedBytes) {
      await rm(destination, { force: true });
      return 0;
    }
    return info.size;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return 0;
    }
    throw error;
  }
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function defaultWait(delayMs: number, signal: AbortSignal) {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timeout.unref?.();
    if (signal.aborted) onAbort();
  });
}

async function verifyCompletedFile(options: ResumableDownloadOptions) {
  if ((await sha256File(options.destination)) === options.expectedSha256) {
    return true;
  }
  await rm(options.destination, { force: true });
  options.onProgress?.(0);
  return false;
}

async function downloadAttempt(
  options: ResumableDownloadOptions,
  fetchImplementation: Fetch
) {
  throwIfAborted(options.signal);
  let downloadedBytes = await existingFileBytes(
    options.destination,
    options.expectedBytes
  );
  options.onProgress?.(downloadedBytes);

  if (downloadedBytes === options.expectedBytes) {
    if (await verifyCompletedFile(options)) return;
    downloadedBytes = 0;
    throw new DownloadIntegrityError("Downloaded file failed its integrity check.");
  }

  const headers: Record<string, string> = {
    "User-Agent": "Nimruz-Desktop/Shenava",
  };
  if (downloadedBytes > 0) headers.Range = `bytes=${downloadedBytes}-`;

  const response = await fetchImplementation(options.url, {
    redirect: "follow",
    signal: options.signal,
    headers,
  });
  if (!response.ok || !response.body) {
    throw new DownloadResponseError(
      `Download request failed (${response.status}).`,
      {
        retryable: isRetryableStatus(response.status),
        retryAfterMs: retryAfterMs(response.headers),
      }
    );
  }

  if (downloadedBytes > 0 && response.status === 206) {
    const range = parseContentRange(response.headers.get("content-range"));
    if (
      !range ||
      range.start !== downloadedBytes ||
      (range.total !== null && range.total !== options.expectedBytes)
    ) {
      throw new DownloadResponseError("Server returned an invalid byte range.", {
        retryable: false,
      });
    }
  } else if (downloadedBytes > 0) {
    // Some mirrors ignore Range and return the complete file. Reuse that
    // response, but truncate the partial file before writing it.
    await rm(options.destination, { force: true });
    downloadedBytes = 0;
    options.onProgress?.(0);
  }

  const handle = await open(options.destination, downloadedBytes > 0 ? "r+" : "w");
  const reader = response.body.getReader();

  try {
    while (true) {
      throwIfAborted(options.signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (downloadedBytes + value.byteLength > options.expectedBytes) {
        throw new DownloadIntegrityError("Server sent more bytes than expected.");
      }

      let chunkOffset = 0;
      while (chunkOffset < value.byteLength) {
        const { bytesWritten } = await handle.write(
          value,
          chunkOffset,
          value.byteLength - chunkOffset,
          downloadedBytes + chunkOffset
        );
        if (bytesWritten === 0) throw new Error("Could not write downloaded data.");
        chunkOffset += bytesWritten;
      }
      downloadedBytes += value.byteLength;
      options.onProgress?.(downloadedBytes);
    }
    await handle.sync();
  } finally {
    reader.releaseLock();
    await handle.close();
  }

  if (downloadedBytes !== options.expectedBytes) {
    throw new DownloadIntegrityError("Download ended before the file was complete.");
  }
  if (!(await verifyCompletedFile(options))) {
    throw new DownloadIntegrityError("Downloaded file failed its integrity check.");
  }
}

export async function downloadFileWithResume(options: ResumableDownloadOptions) {
  const fetchImplementation = options.fetch ?? fetch;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelay = Math.max(
    0,
    options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS
  );
  const maxDelay = Math.max(
    baseDelay,
    options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS
  );
  const wait = options.wait ?? defaultWait;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await downloadAttempt(options, fetchImplementation);
      return;
    } catch (error) {
      if (isAbortError(error) || options.signal.aborted) {
        throw options.signal.reason ?? error;
      }
      if (attempt === maxAttempts || !isRetryableError(error)) throw error;

      const serverDelay =
        error instanceof DownloadResponseError ? error.retryAfterMs : null;
      const exponentialDelay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      const delay = Math.min(maxDelay, serverDelay ?? exponentialDelay);
      await wait(delay, options.signal);
    }
  }
}
