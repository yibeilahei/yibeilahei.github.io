import { normalizeLocalePref } from "./i18n";
import type { DeviceProfile, PersistSettings, ConvertSettings, WritingMode } from "./types";

export const SETTINGS_KEY = "lazahata.xtch.settings.v1";

export const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  X4: { id: "X4", width: 480, height: 800, label: "X4 · 480×800" },
  X3: { id: "X3", width: 528, height: 792, label: "X3 · 528×792" },
};

export const DEFAULT_SETTINGS: PersistSettings = {
  deviceId: "X4",
  fontSize: 34,
  lineHeight: 120,
  textAlign: 3,
  hyphenation: 0,
  readDirection: 0,
  renameFromTitle: false,
  locale: "auto",
  epubCrengine: true,
};

export function loadSettings(): PersistSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
    delete saved.fontId;
    const epubCrengine = saved._epubCrengineV2 ? Boolean(saved.epubCrengine) : true;
    delete saved._epubCrengineV2;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      locale: normalizeLocalePref(saved.locale),
      epubCrengine,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: PersistSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, _epubCrengineV2: true }));
  } catch {
    /* ignore */
  }
}

export function toConvertSettings(
  settings: PersistSettings,
  writingMode: WritingMode = "auto",
  fontId?: string,
  txtEncoding?: string,
): ConvertSettings {
  const device = DEVICE_PROFILES[settings.deviceId] || DEVICE_PROFILES.X4;
  return {
    ...settings,
    fontId: fontId || "auto",
    writingMode,
    txtEncoding: txtEncoding || "auto",
    device: { w: device.width, h: device.height, id: device.id },
  };
}

export function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
}

export function uid(): string {
  return "job-" + Math.random().toString(36).slice(2, 9);
}
