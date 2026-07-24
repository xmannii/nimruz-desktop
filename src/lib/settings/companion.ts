export const DEFAULT_COMPANION_SHORTCUT = "CommandOrControl+Shift+Space";
export const DEFAULT_COMPANION_MICROPHONE_SHORTCUT =
  "CommandOrControl+Shift+M";

export type CompanionShortcutSettings = {
  enabled: boolean;
  accelerator: string;
  microphoneEnabled: boolean;
  microphoneAccelerator: string;
};

export type CompanionShortcutState =
  | "registered"
  | "disabled"
  | "unavailable";

export type CompanionShortcutStatus = {
  settings: CompanionShortcutSettings;
  state: CompanionShortcutState;
  microphoneState: CompanionShortcutState;
};

export const DEFAULT_COMPANION_SHORTCUT_SETTINGS: CompanionShortcutSettings = {
  enabled: true,
  accelerator: DEFAULT_COMPANION_SHORTCUT,
  microphoneEnabled: true,
  microphoneAccelerator: DEFAULT_COMPANION_MICROPHONE_SHORTCUT,
};

const MODIFIERS = new Set([
  "CommandOrControl",
  "Command",
  "Control",
  "Alt",
  "Shift",
  "Super",
]);
const PRIMARY_MODIFIERS = new Set([
  "CommandOrControl",
  "Command",
  "Control",
  "Alt",
  "Super",
]);
const NAMED_KEYS = new Set([
  "Space",
  "Tab",
  "Enter",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Up",
  "Down",
  "Left",
  "Right",
]);

function isShortcutKey(value: string) {
  return (
    /^[A-Z0-9]$/.test(value) ||
    /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(value) ||
    NAMED_KEYS.has(value)
  );
}

export function isValidCompanionAccelerator(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  const parts = value.split("+");
  if (parts.length < 2 || parts.some((part) => !part)) return false;

  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  return Boolean(
    key &&
      isShortcutKey(key) &&
      modifiers.every((modifier) => MODIFIERS.has(modifier)) &&
      new Set(modifiers).size === modifiers.length &&
      modifiers.some((modifier) => PRIMARY_MODIFIERS.has(modifier))
  );
}

export function sanitizeCompanionShortcutSettings(
  value: unknown
): CompanionShortcutSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : DEFAULT_COMPANION_SHORTCUT_SETTINGS.enabled,
    accelerator: isValidCompanionAccelerator(settings.accelerator)
      ? settings.accelerator
      : DEFAULT_COMPANION_SHORTCUT_SETTINGS.accelerator,
    microphoneEnabled:
      typeof settings.microphoneEnabled === "boolean"
        ? settings.microphoneEnabled
        : DEFAULT_COMPANION_SHORTCUT_SETTINGS.microphoneEnabled,
    microphoneAccelerator: isValidCompanionAccelerator(
      settings.microphoneAccelerator
    )
      ? settings.microphoneAccelerator
      : DEFAULT_COMPANION_SHORTCUT_SETTINGS.microphoneAccelerator,
  };
}

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

const EVENT_KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
};

export function keyboardEventToCompanionAccelerator(
  event: ShortcutKeyboardEvent,
  platform: NodeJS.Platform
): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;

  const key =
    EVENT_KEY_NAMES[event.key] ??
    (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  if (!isShortcutKey(key)) return null;

  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push(platform === "darwin" ? "Command" : "Super");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  const accelerator = [...modifiers, key].join("+");
  return isValidCompanionAccelerator(accelerator) ? accelerator : null;
}

export function formatCompanionAccelerator(
  accelerator: string,
  platform: NodeJS.Platform
) {
  const parts = accelerator.split("+");
  if (platform !== "darwin") {
    return parts
      .map((part) =>
        part === "CommandOrControl"
          ? "Ctrl"
          : part === "Control"
            ? "Ctrl"
            : part
      )
      .join("+");
  }

  const labels: Record<string, string> = {
    CommandOrControl: "⌘",
    Command: "⌘",
    Control: "⌃",
    Alt: "⌥",
    Shift: "⇧",
    Super: "⌘",
    Up: "↑",
    Down: "↓",
    Left: "←",
    Right: "→",
  };
  return parts.map((part) => labels[part] ?? part).join("");
}
