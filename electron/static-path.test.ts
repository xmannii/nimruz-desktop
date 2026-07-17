import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveStaticPath } from "./static-path";

test("static paths stay inside the renderer directory", () => {
  const rendererDir = path.resolve("C:/Nimruz/dist");
  assert.deepEqual(resolveStaticPath(rendererDir, "/"), {
    ok: true,
    path: path.join(rendererDir, "index.html"),
  });
  assert.deepEqual(resolveStaticPath(rendererDir, "/assets/app.js?v=1"), {
    ok: true,
    path: path.join(rendererDir, "assets", "app.js"),
  });
  assert.deepEqual(resolveStaticPath(rendererDir, "/../dist-secret.txt"), {
    ok: false,
    status: 403,
  });
  assert.deepEqual(resolveStaticPath(rendererDir, "/%2e%2e/dist-electron/main.js"), {
    ok: false,
    status: 403,
  });
  assert.deepEqual(resolveStaticPath(rendererDir, "/%E0%A4%A"), {
    ok: false,
    status: 400,
  });
  assert.deepEqual(resolveStaticPath(rendererDir, "/bad%00path"), {
    ok: false,
    status: 400,
  });
});
