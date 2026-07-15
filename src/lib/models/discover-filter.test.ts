import assert from "node:assert/strict";
import test from "node:test";
import {
  extractModelId,
  extractModelListItems,
  isChatCompletionDiscoverableModel,
} from "./discover-filter";

test("extractModelListItems supports data and models arrays", () => {
  assert.equal(
    extractModelListItems({ data: [{ id: "a" }] }).length,
    1
  );
  assert.equal(
    extractModelListItems({ models: [{ id: "b" }] }).length,
    1
  );
});

test("filters image-generation and embedding models", () => {
  assert.equal(
    isChatCompletionDiscoverableModel(
      {
        architecture: {
          modality: "text+image->text+image",
          output_modalities: ["image", "text"],
        },
      },
      "google/gemini-2.5-flash-image"
    ),
    false
  );

  assert.equal(
    isChatCompletionDiscoverableModel(
      {
        architecture: {
          modality: "text+image+file->text",
          output_modalities: ["text"],
        },
      },
      "openai/gpt-4o"
    ),
    true
  );

  assert.equal(
    isChatCompletionDiscoverableModel({ id: "text-embedding-3-small" }, "text-embedding-3-small"),
    false
  );

  assert.equal(
    isChatCompletionDiscoverableModel({ id: "llama3.2" }, "llama3.2"),
    true
  );

  assert.equal(
    isChatCompletionDiscoverableModel(
      { id: "nomic-embed-text", name: "Nomic Embed Text" },
      "nomic-embed-text"
    ),
    false
  );
});

test("extractModelId reads id and model fields", () => {
  assert.equal(extractModelId({ id: "gpt-4o" }), "gpt-4o");
  assert.equal(extractModelId({ model: "llama3.2" }), "llama3.2");
  assert.equal(extractModelId({}), null);
});
