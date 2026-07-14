import type { LegacyDataSnapshot } from "@/lib/desktop-api";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  sanitizePersonalizationSettings,
} from "@/lib/settings/personalization";
import { sanitizeMemories } from "@/lib/settings/memories";

const DATABASE_NAME = "nimruz-chat";
const PERSONALIZATION_KEY = "nimruz-personalization:v1";
const MEMORIES_KEY = "nimruz-memories:v1";

let migrationPromise: Promise<void> | undefined;

function readLocalStorage(key: string): unknown {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function readStore<T>(
  database: IDBDatabase,
  storeName: string
): Promise<T[]> {
  if (!database.objectStoreNames.contains(storeName)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function readLegacyDatabase(): Promise<{
  chats: LocalChat[];
  projects: LocalProject[];
}> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve({ chats: [], projects: [] });
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = async () => {
      const database = request.result;
      try {
        const [chats, projects] = await Promise.all([
          readStore<LocalChat>(database, "chats"),
          readStore<LocalProject>(database, "projects"),
        ]);
        resolve({ chats, projects });
      } catch (error) {
        reject(error);
      } finally {
        database.close();
      }
    };
  });
}

export function ensureLegacyMigration(): Promise<void> {
  migrationPromise ??= (async () => {
    const legacy = await readLegacyDatabase();
    const snapshot: LegacyDataSnapshot = {
      chats: legacy.chats,
      projects: legacy.projects,
      personalization: sanitizePersonalizationSettings(
        readLocalStorage(PERSONALIZATION_KEY) ??
          DEFAULT_PERSONALIZATION_SETTINGS
      ),
      memories: sanitizeMemories(readLocalStorage(MEMORIES_KEY)),
    };
    await window.desktop.storage.importLegacyData(snapshot);
  })();
  return migrationPromise;
}
