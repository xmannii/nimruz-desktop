import assert from "node:assert/strict";
import test from "node:test";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { TelegramMessage } from "./api";
import {
  buildTelegramUserContent,
  collectArtifactDeliverables,
  extractTelegramInboundMedia,
  telegramDocumentFilename,
  validateTelegramInboundMedia,
} from "./media";

function privateMessage(
  partial: Partial<TelegramMessage> & Pick<TelegramMessage, "message_id">
): TelegramMessage {
  return {
    chat: { id: 1, type: "private" },
    from: { id: 9, is_bot: false, first_name: "T" },
    ...partial,
  };
}

test("extractTelegramInboundMedia prefers the largest photo size", () => {
  const media = extractTelegramInboundMedia(
    privateMessage({
      message_id: 1,
      caption: "look",
      photo: [
        {
          file_id: "small",
          file_unique_id: "u1",
          width: 90,
          height: 90,
          file_size: 100,
        },
        {
          file_id: "large",
          file_unique_id: "u2",
          width: 1280,
          height: 720,
          file_size: 50_000,
        },
      ],
    })
  );
  assert.ok(media);
  assert.equal(media.fileId, "large");
  assert.equal(media.isImage, true);
  assert.equal(media.caption, "look");
  assert.equal(media.fileName, "photo.jpg");
});

test("extractTelegramInboundMedia reads documents", () => {
  const media = extractTelegramInboundMedia(
    privateMessage({
      message_id: 2,
      document: {
        file_id: "doc-1",
        file_unique_id: "d1",
        file_name: "notes.md",
        mime_type: "text/markdown",
        file_size: 120,
      },
    })
  );
  assert.ok(media);
  assert.equal(media.fileName, "notes.md");
  assert.equal(media.category, "markdown");
  assert.equal(media.isImage, false);
});

test("validateTelegramInboundMedia gates images on vision support", () => {
  const image = extractTelegramInboundMedia(
    privateMessage({
      message_id: 3,
      photo: [
        {
          file_id: "p",
          file_unique_id: "u",
          width: 100,
          height: 100,
        },
      ],
    })
  )!;
  assert.equal(
    validateTelegramInboundMedia(image, { supportsImages: false }).ok,
    false
  );
  assert.equal(
    validateTelegramInboundMedia(image, { supportsImages: true }).ok,
    true
  );
});

test("validateTelegramInboundMedia allows pdf and rejects zip", () => {
  const pdf = extractTelegramInboundMedia(
    privateMessage({
      message_id: 4,
      document: {
        file_id: "pdf",
        file_unique_id: "p",
        file_name: "spec.pdf",
        mime_type: "application/pdf",
      },
    })
  )!;
  assert.equal(
    validateTelegramInboundMedia(pdf, { supportsImages: false }).ok,
    true
  );

  const zip = extractTelegramInboundMedia(
    privateMessage({
      message_id: 5,
      document: {
        file_id: "zip",
        file_unique_id: "z",
        file_name: "bundle.zip",
        mime_type: "application/zip",
      },
    })
  )!;
  assert.equal(
    validateTelegramInboundMedia(zip, { supportsImages: false }).ok,
    false
  );
});

test("buildTelegramUserContent uses file parts for vision images and @path for docs", () => {
  const vision = buildTelegramUserContent({
    caption: "این چیه؟",
    supportsImages: true,
    imported: [
      {
        name: "shot.png",
        relativePath: "uploads/shot.png",
        mimeType: "image/png",
        category: "image",
        base64: "abc",
      },
    ],
  });
  assert.equal(vision.parts[0]?.type, "file");
  assert.ok(
    vision.parts.some(
      (part) => part.type === "text" && part.text.includes("این چیه؟")
    )
  );
  assert.equal(vision.metadata, undefined);

  const doc = buildTelegramUserContent({
    caption: "",
    supportsImages: true,
    imported: [
      {
        name: "a.ts",
        relativePath: "uploads/a.ts",
        mimeType: "text/plain",
        category: "code",
      },
    ],
  });
  assert.ok(
    doc.parts.some(
      (part) =>
        part.type === "text" &&
        part.text.includes("@uploads/a.ts") &&
        part.text.includes("بررسی")
    )
  );
  assert.equal(doc.metadata?.attachments[0]?.relativePath, "uploads/a.ts");
});

test("collectArtifactDeliverables reads create_artifact tool outputs", () => {
  const message = {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-create_artifact",
        toolCallId: "c1",
        state: "output-available",
        output: {
          id: "art-1",
          title: "Report",
          kind: "markdown",
          path: "/tmp/art-1.md",
          sizeBytes: 12,
        },
      },
      {
        type: "tool-create_artifact",
        toolCallId: "c2",
        state: "approval-requested",
        output: undefined,
      },
      { type: "text", text: "done" },
    ],
  } as ChatUIMessage;

  assert.deepEqual(collectArtifactDeliverables(message), [
    {
      id: "art-1",
      title: "Report",
      kind: "markdown",
      path: "/tmp/art-1.md",
      sizeBytes: 12,
    },
  ]);
});

test("telegramDocumentFilename sanitizes title and keeps extension", () => {
  assert.equal(
    telegramDocumentFilename("My / Report?", "/x/y/z.md"),
    "My Report.md"
  );
});
