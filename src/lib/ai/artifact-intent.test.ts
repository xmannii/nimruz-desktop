import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldForceCreateArtifact } from "./artifact-intent";

describe("shouldForceCreateArtifact", () => {
  it("forces Persian flowchart / draw requests", () => {
    assert.equal(
      shouldForceCreateArtifact("یه فلوچارت بکش از نحوه کار کردن دنباله فیبوناچی"),
      true
    );
    assert.equal(shouldForceCreateArtifact("این دیاگرام رو رسم کن"), true);
    assert.equal(shouldForceCreateArtifact("یک نمودار mermaid بساز"), true);
  });

  it("forces English diagram / draw requests", () => {
    assert.equal(
      shouldForceCreateArtifact("draw a flowchart of the fibonacci sequence"),
      true
    );
    assert.equal(shouldForceCreateArtifact("make a mermaid diagram"), true);
  });

  it("forces HTML / landing page builds", () => {
    assert.equal(shouldForceCreateArtifact("یک لندینگ HTML بساز"), true);
    assert.equal(shouldForceCreateArtifact("create an html landing page"), true);
  });

  it("does not force plain Q&A", () => {
    assert.equal(shouldForceCreateArtifact("فیبوناچی چیست؟"), false);
    assert.equal(
      shouldForceCreateArtifact("explain how the fibonacci sequence works"),
      false
    );
    assert.equal(shouldForceCreateArtifact("۲ به‌علاوه ۲ چند می‌شود؟"), false);
  });
});
