import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackTitleFromMessage,
  isValidChatTitle,
  normalizeChatTitle,
} from "@/lib/ai/chat-title";

describe("chat title helpers", () => {
  it("normalizes whitespace", () => {
    assert.equal(normalizeChatTitle("  hello   world  "), "hello world");
  });

  it("validates title length", () => {
    assert.equal(isValidChatTitle("سؤال درباره React"), true);
    assert.equal(isValidChatTitle(""), false);
    assert.equal(isValidChatTitle("x".repeat(81)), false);
  });

  it("falls back to a truncated message title", () => {
    assert.equal(fallbackTitleFromMessage("  hello   "), "hello");
    assert.equal(
      fallbackTitleFromMessage("x".repeat(100)).length,
      80
    );
  });
});
