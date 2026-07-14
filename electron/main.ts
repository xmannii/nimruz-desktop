import { app, BrowserWindow, shell } from "electron";
import { randomBytes } from "node:crypto";
import type http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CredentialService } from "./credentials";
import { registerIpcHandlers } from "./ipc";
import { startServer } from "./server";
import { AppDatabase } from "./storage/database";
import { attachWindowStateEvents } from "./window-controls";

const APP_TITLE = "نیمروز";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEV_API_PORT = 43117;
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL;
const isDev = Boolean(RENDERER_DEV_URL);

let mainWindow: BrowserWindow | null = null;
let localServer: http.Server | null = null;
let database: AppDatabase | null = null;
let rendererUrl = "";

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: "#181818",
    show: false,
    frame: false,
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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
  database = new AppDatabase(
    path.join(app.getPath("userData"), "nimruz.sqlite3")
  );
  const credentials = new CredentialService(database);
  const sessionToken = randomBytes(32).toString("base64url");

  registerIpcHandlers({
    database,
    credentials,
    sessionToken,
    getMainWindow: () => mainWindow,
  });

  if (isDev && RENDERER_DEV_URL) {
    const result = await startServer({
      port: DEV_API_PORT,
      sessionToken,
      getApiKey: () => credentials.getOpenRouterKey(),
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
      getApiKey: () => credentials.getOpenRouterKey(),
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
