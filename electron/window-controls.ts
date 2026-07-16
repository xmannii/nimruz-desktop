import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

export type WindowState = {
  maximized: boolean;
  fullscreen: boolean;
};

function getWindowState(win: BrowserWindow): WindowState {
  return {
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  };
}

export function registerWindowControlHandlers(
  getMainWindow: () => BrowserWindow | null,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
) {
  function handle<TResult>(
    channel: string,
    callback: () => TResult | Promise<TResult>
  ) {
    ipcMain.handle(channel, (event) => {
      assertTrustedSender(event);
      return callback();
    });
  }

  handle("window:minimize", () => {
    getMainWindow()?.minimize();
  });

  handle("window:toggle-maximize", (): WindowState => {
    const win = getMainWindow();
    if (!win) return { maximized: false, fullscreen: false };

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }

    return getWindowState(win);
  });

  handle("window:close", () => {
    getMainWindow()?.close();
  });

  handle("window:get-state", (): WindowState => {
    const win = getMainWindow();
    return win
      ? getWindowState(win)
      : { maximized: false, fullscreen: false };
  });
}

export function attachWindowStateEvents(win: BrowserWindow) {
  const notify = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("window:state-changed", getWindowState(win));
  };

  win.on("maximize", notify);
  win.on("unmaximize", notify);
  win.on("enter-full-screen", notify);
  win.on("leave-full-screen", notify);
}
