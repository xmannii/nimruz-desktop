import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeminiTtsPrompt,
  buildGeminiTtsRequest,
  geminiAudioToFile,
  isGeminiTtsModel,
  supportsSpeechMetadataStyle,
} from "./tts-prompt";

test("leaves the script untouched when there is no direction", () => {
  assert.equal(buildGeminiTtsPrompt("سلام دنیا", undefined), "سلام دنیا");
  assert.equal(buildGeminiTtsPrompt("سلام دنیا", "   "), "سلام دنیا");
});

test("separates direction from the words to speak for older models", () => {
  const prompt = buildGeminiTtsPrompt("سلام دنیا", "گرم و آرام");
  const [direction, transcript] = prompt.split("#### TRANSCRIPT\n");
  assert.match(direction, /Do NOT speak them/);
  assert.equal(transcript, "سلام دنیا");
});

test("recognises Gemini TTS ids on Google and OpenRouter", () => {
  assert.equal(isGeminiTtsModel("gemini-3.1-flash-tts-preview"), true);
  assert.equal(isGeminiTtsModel("google/gemini-3.8-flash-tts"), true);
  assert.equal(isGeminiTtsModel("openai/gpt-4o-mini-tts"), false);
  assert.equal(isGeminiTtsModel("google/gemini-3-flash"), false);
});

test("detects models that take speech_metadata.style", () => {
  assert.equal(supportsSpeechMetadataStyle("gemini-3.8-flash-tts"), true);
  assert.equal(supportsSpeechMetadataStyle("gemini-3.8-flash-lite-tts"), true);
  assert.equal(supportsSpeechMetadataStyle("gemini-4-flash-tts"), true);
  assert.equal(supportsSpeechMetadataStyle("gemini-3.1-flash-tts-preview"), false);
  assert.equal(supportsSpeechMetadataStyle("gemini-2.5-pro-preview-tts"), false);
});

test("Gemini 3.8 keeps the transcript verbatim and the tone in metadata", () => {
  const body = buildGeminiTtsRequest({
    modelId: "gemini-3.8-flash-tts",
    text: "سلام دنیا",
    voice: "Kore",
    style: "گرم و آرام",
  });
  assert.deepEqual(body.contents[0].parts[0], {
    text: "سلام دنیا",
    speech_metadata: { style: "گرم و آرام" },
  });
  assert.deepEqual(body.generationConfig.speechConfig, { voiceConfig: { voice: "Kore" } });
});

test("older models embed the tone as a structured prompt", () => {
  const body = buildGeminiTtsRequest({
    modelId: "gemini-3.1-flash-tts-preview",
    text: "سلام",
    voice: "Kore",
    style: "آرام",
  });
  const part = body.contents[0].parts[0] as { text: string; speech_metadata?: unknown };
  assert.equal(part.speech_metadata, undefined);
  assert.match(part.text, /#### TRANSCRIPT\nسلام$/);
  assert.deepEqual(body.generationConfig.speechConfig, {
    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
  });
});

test("wraps raw PCM in a WAV header and passes encoded audio through", () => {
  const wav = geminiAudioToFile(Buffer.alloc(48), "audio/L16;codec=pcm;rate=24000");
  assert.equal(wav.mimeType, "audio/wav");
  assert.equal(wav.data.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.data.readUInt32LE(24), 24_000);
  assert.equal(wav.data.byteLength, 44 + 48);
  const mp3 = geminiAudioToFile(Buffer.from([1, 2]), "audio/mpeg");
  assert.equal(mp3.mimeType, "audio/mpeg");
  assert.equal(mp3.data.byteLength, 2);
});
