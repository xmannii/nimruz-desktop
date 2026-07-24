export const DEFAULT_MICROPHONE_ID = "default";
export const MICROPHONE_STORAGE_KEY = "nimruz.speech.microphone.v1";

export function readPreferredMicrophoneId(): string {
  try {
    return localStorage.getItem(MICROPHONE_STORAGE_KEY) || DEFAULT_MICROPHONE_ID;
  } catch {
    return DEFAULT_MICROPHONE_ID;
  }
}

export function savePreferredMicrophoneId(deviceId: string) {
  try {
    localStorage.setItem(MICROPHONE_STORAGE_KEY, deviceId);
  } catch {
    // A blocked storage API should not prevent microphone use.
  }
}

export function createMicrophoneConstraints(
  deviceId: string
): MediaTrackConstraints {
  return {
    autoGainControl: true,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    ...(deviceId === DEFAULT_MICROPHONE_ID
      ? {}
      : { deviceId: { exact: deviceId } }),
  };
}

export async function openMicrophoneStream(
  deviceId: string
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: createMicrophoneConstraints(deviceId),
    video: false,
  });
}
