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
    getStatus: (providerId) =>
      ipcRenderer.invoke("credentials:status", providerId),
    setKey: (providerId, key) =>
      ipcRenderer.invoke("credentials:set-key", providerId, key),
    clearKey: (providerId) =>
      ipcRenderer.invoke("credentials:clear-key", providerId),
    testProvider: (options) =>
      ipcRenderer.invoke("credentials:test-provider", options),
    setOpenRouterKey: (key) =>
      ipcRenderer.invoke("credentials:set-openrouter", key),
    clearOpenRouterKey: () =>
      ipcRenderer.invoke("credentials:clear-openrouter"),
    testOpenRouterKey: (key) =>
      ipcRenderer.invoke("credentials:test-openrouter", key),
  },
  providers: {
    listCatalog: () => ipcRenderer.invoke("providers:list-catalog"),
    saveProvider: (provider) =>
      ipcRenderer.invoke("providers:save-provider", provider),
    deleteProvider: (id) => ipcRenderer.invoke("providers:delete-provider", id),
    saveModel: (model) => ipcRenderer.invoke("providers:save-model", model),
    deleteModel: (id) => ipcRenderer.invoke("providers:delete-model", id),
    deleteProviderModels: (providerId) =>
      ipcRenderer.invoke("providers:delete-provider-models", providerId),
    setDefaultModel: (id) =>
      ipcRenderer.invoke("providers:set-default-model", id),
    discoverModels: (options) =>
      ipcRenderer.invoke("providers:discover-models", options),
  },
  storage: {
    loadChats: () => ipcRenderer.invoke("storage:load-chats"),
    saveChats: (chats) => ipcRenderer.invoke("storage:save-chats", chats),
    deleteChat: (id) => ipcRenderer.invoke("storage:delete-chat", id),
    deleteAllChats: () => ipcRenderer.invoke("storage:delete-all-chats"),
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
    loadExperts: () => ipcRenderer.invoke("storage:load-experts"),
    saveExperts: (experts) => ipcRenderer.invoke("storage:save-experts", experts),
    importLegacyData: (snapshot) =>
      ipcRenderer.invoke("storage:import-legacy", snapshot),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    setEnabled: (name, enabled) =>
      ipcRenderer.invoke("skills:set-enabled", name, enabled),
    getBody: (name) => ipcRenderer.invoke("skills:get-body", name),
    create: (skill) => ipcRenderer.invoke("skills:create", skill),
    update: (name, skill) =>
      ipcRenderer.invoke("skills:update", name, skill),
    delete: (name) => ipcRenderer.invoke("skills:delete", name),
  },
  updates: {
    getVersion: () => ipcRenderer.invoke("updates:get-version"),
    check: () => ipcRenderer.invoke("updates:check"),
    openUrl: (url) => ipcRenderer.invoke("updates:open-url", url),
  },
};

contextBridge.exposeInMainWorld("desktop", desktopApi);
