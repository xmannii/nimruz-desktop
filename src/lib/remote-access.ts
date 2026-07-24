export type RemoteAccessStatus = {
  enabled: boolean;
  endpoint: string | null;
};

export type RemoteAccessSession = RemoteAccessStatus & {
  /** Fresh process-local credential. It is never persisted to disk. */
  token: string;
};
