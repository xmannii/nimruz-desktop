import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramErrorMessage } from "./telegram-errors";

test("translates common fetch, timeout, and proxy failures to Persian", () => {
  assert.match(
    getTelegramErrorMessage(
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      })
    ),
    /اتصال رد شد/
  );
  assert.match(
    getTelegramErrorMessage(new DOMException("Timed out", "TimeoutError")),
    /مهلت اتصال/
  );
  assert.match(
    getTelegramErrorMessage(new Error("ERR_PROXY_CONNECTION_FAILED")),
    /پراکسی/
  );
});

test("translates Bot API errors and preserves existing Persian messages", () => {
  assert.match(getTelegramErrorMessage(new Error("Unauthorized")), /توکن/);
  assert.match(
    getTelegramErrorMessage(
      new Error("Conflict: terminated by other getUpdates request")
    ),
    /هم‌زمان/
  );
  assert.equal(
    getTelegramErrorMessage(new Error("این پیام از قبل فارسی است.")),
    "این پیام از قبل فارسی است."
  );
});
