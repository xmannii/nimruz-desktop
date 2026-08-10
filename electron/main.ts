import {
  app,
  BrowserWindow,
  dialog,
  nativeImage,
  Notification,
  session,
  shell,
} from "electron";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import type http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceFilesStore } from "./agent/workspace-files";
import { WorkspaceEventBus } from "./agent/events";
import { handleAgentChatRequest } from "./agent/runtime";
import { CredentialService } from "./credentials";
import { CodexService } from "./codex/service";
import { CompanionController } from "./companion/controller";
import { registerIpcHandlers } from "./ipc";
import {
  isSafeExternalHttpUrl,
  isTrustedRendererUrl,
} from "./renderer-security";
import { startServer } from "./server";
import { SkillStore } from "./skills/store";
import { AppDatabase } from "./storage/database";
import { ShenavaService } from "./shenava/service";
import {
  DesktopNotificationService,
  type NativeNotificationPayload,
} from "./notifications/service";
import { attachWindowStateEvents } from "./window-controls";
import { TelegramService } from "./telegram/service";
import { createTelegramNetwork } from "./telegram/network";
import {
  TELEGRAM_CHAT_CHANNEL,
  TELEGRAM_STATUS_CHANNEL,
} from "@/lib/telegram";
import {
  APP_NAME,
  APP_NAME_FA,
  DATABASE_FILE,
} from "@/lib/branding";
import { HOME_WORKSPACE_ID } from "@/lib/workspace";
import type { SkillDocument } from "@/lib/skills";
import type { OpenFolderRequest } from "@/lib/desktop-api";
import {
  parseOpenFolderArgument,
  registerWindowsFolderContextMenu,
  resolveOpenFolderPath,
} from "./windows-shell-integration";

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId("dev.nimruz.desktop");
}

const initialOpenFolderPath = parseOpenFolderArgument(process.argv);
const hasSingleInstanceLock = app.requestSingleInstanceLock(
  initialOpenFolderPath ? { openFolderPath: initialOpenFolderPath } : {}
);
if (!hasSingleInstanceLock) app.quit();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEV_API_PORT = 43117;
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL;
const isDev = Boolean(RENDERER_DEV_URL);

function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(__dirname, "../assets/icon.png"),
    path.join(app.getAppPath(), "assets/icon.png"),
  ];

  for (const candidate of candidates) {
    const absolutePath = path.resolve(candidate);
    if (!existsSync(absolutePath)) continue;

    const image = nativeImage.createFromPath(absolutePath);
    if (!image.isEmpty()) return image;
  }

  return undefined;
}

let mainWindow: BrowserWindow | null = null;
let localServer: http.Server | null = null;
let database: AppDatabase | null = null;
let codex: CodexService | null = null;
let shenava: ShenavaService | null = null;
let notificationService: DesktopNotificationService | null = null;
let companion: CompanionController | null = null;
let telegram: TelegramService | null = null;
let rendererUrl = "";
const activeNotifications = new Set<Notification>();
let isQuitting = false;
let closeDecisionInProgress = false;
let openFolderRendererReady = false;
const pendingOpenFolderPaths: string[] = [];

function presentMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildOpenFolderRequest(folderPath: string): OpenFolderRequest | null {
  const canonicalPath = resolveOpenFolderPath(folderPath);
  if (!canonicalPath || !database) return null;
  const normalize = (value: string) =>
    process.platform === "win32" ? value.toLocaleLowerCase() : value;
  const root = database
    .loadWorkspaceRoots()
    .find((candidate) => normalize(candidate.path) === normalize(canonicalPath));
  return {
    path: canonicalPath,
    title: path.basename(canonicalPath) || canonicalPath,
    workspaceId: root?.workspaceId ?? null,
  };
}

function flushOpenFolderRequests() {
  if (
    !openFolderRendererReady ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !database
  ) {
    return;
  }

  for (const folderPath of pendingOpenFolderPaths.splice(0)) {
    const request = buildOpenFolderRequest(folderPath);
    if (request) mainWindow.webContents.send("app:open-folder", request);
  }
}

function queueOpenFolder(folderPath: string | null) {
  if (!folderPath) return;
  const canonicalPath = resolveOpenFolderPath(folderPath);
  if (!canonicalPath || pendingOpenFolderPaths.includes(canonicalPath)) return;
  pendingOpenFolderPaths.push(canonicalPath);
  presentMainWindow();
  flushOpenFolderRequests();
}

if (hasSingleInstanceLock) {
  queueOpenFolder(initialOpenFolderPath);
  app.on("second-instance", (_event, argv, _workingDirectory, data) => {
    const fromData =
      data &&
      typeof data === "object" &&
      "openFolderPath" in data &&
      typeof data.openFolderPath === "string"
        ? data.openFolderPath
        : null;
    queueOpenFolder(fromData ?? parseOpenFolderArgument(argv));
    presentMainWindow();
  });
}

function presentNativeNotification(
  payload: NativeNotificationPayload,
  onClick: () => void
) {
  const notification = new Notification(payload);
  activeNotifications.add(notification);
  const release = () => activeNotifications.delete(notification);
  notification.on("click", onClick);
  notification.on("close", release);
  notification.on("failed", release);
  notification.show();
}

function resolveShenavaWorkerPath() {
  const bundled = path.join(__dirname, "shenava-worker.cjs");
  const unpacked = bundled.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
  return unpacked !== bundled && existsSync(unpacked) ? unpacked : bundled;
}

async function createWindow() {
  const appIcon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: "#181818",
    show: false,
    frame: false,
    title: APP_NAME_FA,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const trusted =
        (webContents === mainWindow?.webContents ||
          webContents === companion?.getWindow()?.webContents) &&
        isTrustedRendererUrl(details.requestingUrl, rendererUrl);
      const mediaTypes =
        permission === "media" && "mediaTypes" in details
          ? (details.mediaTypes ?? [])
          : [];
      const audioOnly =
        permission === "media" &&
        mediaTypes.includes("audio") &&
        !mediaTypes.includes("video");
      callback(Boolean(trusted && audioOnly));
    }
  );
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      const trusted =
        (webContents === mainWindow?.webContents ||
          webContents === companion?.getWindow()?.webContents) &&
        isTrustedRendererUrl(requestingOrigin, rendererUrl);
      const audioOnly =
        permission === "media" &&
        "mediaType" in details &&
        details.mediaType === "audio";
      return Boolean(trusted && audioOnly);
    }
  );

  if (appIcon) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  attachWindowStateEvents(mainWindow);

  const openExternalLink = (url: string) => {
    if (!isSafeExternalHttpUrl(url)) return;
    void shell.openExternal(url).catch(() => undefined);
  };

  // Never give a navigated third-party page access to the preload bridge.
  const guardNavigation = (event: Electron.Event, url: string) => {
    if (isTrustedRendererUrl(url, rendererUrl)) return;
    event.preventDefault();
    openExternalLink(url);
  };
  mainWindow.webContents.on("will-navigate", guardNavigation);
  mainWindow.webContents.on("will-redirect", guardNavigation);
  mainWindow.webContents.on("did-start-loading", () => {
    openFolderRendererReady = false;
  });

  // Open external links in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(rendererUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (closeDecisionInProgress || !mainWindow) return;
    closeDecisionInProgress = true;
    const window = mainWindow;
    void dialog
      .showMessageBox(window, {
        type: "question",
        title: "بستن نیمروز",
        message: "می‌خواهید نیمروز در نوار سیستم بماند یا کامل بسته شود؟",
        detail:
          "با ماندن در نوار سیستم، دستیار سریع و میانبرهای سراسری همچنان فعال می‌مانند.",
        buttons: ["ماندن در نوار سیستم", "خروج کامل", "لغو"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) {
          window.hide();
        } else if (response === 1) {
          isQuitting = true;
          app.quit();
        }
      })
      .finally(() => {
        closeDecisionInProgress = false;
      });
  });

  mainWindow.on("closed", () => {
    openFolderRendererReady = false;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const userDataPath = app.getPath("userData");
  database = new AppDatabase(path.join(userDataPath, DATABASE_FILE));
  const credentials = new CredentialService(database);
  codex = new CodexService({
    database,
    codexHome: path.join(app.getPath("userData"), "codex"),
    workspace: path.join(app.getPath("userData"), "codex-workspace"),
    clientVersion: app.getVersion(),
  });
  const skills = new SkillStore();
  const workspaceEvents = new WorkspaceEventBus(() => mainWindow);
  const workspaceFiles = new WorkspaceFilesStore(
    database,
    userDataPath,
    workspaceEvents
  );
  shenava = new ShenavaService({
    userDataPath,
    workerScript: resolveShenavaWorkerPath(),
  });
  notificationService = new DesktopNotificationService({
    database,
    getWindow: () => mainWindow,
    nativeNotificationsSupported: () => Notification.isSupported(),
    presentNativeNotification,
  });
  workspaceEvents.onEvent((event) =>
    notificationService?.handleWorkspaceEvent(event)
  );
  shenava.onStatus((status) =>
    notificationService?.handleShenavaStatus(status)
  );
  database.ensureHomeWorkspace();
  if (process.platform === "win32" && app.isPackaged) {
    void registerWindowsFolderContextMenu(process.execPath).catch((error) => {
      console.warn("Failed to register the Windows folder context menu:", error);
    });
  }
  workspaceFiles.ensureManagedRoot(HOME_WORKSPACE_ID);
  const sessionToken = randomBytes(32).toString("base64url");

  const agentDeps = {
    database,
    files: workspaceFiles,
    events: workspaceEvents,
    resolveModel: (providerId?: string, modelId?: string) => {
      const resolved = database?.resolveChatModel(providerId, modelId);
      if (!resolved) return null;
      const auth =
        resolved.provider.kind === "codex"
          ? { apiKey: null }
          : credentials.resolveProviderAuth(resolved.provider);
      return {
        ...resolved,
        apiKey: auth.apiKey,
      };
    },
    codex,
    getSkillsCatalog: async () =>
      skills.getEnabledCatalog(database!.loadSkillsPreferences()),
    loadSkillContent: async (name: string) =>
      skills.loadSkillContent(name, database!.loadSkillsPreferences()),
    createSkill: async (skill: SkillDocument) => skills.create(skill),
  };

  // Keep Telegram proxy settings isolated from model providers, updates, and
  // the renderer. This in-memory session exists only while Nimruz is running.
  const telegramNetwork = createTelegramNetwork(
    session.fromPartition("nimruz-telegram")
  );

  telegram = new TelegramService({
    database,
    credentials,
    agentDeps,
    runAgent: handleAgentChatRequest,
    shenava,
    fetchImpl: telegramNetwork.fetch,
    applyProxy: telegramNetwork.applyProxy,
    onStatusChange: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(TELEGRAM_STATUS_CHANNEL, status);
      }
    },
    onChatChange: (chat) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(TELEGRAM_CHAT_CHANNEL, chat);
      }
    },
  });

  registerIpcHandlers({
    database,
    credentials,
    codex,
    skills,
    workspaceFiles,
    workspaceEvents,
    shenava,
    telegram,
    sessionToken,
    getMainWindow: () => mainWindow,
    getCompanionWindow: () => companion?.getWindow() ?? null,
    getRendererUrl: () => rendererUrl,
    onOpenFolderReady: () => {
      openFolderRendererReady = true;
      flushOpenFolderRequests();
    },
  });
  await telegram.initialize();

  if (isDev && RENDERER_DEV_URL) {
    const result = await startServer({
      port: DEV_API_PORT,
      sessionToken,
      agentDeps,
      allowedOrigins: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
    });
    localServer = result.server;
    rendererUrl = RENDERER_DEV_URL;
  } else {
    const rendererDir = path.join(app.getAppPath(), "dist");
    const result = await startServer({
      rendererDir,
      sessionToken,
      agentDeps,
    });
    localServer = result.server;
    rendererUrl = `http://127.0.0.1:${result.port}/`;
  }

  await createWindow();
  companion = new CompanionController({
    rendererUrl,
    preloadPath: path.join(__dirname, "preload.cjs"),
    icon: resolveAppIcon(),
    getMainWindow: () => mainWindow,
    loadShortcutSettings: () => database!.loadCompanionShortcut(),
    saveShortcutSettings: (value) => database!.saveCompanionShortcut(value),
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
  await companion.initialize();

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  companion?.dispose();
  telegram?.dispose();
  shenava?.cancelDownload();
  codex?.dispose();
  localServer?.close();
  database?.close();
  localServer = null;
  database = null;
  codex = null;
  shenava = null;
  telegram = null;
  notificationService = null;
  activeNotifications.clear();
  companion = null;
});

// A tray app deliberately stays alive when its main window is hidden.
