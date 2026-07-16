import { app, BrowserWindow, nativeImage, shell } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import type http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceFilesStore } from "./agent/workspace-files";
import { WorkspaceEventBus } from "./agent/events";
import { CredentialService } from "./credentials";
import { registerIpcHandlers } from "./ipc";
import { startServer } from "./server";
import { SkillStore } from "./skills/store";
import { AppDatabase } from "./storage/database";
import { attachWindowStateEvents } from "./window-controls";
import {
  APP_NAME,
  APP_NAME_FA,
  DATABASE_FILE,
} from "@/lib/branding";
import { HOME_WORKSPACE_ID } from "@/lib/workspace";

app.setName(APP_NAME);

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
let rendererUrl = "";

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

  if (appIcon) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  attachWindowStateEvents(mainWindow);

  // Open external links in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  await mainWindow.loadURL(rendererUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath("userData");
  database = new AppDatabase(path.join(userDataPath, DATABASE_FILE));
  const credentials = new CredentialService(database);
  const skills = new SkillStore();
  const workspaceEvents = new WorkspaceEventBus(() => mainWindow);
  const workspaceFiles = new WorkspaceFilesStore(
    database,
    userDataPath,
    workspaceEvents
  );
  database.ensureHomeWorkspace();
  workspaceFiles.ensureManagedRoot(HOME_WORKSPACE_ID);
  const sessionToken = randomBytes(32).toString("base64url");

  registerIpcHandlers({
    database,
    credentials,
    skills,
    workspaceFiles,
    workspaceEvents,
    sessionToken,
    getMainWindow: () => mainWindow,
  });

  const agentDeps = {
    database,
    files: workspaceFiles,
    events: workspaceEvents,
    resolveModel: (providerId?: string, modelId?: string) => {
      const resolved = database?.resolveChatModel(providerId, modelId);
      if (!resolved) return null;
      const auth = credentials.resolveProviderAuth(resolved.provider);
      return {
        ...resolved,
        apiKey: auth.apiKey,
      };
    },
    getSkillsCatalog: async () =>
      skills.getEnabledCatalog(database!.loadSkillsPreferences()),
    loadSkillContent: async (name: string) =>
      skills.loadSkillContent(name, database!.loadSkillsPreferences()),
  };

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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  localServer?.close();
  database?.close();
  localServer = null;
  database = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
