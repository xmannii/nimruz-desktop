import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFile,
  codeLanguageFor,
  fileExtension,
} from "./file-types";

test("fileExtension extracts the lowercase extension", () => {
  assert.equal(fileExtension("dir/Report.MD"), "md");
  assert.equal(fileExtension("archive.tar.gz"), "gz");
  assert.equal(fileExtension("noext"), "");
  assert.equal(fileExtension(".gitignore"), "");
});

test("classifyFile routes known categories", () => {
  assert.equal(classifyFile("readme.md"), "markdown");
  assert.equal(classifyFile("data.csv"), "csv");
  assert.equal(classifyFile("config.json"), "json");
  assert.equal(classifyFile("photo.png"), "image");
  assert.equal(classifyFile("main.ts"), "code");
  assert.equal(classifyFile("report.pdf"), "binary");
  assert.equal(classifyFile("notes.txt"), "text");
});

test("codeLanguageFor maps extensions and dockerfiles", () => {
  assert.equal(codeLanguageFor("app.tsx"), "tsx");
  assert.equal(codeLanguageFor("main.py"), "python");
  assert.equal(codeLanguageFor("Dockerfile"), "dockerfile");
  assert.equal(codeLanguageFor("plain.txt"), null);
});
