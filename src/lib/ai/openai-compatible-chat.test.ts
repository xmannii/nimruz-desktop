import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chatCompletionsUrl,
  extractCompletionText,
  readCompletionErrorMessage,
} from "@/lib/ai/openai-compatible-chat";

describe("openai-compatible chat completion helpers", () => {
  it("builds chat completions url", () => {
    assert.equal(
      chatCompletionsUrl("http://localhost:1234/v1/"),
      "http://localhost:1234/v1/chat/completions"
    );
  });

  it("extracts string message content", () => {
    assert.equal(
      extractCompletionText({
        choices: [{ message: { content: "  hello title  " } }],
      }),
      "  hello title  "
    );
  });

  it("extracts multipart message content", () => {
    assert.equal(
      extractCompletionText({
        choices: [
          {
            message: {
              content: [{ type: "text", text: "عنوان گفتگو" }],
            },
          },
        ],
      }),
      "عنوان گفتگو"
    );
  });

  it("reads nested api error messages", () => {
    assert.equal(
      readCompletionErrorMessage({
        error: {
          message:
            "Unsupported parameter: 'max_tokens' is not supported with this model.",
        },
      }),
      "Unsupported parameter: 'max_tokens' is not supported with this model."
    );
  });
});
