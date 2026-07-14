import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI, WindowState } from "@/lib/desktop-api";

const desktopApi: DesktopAPI = {
  platform: process.platform,
  isDesktop: true,
  auth: {
    getSessionToken: () => ipcRenderer.invoke("auth:get-session-token"),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    getState: () => ipcRenderer.invoke("window:get-state"),
    onStateChange: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WindowState) =>
        callback(state);
      ipcRenderer.on("window:state-changed", handler);
      return () => {
        ipcRenderer.removeListener("window:state-changed", handler);
      };
    },
  },
  credentials: {
    getStatus: () => ipcRenderer.invoke("credentials:status"),
    setOpenRouterKey: (key) =>
      ipcRenderer.invoke("credentials:set-openrouter", key),
    clearOpenRouterKey: () =>
      ipcRenderer.invoke("credentials:clear-openrouter"),
    testOpenRouterKey: (key) =>
      ipcRenderer.invoke("credentials:test-openrouter", key),
  },
  storage: {
    loadChats: () => ipcRenderer.invoke("storage:load-chats"),
    saveChats: (chats) => ipcRenderer.invoke("storage:save-chats", chats),
    deleteChat: (id) => ipcRenderer.invoke("storage:delete-chat", id),
    loadProjects: () => ipcRenderer.invoke("storage:load-projects"),
    saveProject: (project) =>
      ipcRenderer.invoke("storage:save-project", project),
    deleteProject: (id) => ipcRenderer.invoke("storage:delete-project", id),
    loadPersonalization: () =>
      ipcRenderer.invoke("storage:load-personalization"),
    savePersonalization: (settings) =>
      ipcRenderer.invoke("storage:save-personalization", settings),
    loadMemories: () => ipcRenderer.invoke("storage:load-memories"),
    saveMemories: (memories) =>
      ipcRenderer.invoke("storage:save-memories", memories),
    importLegacyData: (snapshot) =>
      ipcRenderer.invoke("storage:import-legacy", snapshot),
  },
};

contextBridge.exposeInMainWorld("desktop", desktopApi);
