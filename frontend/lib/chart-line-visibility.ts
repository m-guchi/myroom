import {
  AIRCON_CHART_DEVICE_ID,
  DASHBOARD_SENSOR_DEVICE_IDS,
} from "@/lib/types";

export const OUTDOOR_VISIBILITY_KEY = "outdoor";
export const AIRCON_TARGET_VISIBILITY_KEY = "airconTarget";

export type ChartLineVisibilitySettings = Record<string, boolean>;
export type ChartLineVisibilityOverrides = Record<string, boolean>;

const STORAGE_KEY = "myroom_chart_line_visibility";

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function deviceVisibilityKey(deviceId: number): string {
  return `device:${deviceId}`;
}

export function deviceDht11VisibilityKey(deviceId: number): string {
  return `device-dht11:${deviceId}`;
}

export function buildDefaultChartLineVisibility(
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): ChartLineVisibilitySettings {
  const settings: ChartLineVisibilitySettings = {};

  for (const deviceId of sensorDeviceIds) {
    settings[deviceVisibilityKey(deviceId)] = true;
    settings[deviceDht11VisibilityKey(deviceId)] = true;
  }

  settings[deviceVisibilityKey(AIRCON_CHART_DEVICE_ID)] = true;
  settings[OUTDOOR_VISIBILITY_KEY] = false;
  settings[AIRCON_TARGET_VISIBILITY_KEY] = true;

  return settings;
}

export function normalizeChartLineVisibility(
  saved: ChartLineVisibilitySettings | null,
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): ChartLineVisibilitySettings {
  const defaults = buildDefaultChartLineVisibility(sensorDeviceIds);
  if (!saved) return defaults;

  const normalized = { ...defaults };
  for (const [key, value] of Object.entries(saved)) {
    if (typeof value === "boolean") {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function loadChartLineVisibility(
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): ChartLineVisibilitySettings {
  const storage = getStorage();
  if (!storage) return buildDefaultChartLineVisibility(sensorDeviceIds);

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultChartLineVisibility(sensorDeviceIds);

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return buildDefaultChartLineVisibility(sensorDeviceIds);
    }

    return normalizeChartLineVisibility(
      parsed as ChartLineVisibilitySettings,
      sensorDeviceIds
    );
  } catch {
    return buildDefaultChartLineVisibility(sensorDeviceIds);
  }
}

export function saveChartLineVisibility(settings: ChartLineVisibilitySettings): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isChartLineVisible(
  settings: ChartLineVisibilitySettings,
  key: string
): boolean {
  return settings[key] !== false;
}

export function toggleChartLineVisibility(
  settings: ChartLineVisibilitySettings,
  key: string
): ChartLineVisibilitySettings {
  return {
    ...settings,
    [key]: !isChartLineVisible(settings, key),
  };
}

export function resolveEffectiveChartLineVisibility(
  defaults: ChartLineVisibilitySettings,
  overrides: ChartLineVisibilityOverrides,
  key: string
): boolean {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }
  return isChartLineVisible(defaults, key);
}

export function mergeEffectiveChartLineVisibility(
  defaults: ChartLineVisibilitySettings,
  overrides: ChartLineVisibilityOverrides
): ChartLineVisibilitySettings {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = value;
  }
  return merged;
}

export function getDisplayItemVisibilityKey(item: {
  type: "device" | "outdoor" | "aircon";
  deviceId?: number;
}): string {
  if (item.type === "device" && item.deviceId != null) {
    return deviceVisibilityKey(item.deviceId);
  }
  if (item.type === "outdoor") return OUTDOOR_VISIBILITY_KEY;
  return deviceVisibilityKey(AIRCON_CHART_DEVICE_ID);
}
