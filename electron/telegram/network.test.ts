import assert from "node:assert/strict";
import test from "node:test";
import { telegramProxyConfig } from "./network";

test("maps Telegram connection modes to isolated Electron proxy settings", () => {
  assert.deepEqual(telegramProxyConfig({ mode: "direct", url: null }), {
    mode: "direct",
  });
  assert.deepEqual(telegramProxyConfig({ mode: "system", url: null }), {
    mode: "system",
  });
  assert.deepEqual(
    telegramProxyConfig({ mode: "custom", url: "socks5://127.0.0.1:1080" }),
    {
      mode: "fixed_servers",
      proxyRules: "socks5://127.0.0.1:1080",
    }
  );
});
