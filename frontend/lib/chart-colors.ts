import {
  AIRCON_CHART_DEVICE_ID,
  DASHBOARD_SENSOR_DEVICE_IDS,
} from "@/lib/types";

export const OUTDOOR_COLOR_KEY = "outdoor";
export const AIRCON_TARGET_COLOR_KEY = "airconTarget";

export const CHART_COLOR_PALETTE = [
  "#3498db",
  "#e67e22",
  "#1abc9c",
  "#9b59b6",
  "#e74c3c",
  "#f1c40f",
  "#2ecc71",
  "#34495e",
  "#e91e63",
  "#00bcd4",
  "#ff5722",
  "#795548",
  "#607d8b",
  "#673ab7",
  "#4caf50",
  "#ff9800",
  "#03a9f4",
  "#cddc39",
  "#ff4081",
  "#009688",
  "#ffc107",
  "#3f51b5",
  "#8bc34a",
  "#adb5bd",
] as const;

export type ChartColorSettings = Record<string, string>;

export interface ChartColorConfigItem {
  key: string;
  label: string;
}

const STORAGE_KEY = "myroom_chart_colors";

export function deviceColorKey(deviceId: number): string {
  return `device:${deviceId}`;
}

export function buildDefaultChartColors(): ChartColorSettings {
  const colors: ChartColorSettings = {
    [deviceColorKey(1)]: "#3498db",
    [deviceColorKey(2)]: "#e67e22",
    [deviceColorKey(AIRCON_CHART_DEVICE_ID)]: "#1abc9c",
    [OUTDOOR_COLOR_KEY]: "#adb5bd",
    [AIRCON_TARGET_COLOR_KEY]: "#9b59b6",
  };
  return colors;
}

export function normalizeChartColors(saved: ChartColorSettings | null): ChartColorSettings {
  const defaults = buildDefaultChartColors();
  if (!saved) return defaults;

  const normalized = { ...defaults };
  for (const [key, value] of Object.entries(saved)) {
    if (typeof value === "string" && CHART_COLOR_PALETTE.includes(value as (typeof CHART_COLOR_PALETTE)[number])) {
      normalized[key] = value;
    } else if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function loadChartColors(): ChartColorSettings {
  if (typeof window === "undefined") {
    return buildDefaultChartColors();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultChartColors();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return buildDefaultChartColors();
    return normalizeChartColors(parsed as ChartColorSettings);
  } catch {
    return buildDefaultChartColors();
  }
}

export function saveChartColors(colors: ChartColorSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

export function getDeviceChartColor(
  colors: ChartColorSettings,
  deviceId: number
): string {
  return colors[deviceColorKey(deviceId)] ?? buildDefaultChartColors()[deviceColorKey(deviceId)] ?? "#95a5a6";
}

export function getOutdoorChartColor(colors: ChartColorSettings): string {
  return colors[OUTDOOR_COLOR_KEY] ?? buildDefaultChartColors()[OUTDOOR_COLOR_KEY];
}

export function getAirconTargetChartColor(colors: ChartColorSettings): string {
  return (
    colors[AIRCON_TARGET_COLOR_KEY] ??
    buildDefaultChartColors()[AIRCON_TARGET_COLOR_KEY]
  );
}

export function getChartColorConfigItems(
  deviceNames: Record<number, string>,
  outdoorName?: string | null,
  airconName?: string | null
): ChartColorConfigItem[] {
  const airconLabel = airconName ?? "エアコン";
  const items: ChartColorConfigItem[] = [];

  for (const deviceId of DASHBOARD_SENSOR_DEVICE_IDS) {
    items.push({
      key: deviceColorKey(deviceId),
      label: deviceNames[deviceId] ?? `デバイス ${deviceId}`,
    });
  }

  items.push({
    key: deviceColorKey(AIRCON_CHART_DEVICE_ID),
    label: `${airconLabel}（室温）`,
  });
  items.push({
    key: AIRCON_TARGET_COLOR_KEY,
    label: `${airconLabel}（設定温度）`,
  });
  items.push({
    key: OUTDOOR_COLOR_KEY,
    label: outdoorName ?? "屋外",
  });

  return items;
}

export function setChartColor(
  colors: ChartColorSettings,
  key: string,
  color: string
): ChartColorSettings {
  return { ...colors, [key]: color };
}
