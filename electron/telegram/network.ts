import type { ProxyConfig, Session } from "electron";
import type { TelegramProxySettings } from "@/lib/telegram";

export function telegramProxyConfig(
  proxy: TelegramProxySettings
): ProxyConfig {
  if (proxy.mode === "system") return { mode: "system" };
  if (proxy.mode === "custom" && proxy.url) {
    return { mode: "fixed_servers", proxyRules: proxy.url };
  }
  return { mode: "direct" };
}

export function createTelegramNetwork(networkSession: Session) {
  const fetchImpl = (async (input, init) => {
    const requestInput = input instanceof URL ? input.toString() : input;
    return networkSession.fetch(requestInput, init);
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    async applyProxy(proxy: TelegramProxySettings) {
      await networkSession.setProxy(telegramProxyConfig(proxy));
      await networkSession.closeAllConnections();
    },
  };
}
