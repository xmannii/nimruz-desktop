type ApiErrorPayload = {
  error?: {
    message?: string;
  };
  message?: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readApiErrorMessage(value: unknown): string | null {
  const record = readRecord(value);
  if (!record) return null;

  const data = readRecord(record.data);
  const dataMessage = data?.error;
  if (dataMessage && typeof dataMessage === "object") {
    const message = (dataMessage as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  const responseBody = record.responseBody;
  if (typeof responseBody === "string" && responseBody.trim()) {
    try {
      const parsed = JSON.parse(responseBody) as ApiErrorPayload;
      const message = parsed.error?.message;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // ignore invalid JSON bodies
    }
  }

  const directError = record.error;
  if (typeof directError === "string" && directError.trim()) {
    return directError.trim();
  }
  if (directError && typeof directError === "object") {
    const message = (directError as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return null;
}

export function getChatErrorMessage(
  error: unknown,
  fallback = "خطایی در ارتباط با مدل رخ داد. لطفاً دوباره تلاش کنید."
): string {
  const direct = readApiErrorMessage(error);
  if (direct) return direct;

  if (error instanceof Error) {
    const fromError = readApiErrorMessage(error);
    if (fromError) return fromError;

    const cause = (error as Error & { cause?: unknown }).cause;
    const fromCause = readApiErrorMessage(cause);
    if (fromCause) return fromCause;

    if (error.message.trim()) return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}
