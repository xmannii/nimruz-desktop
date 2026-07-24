import {
  BrowserWindow,
  Menu,
  Tray,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
  type NativeImage,
} from "electron";
import { nanoid } from "nanoid";
import {
  COMPANION_WINDOW_SIZE,
  fitCaptureSize,
  positionCompanionWindow,
  validateCompanionConversation,
  validateCompanionDraft,
  validateCompanionStatus,
  type CompanionOpenChatRequest,
  type CompanionPromptRequest,
  type CompanionScreenshot,
  type CompanionScreenCapturePermission,
} from "@/lib/companion";
import { APP_NAME_FA } from "@/lib/branding";
import {
  DEFAULT_COMPANION_SHORTCUT_SETTINGS,
  formatCompanionAccelerator,
  sanitizeCompanionShortcutSettings,
  type CompanionShortcutSettings,
  type CompanionShortcutStatus,
} from "@/lib/settings/companion";
import {
  isSafeExternalHttpUrl,
  isTrustedRendererUrl,
} from "../renderer-security";
import { createTrayIcon } from "../tray-icon";

const COMPANION_WIDTH = COMPANION_WINDOW_SIZE.width;
const COMPANION_HEIGHT = COMPANION_WINDOW_SIZE.height;
type CompanionAnchor = "tray" | "cursor";

type CompanionControllerOptions = {
  rendererUrl: string;
  preloadPath: string;
  icon?: NativeImage;
  getMainWindow: () => BrowserWindow | null;
  loadShortcutSettings: () => CompanionShortcutSettings;
  saveShortcutSettings: (value: unknown) => CompanionShortcutSettings;
  onQuit: () => void;
};

export class CompanionController {
  private tray: Tray | null = null;
  private window: BrowserWindow | null = null;
  private captureInProgress = false;
  private lastAnchor: CompanionAnchor = "tray";
  private shortcutStatus: CompanionShortcutStatus = {
    settings: DEFAULT_COMPANION_SHORTCUT_SETTINGS,
    state: "disabled",
    microphoneState: "disabled",
  };
  private readonly channels = [
    "companion:hide",
    "companion:quit",
    "companion:open-main",
    "companion:capture-screen",
    "companion:submit",
    "companion:report-status",
    "companion:report-conversation",
    "companion:clear-conversation",
    "companion:get-screen-capture-permission",
    "companion:open-screen-capture-settings",
    "companion:get-shortcut-status",
    "companion:set-shortcut-settings",
  ];

  constructor(private readonly options: CompanionControllerOptions) {}

  async initialize() {
    this.registerIpcHandlers();
    this.createWindow();
    this.createTray();
    await this.window?.loadURL(
      new URL("/companion", this.options.rendererUrl).toString()
    );
    this.applyShortcut(this.options.loadShortcutSettings());
  }

  getWindow() {
    return this.window;
  }

  show(anchor: CompanionAnchor = this.lastAnchor) {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    this.lastAnchor = anchor;
    this.moveToAnchor(anchor);
    window.show();
    window.focus();
    window.webContents.send("companion:visibility", true);
    window.webContents.send("companion:shortcut-status", this.shortcutStatus);
  }

  hide() {
    const window = this.window;
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    window.hide();
    window.webContents.send("companion:visibility", false);
  }

  toggle(anchor: CompanionAnchor = this.lastAnchor) {
    if (this.window?.isVisible()) {
      this.hide();
    } else {
      this.show(anchor);
    }
  }

  dispose() {
    for (const channel of this.channels) ipcMain.removeHandler(channel);
    globalShortcut.unregister(this.shortcutStatus.settings.accelerator);
    globalShortcut.unregister(
      this.shortcutStatus.settings.microphoneAccelerator
    );
    this.tray?.destroy();
    this.tray = null;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  private createWindow() {
    const window = new BrowserWindow({
      width: COMPANION_WIDTH,
      height: COMPANION_HEIGHT,
      minWidth: COMPANION_WIDTH,
      minHeight: COMPANION_HEIGHT,
      maxWidth: COMPANION_WIDTH,
      maxHeight: COMPANION_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: `${APP_NAME_FA} — دستیار سریع`,
      backgroundColor: "#181818",
      roundedCorners: true,
      icon: this.options.icon,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape" && input.type === "keyDown") {
        event.preventDefault();
        this.hide();
      }
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (isTrustedRendererUrl(url, this.options.rendererUrl)) return;
      event.preventDefault();
      if (isSafeExternalHttpUrl(url)) void shell.openExternal(url);
    });
    window.webContents.on("will-redirect", (event, url) => {
      if (isTrustedRendererUrl(url, this.options.rendererUrl)) return;
      event.preventDefault();
      if (isSafeExternalHttpUrl(url)) void shell.openExternal(url);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalHttpUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.on("blur", () => {
      if (!this.captureInProgress && !window.webContents.isDevToolsOpened()) {
        this.hide();
      }
    });
    window.on("close", (event) => {
      event.preventDefault();
      this.hide();
    });

    this.window = window;
  }

  private createTray() {
    const icon = this.options.icon;
    if (!icon || icon.isEmpty()) return;

    const trayIcon = createTrayIcon(icon);
    const tray = new Tray(trayIcon);
    tray.setToolTip(`${APP_NAME_FA} — دستیار سریع`);
    tray.on("click", () => this.toggle("tray"));
    tray.on("right-click", () => tray.popUpContextMenu(this.createTrayMenu()));
    this.tray = tray;
  }

  private createTrayMenu() {
    const { settings, state } = this.shortcutStatus;
    const shortcut = settings.enabled
      ? formatCompanionAccelerator(settings.accelerator, process.platform)
      : "غیرفعال";
    return Menu.buildFromTemplate([
      {
        label: `دستیار سریع (${state === "unavailable" ? "میانبر در دسترس نیست" : shortcut})`,
        click: () => this.show("tray"),
      },
      {
        label: "باز کردن نیمروز",
        click: () => this.openMainWindow(),
      },
      { type: "separator" },
      {
        label: "خروج از نیمروز",
        click: this.options.onQuit,
      },
    ]);
  }

  private applyShortcut(value: unknown) {
    const settings = sanitizeCompanionShortcutSettings(value);
    globalShortcut.unregister(this.shortcutStatus.settings.accelerator);
    globalShortcut.unregister(
      this.shortcutStatus.settings.microphoneAccelerator
    );

    const state = this.registerGlobalShortcut(
      settings.enabled,
      settings.accelerator,
      () => this.toggle("cursor")
    );
    const microphoneState = this.registerGlobalShortcut(
      settings.microphoneEnabled,
      settings.microphoneAccelerator,
      () => {
        this.show("cursor");
        setTimeout(() => {
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send("companion:toggle-microphone");
          }
        }, 80);
      }
    );
    this.updateShortcutStatus({ settings, state, microphoneState });
    return this.shortcutStatus;
  }

  private registerGlobalShortcut(
    enabled: boolean,
    accelerator: string,
    callback: () => void
  ): CompanionShortcutStatus["state"] {
    if (!enabled) return "disabled";
    try {
      const registered = globalShortcut.register(accelerator, callback);
      if (registered) return "registered";
      console.warn(`Unable to register companion shortcut: ${accelerator}`);
    } catch (error) {
      console.warn(`Unable to register companion shortcut: ${accelerator}`, error);
    }
    return "unavailable";
  }

  private updateShortcutStatus(status: CompanionShortcutStatus) {
    this.shortcutStatus = status;
    for (const window of [this.options.getMainWindow(), this.window]) {
      if (window && !window.isDestroyed()) {
        window.webContents.send("companion:shortcut-status", status);
      }
    }
  }

  private moveToAnchor(anchor: CompanionAnchor) {
    const cursor = screen.getCursorScreenPoint();
    const trayBounds =
      anchor === "tray" && this.tray
        ? this.tray.getBounds()
        : { x: cursor.x, y: cursor.y, width: 1, height: 1 };
    const anchorPoint = trayBounds.width
      ? {
          x: Math.round(trayBounds.x + trayBounds.width / 2),
          y: Math.round(trayBounds.y + trayBounds.height / 2),
        }
      : cursor;
    const display = screen.getDisplayNearestPoint(anchorPoint);
    const position = positionCompanionWindow(trayBounds, display.workArea);
    this.window?.setPosition(position.x, position.y, false);
  }

  private openMainWindow(target?: CompanionOpenChatRequest) {
    const mainWindow = this.options.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    this.hide();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (target) mainWindow.webContents.send("companion:open-chat", target);
  }

  private assertSender(event: IpcMainInvokeEvent, expected: "main" | "companion") {
    const expectedWindow =
      expected === "main" ? this.options.getMainWindow() : this.window;
    const frame = event.senderFrame;
    if (
      !expectedWindow ||
      expectedWindow.isDestroyed() ||
      event.sender !== expectedWindow.webContents ||
      !frame ||
      frame !== expectedWindow.webContents.mainFrame ||
      !isTrustedRendererUrl(frame.url, this.options.rendererUrl)
    ) {
      throw new Error("Untrusted companion IPC sender.");
    }
  }

  private assertKnownSender(event: IpcMainInvokeEvent) {
    const sender = event.sender;
    const frame = event.senderFrame;
    const windows = [this.options.getMainWindow(), this.window];
    const trusted = windows.some(
      (window) =>
        window &&
        !window.isDestroyed() &&
        sender === window.webContents &&
        frame === window.webContents.mainFrame
    );
    if (!trusted || !frame || !isTrustedRendererUrl(frame.url, this.options.rendererUrl)) {
      throw new Error("Untrusted companion IPC sender.");
    }
  }

  private registerIpcHandlers() {
    ipcMain.handle("companion:hide", (event) => {
      this.assertSender(event, "companion");
      this.hide();
    });
    ipcMain.handle("companion:quit", (event) => {
      this.assertSender(event, "companion");
      this.options.onQuit();
    });
    ipcMain.handle(
      "companion:open-main",
      (event, target?: CompanionOpenChatRequest) => {
        this.assertSender(event, "companion");
        const safeTarget =
          target &&
          /^[\w-]{1,128}$/.test(target.chatId) &&
          /^[\w-]{1,128}$/.test(target.workspaceId)
            ? target
            : undefined;
        this.openMainWindow(safeTarget);
      }
    );
    ipcMain.handle("companion:capture-screen", async (event) => {
      this.assertSender(event, "companion");
      return this.captureCurrentScreen();
    });
    ipcMain.handle("companion:get-screen-capture-permission", (event) => {
      this.assertKnownSender(event);
      return this.getScreenCapturePermission();
    });
    ipcMain.handle("companion:open-screen-capture-settings", async (event) => {
      this.assertKnownSender(event);
      if (process.platform !== "darwin") return;
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
      );
    });
    ipcMain.handle("companion:submit", (event, value: unknown) => {
      this.assertSender(event, "companion");
      const draft = validateCompanionDraft(value);
      const mainWindow = this.options.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error("پنجره اصلی نیمروز آماده نیست.");
      }
      const request: CompanionPromptRequest = {
        requestId: nanoid(),
        ...draft,
      };
      mainWindow.webContents.send("companion:prompt", request);
      return { requestId: request.requestId };
    });
    ipcMain.handle("companion:report-status", (event, value: unknown) => {
      this.assertSender(event, "main");
      const status = validateCompanionStatus(value);
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send("companion:submission-status", status);
      }
    });
    ipcMain.handle("companion:report-conversation", (event, value: unknown) => {
      this.assertSender(event, "main");
      const snapshot = validateCompanionConversation(value);
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send("companion:conversation", snapshot);
      }
    });
    ipcMain.handle("companion:clear-conversation", (event) => {
      this.assertSender(event, "companion");
      const mainWindow = this.options.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("companion:clear-conversation");
      }
    });
    ipcMain.handle("companion:get-shortcut-status", (event) => {
      this.assertKnownSender(event);
      return this.shortcutStatus;
    });
    ipcMain.handle("companion:set-shortcut-settings", (event, value: unknown) => {
      this.assertSender(event, "main");
      const settings = this.options.saveShortcutSettings(value);
      return this.applyShortcut(settings);
    });
  }

  private getScreenCapturePermission(): CompanionScreenCapturePermission {
    if (process.platform !== "darwin") return "not-required";
    const status = systemPreferences.getMediaAccessStatus("screen");
    return ["granted", "not-determined", "denied", "restricted"].includes(
      status
    )
      ? (status as CompanionScreenCapturePermission)
      : "unknown";
  }

  private async captureCurrentScreen(): Promise<CompanionScreenshot> {
    const permission = this.getScreenCapturePermission();
    if (permission === "denied" || permission === "restricted") {
      throw new Error("دسترسی ضبط صفحه در تنظیمات macOS غیرفعال است.");
    }
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const thumbnailSize = fitCaptureSize(
      display.size.width * display.scaleFactor,
      display.size.height * display.scaleFactor
    );
    const wasVisible = Boolean(this.window?.isVisible());
    this.captureInProgress = true;
    if (wasVisible) this.window?.hide();

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 140));
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize,
        fetchWindowIcons: false,
      });
      const source =
        sources.find((item) => item.display_id === String(display.id)) ??
        sources[0];
      if (!source || source.thumbnail.isEmpty()) {
        throw new Error("گرفتن تصویر صفحه در دسترس نیست.");
      }

      const jpeg = source.thumbnail.toJPEG(82);
      const size = source.thumbnail.getSize();
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
      return {
        name: `screen-${timestamp}.jpg`,
        mediaType: "image/jpeg",
        base64: jpeg.toString("base64"),
        width: size.width,
        height: size.height,
      };
    } finally {
      this.captureInProgress = false;
      if (wasVisible) this.show();
    }
  }
}
