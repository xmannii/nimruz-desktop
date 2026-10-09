import assert from "node:assert/strict";
import test from "node:test";
import {
  GEMINI_TTS_VOICES,
  minVideoPricePerSecond,
  parseElevenLabsModels,
  parseElevenLabsVoices,
  parseOpenRouterImageModels,
  parseOpenRouterSpeechModels,
  parseOpenRouterVideoModels,
  parseGoogleModels,
} from "./catalog";

test("keeps only image-output OpenRouter models and skips routers", () => {
  const models = parseOpenRouterImageModels({
    data: [
      {
        id: "google/gemini-image",
        name: "Google: Gemini Image",
        architecture: {
          input_modalities: ["text", "image"],
          output_modalities: ["image", "text"],
        },
      },
      {
        id: "openai/gpt-text",
        name: "Text only",
        architecture: { output_modalities: ["text"] },
      },
      {
        id: "openrouter/auto-beta",
        name: "Auto",
        architecture: { output_modalities: ["image"] },
      },
      { id: "bad id with spaces", architecture: { output_modalities: ["image"] } },
    ],
  });
  assert.deepEqual(models, [{
    id: "google/gemini-image",
    provider: "openrouter",
    createdAt: null,
    name: "Google: Gemini Image",
    description: "",
    acceptsImageInput: true,
  }]);
});

test("derives the cheapest per-second video price from mixed SKUs", () => {
  assert.equal(
    minVideoPricePerSecond({
      cents_per_image_input: "1",
      cents_per_video_output_second_480p: "2",
      cents_per_video_output_second_1080p: "14",
    }),
    0.02
  );
  assert.equal(
    minVideoPricePerSecond({
      duration_seconds_with_audio: "0.40",
      duration_seconds_without_audio: "0.20",
    }),
    0.2
  );
  assert.equal(minVideoPricePerSecond({ video_tokens: "0.000007" }), null);
  assert.equal(minVideoPricePerSecond(null), null);
});

test("skips video-to-video tools without selectable durations", () => {
  const models = parseOpenRouterVideoModels({
    data: [
      {
        id: "google/veo-3.1",
        name: "Google: Veo 3.1",
        supported_durations: [8, 4, 6, 4],
        supported_resolutions: ["720p", "1080p"],
        supported_aspect_ratios: ["16:9", "9:16"],
        supported_frame_images: ["first_frame", "last_frame"],
        generate_audio: true,
        pricing_skus: { duration_seconds_without_audio: "0.20" },
      },
      { id: "black-forest-labs/flux-video-edit", supported_durations: null },
    ],
  });
  assert.equal(models.length, 1);
  assert.deepEqual(models[0].durations, [4, 6, 8]);
  assert.equal(models[0].supportsFirstFrame, true);
  assert.equal(models[0].supportsAudio, true);
  assert.equal(models[0].minPricePerSecond, 0.2);
});

test("maps OpenRouter speech voices and instruction support", () => {
  const [eleven, gemini] = parseOpenRouterSpeechModels({
    data: [
      {
        id: "elevenlabs/eleven-v3",
        name: "ElevenLabs: Eleven v3",
        architecture: { output_modalities: ["speech"] },
        supported_voices: ["george", "sarah"],
      },
      {
        id: "google/gemini-tts",
        name: "Google: Gemini TTS",
        architecture: { output_modalities: ["speech"] },
        supported_voices: ["Kore"],
      },
    ],
  });
  assert.deepEqual(eleven.voices.map((voice) => voice.id), ["george", "sarah"]);
  assert.equal(eleven.supportsInstructions, false);
  assert.equal(gemini.supportsInstructions, true);
});

test("parses ElevenLabs voices and text-to-speech models", () => {
  const voices = parseElevenLabsVoices({
    voices: [
      {
        voice_id: "JBFqnCBsd6RMkjVDRZzb",
        name: "George",
        labels: { gender: "male", accent: "british" },
        preview_url: "https://example.com/george.mp3",
      },
      { voice_id: "../bad", name: "Bad" },
    ],
  });
  assert.equal(voices.length, 1);
  assert.equal(voices[0].description, "male · british");

  // Library voices (not usable on free API keys) sort after built-in ones.
  const ordered = parseElevenLabsVoices({
    voices: [
      { voice_id: "niloofar01", name: "Niloofar", category: "professional" },
      { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", category: "premade" },
      { voice_id: "cloned01", name: "Mine", category: "cloned" },
      { voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George", category: "premade" },
    ],
  });
  assert.deepEqual(
    ordered.map((voice) => voice.name),
    ["George", "Sarah", "Niloofar", "Mine"]
  );

  const models = parseElevenLabsModels(
    [
      { model_id: "eleven_v3", name: "Eleven v3", can_do_text_to_speech: true },
      { model_id: "eleven_sts", name: "STS", can_do_text_to_speech: false },
    ],
    voices
  );
  assert.deepEqual(models.map((model) => model.id), ["eleven_v3"]);
  assert.equal(models[0].provider, "elevenlabs");
});

test("splits Gemini API models into image, video, and speech", () => {
  const catalog = parseGoogleModels({
    models: [
      { name: "models/imagen-4.0-generate-001", displayName: "Imagen 4", supportedGenerationMethods: ["predict"] },
      { name: "models/gemini-3.1-flash-image-preview", displayName: "Nano Banana 2", supportedGenerationMethods: ["generateContent"] },
      { name: "models/veo-3.1-fast-generate-preview", displayName: "Veo 3.1 Fast", supportedGenerationMethods: ["predictLongRunning"] },
      { name: "models/veo-2.0-generate-001", displayName: "Veo 2", supportedGenerationMethods: ["predictLongRunning"] },
      { name: "models/gemini-3.1-flash-tts-preview", displayName: "Gemini TTS", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3-flash", displayName: "Gemini 3 Flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.1-flash-live-preview", supportedGenerationMethods: ["bidiGenerateContent"] },
      { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
    ],
  });
  assert.deepEqual(
    catalog.image.map((model) => [model.id, model.acceptsImageInput]),
    [
      ["imagen-4.0-generate-001", false],
      ["gemini-3.1-flash-image-preview", true],
    ]
  );
  assert.deepEqual(catalog.video.map((model) => model.id), [
    "veo-2.0-generate-001",
    "veo-3.1-fast-generate-preview",
  ]);
  assert.deepEqual(catalog.video[0].durations, [5, 6, 7, 8]);
  assert.deepEqual(catalog.video[1].resolutions, ["720p", "1080p"]);
  assert.equal(catalog.speech.length, 1);
  assert.equal(catalog.speech[0].provider, "google");
  assert.equal(catalog.speech[0].supportsSpeed, false);
  assert.equal(catalog.speech[0].voices.length, GEMINI_TTS_VOICES.length);
  // Plain Gemini models transcribe audio; image/TTS/live variants do not.
  assert.deepEqual(catalog.transcription.map((model) => model.id), ["gemini-3-flash"]);
});
