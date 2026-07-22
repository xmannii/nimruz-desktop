export type NotificationSettings = {
  desktopNotificationsEnabled: boolean;
  agentCompleted: boolean;
  agentFailed: boolean;
  approvalRequired: boolean;
  modelDownloads: boolean;
  completionSound: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  desktopNotificationsEnabled: true,
  agentCompleted: true,
  agentFailed: true,
  approvalRequired: true,
  modelDownloads: true,
  completionSound: false,
};

export function sanitizeNotificationSettings(
  value: unknown
): NotificationSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    desktopNotificationsEnabled:
      typeof settings.desktopNotificationsEnabled === "boolean"
        ? settings.desktopNotificationsEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.desktopNotificationsEnabled,
    agentCompleted:
      typeof settings.agentCompleted === "boolean"
        ? settings.agentCompleted
        : DEFAULT_NOTIFICATION_SETTINGS.agentCompleted,
    agentFailed:
      typeof settings.agentFailed === "boolean"
        ? settings.agentFailed
        : DEFAULT_NOTIFICATION_SETTINGS.agentFailed,
    approvalRequired:
      typeof settings.approvalRequired === "boolean"
        ? settings.approvalRequired
        : DEFAULT_NOTIFICATION_SETTINGS.approvalRequired,
    modelDownloads:
      typeof settings.modelDownloads === "boolean"
        ? settings.modelDownloads
        : DEFAULT_NOTIFICATION_SETTINGS.modelDownloads,
    completionSound:
      typeof settings.completionSound === "boolean"
        ? settings.completionSound
        : DEFAULT_NOTIFICATION_SETTINGS.completionSound,
  };
}
