import type { ModelCatalogSnapshot } from "@/lib/models/catalog";

export type CodexAccountState =
  | "connected"
  | "disconnected"
  | "unavailable"
  | "error";

export type CodexAccountStatus = {
  state: CodexAccountState;
  email: string | null;
  planType: string | null;
  message: string | null;
};

export type CodexLoginResult =
  | {
      type: "browser";
      loginId: string;
      authUrl: string;
    }
  | {
      type: "device-code";
      loginId: string;
      verificationUrl: string;
      userCode: string;
    };

export type CodexModelDescriptor = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  inputModalities: string[];
  supportedReasoningEfforts: string[];
};

export type CodexModelSyncResult = {
  count: number;
  catalog: ModelCatalogSnapshot;
};

export type CodexChatThread = {
  chatId: string;
  threadId: string;
  lastUserMessageId: string | null;
  createdAt: number;
  updatedAt: number;
};
