import assert from "node:assert/strict";
import test from "node:test";
import {
  bflSizeForAspect,
  buildBflImageBody,
  buildBflVideoBody,
  isBflApiUrl,
  parseBflPoll,
} from "./bfl";

test("maps aspect ratios to ~1MP sizes in multiples of 16", () => {
  assert.deepEqual(bflSizeForAspect("1:1"), { width: 1024, height: 1024 });
  const wide = bflSizeForAspect("16:9");
  assert.equal(wide.width % 16, 0);
  assert.equal(wide.height % 16, 0);
  assert.ok(wide.width > wide.height);
});

test("builds family-specific image bodies", () => {
  assert.deepEqual(
    buildBflImageBody({
      modelId: "flux-3-image",
      prompt: "x",
      aspectRatio: "3:4",
      references: ["data:image/png;base64,AAA"],
    }),
    { prompt: "x", aspect_ratio: "3:4", images: ["AAA"] }
  );
  const flux2 = buildBflImageBody({
    modelId: "flux-2-pro",
    prompt: "x",
    aspectRatio: "1:1",
    references: ["data:image/png;base64,A", "data:image/png;base64,B"],
  });
  assert.equal(flux2.width, 1024);
  assert.equal(flux2.input_image, "A");
  assert.equal(flux2.input_image_2, "B");
  assert.deepEqual(
    buildBflImageBody({ modelId: "flux-pro-1.1-ultra", prompt: "x", aspectRatio: "21:9", references: ["data:image/png;base64,Z"] }),
    { prompt: "x", aspect_ratio: "21:9", image_prompt: "Z", output_format: "png" }
  );
  // Text-only models ignore references entirely.
  assert.equal(
    buildBflImageBody({ modelId: "flux-dev", prompt: "x", references: ["data:image/png;base64,Z"] }).input_image,
    undefined
  );
});

test("builds text-to-video and image-to-video bodies", () => {
  assert.deepEqual(buildBflVideoBody({ prompt: "x", duration: 8, generateAudio: false }), {
    mode: "t2v",
    prompt: "x",
    aspect_ratio: "auto",
    duration: 8,
    resolution: "hd",
    generate_audio: false,
  });
  const i2v = buildBflVideoBody({ prompt: "x", duration: 99, firstFrame: "data:image/jpeg;base64,QQ" });
  assert.equal(i2v.mode, "i2v");
  assert.equal(i2v.duration, "auto");
  assert.equal(i2v.keyframes, "QQ");
});

test("only treats BFL https hosts as safe for the API key", () => {
  assert.equal(isBflApiUrl("https://api.us.bfl.ai/v1/get_result?id=1"), true);
  assert.equal(isBflApiUrl("https://delivery-eu1.bfl.ai/x.png"), true);
  assert.equal(isBflApiUrl("https://evil.example/bfl.ai"), false);
  assert.equal(isBflApiUrl("http://api.bfl.ai/v1"), false);
  assert.equal(isBflApiUrl("https://notbfl.ai/x"), false);
});

test("interprets polling states", () => {
  assert.deepEqual(parseBflPoll({ status: "Pending" }), { state: "pending" });
  assert.deepEqual(parseBflPoll({ status: "Generating" }), { state: "pending" });
  assert.deepEqual(
    parseBflPoll({ status: "Ready", result: { sample: "https://delivery-us1.bfl.ai/a.png" }, cost: 4 }),
    { state: "ready", url: "https://delivery-us1.bfl.ai/a.png", cost: 0.04 }
  );
  assert.equal(parseBflPoll({ status: "Ready", result: { sample: "https://elsewhere.com/a.png" } }).state, "failed");
  assert.match(
    (parseBflPoll({ status: "Content Moderated" }) as { message: string }).message,
    /سیاست محتوا/
  );
});
