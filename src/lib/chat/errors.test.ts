import assert from "node:assert/strict";
import test from "node:test";
import { getChatErrorMessage } from "./errors";

test("extracts nested API error messages", () => {
  const message = getChatErrorMessage({
    statusCode: 400,
    data: {
      error: {
        message:
          "Function tools with reasoning_effort are not supported for gpt-5.6-luna.",
      },
    },
    responseBody:
      '{"error":{"message":"Function tools with reasoning_effort are not supported for gpt-5.6-luna."}}',
  });

  assert.match(message, /Function tools with reasoning_effort/);
});

test("falls back for unknown errors", () => {
  assert.equal(
    getChatErrorMessage(null),
    "خطایی در ارتباط با مدل رخ داد. لطفاً دوباره تلاش کنید."
  );
});
