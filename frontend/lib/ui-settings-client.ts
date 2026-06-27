import {
  buildDefaultChartColors,
  normalizeChartColors,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import {
  buildDefaultDisplayOrder,
  normalizeDisplayOrder,
  orderItemKey,
  type DisplayOrderItem,
} from "@/lib/display-order";
import {
  normalizeHiddenDeviceKeys,
} from "@/lib/visible-devices";
import { fetchUiSettings, updateUiSettings } from "@/lib/api";
import { DASHBOARD_SENSOR_DEVICE_IDS } from "@/lib/types";

const LEGACY_DISPLAY_ORDER_KEY = "myroom_display_order";
const LEGACY_CHART_COLORS_KEY = "myroom_chart_colors";
const LEGACY_HIDDEN_DEVICES_KEY = "myroom_hidden_devices";
const MIGRATION_FLAG_KEY = "myroom_ui_settings_migrated";

function parseOrderItem(key: string): DisplayOrderItem | null {
  if (key === "outdoor") return { type: "outdoor" };
  if (key === "aircon") return { type: "aircon" };
  if (key.startsWith("device:")) {
    const deviceId = Number(key.slice("device:".length));
    return Number.isFinite(deviceId) ? { type: "device", deviceId } : null;
  }
  return null;
}

function loadLegacyDisplayOrder(
  sensorDeviceIds: readonly number[]
): DisplayOrderItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_DISPLAY_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .map((entry) => (typeof entry === "string" ? parseOrderItem(entry) : null))
      .filter((item): item is DisplayOrderItem => item != null);
    return normalizeDisplayOrder(items, sensorDeviceIds);
  } catch {
    return null;
  }
}

function loadLegacyChartColors(): ChartColorSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_CHART_COLORS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeChartColors(parsed as ChartColorSettings);
  } catch {
    return null;
  }
}

function loadLegacyHiddenDevices(sensorDeviceIds: readonly number[]): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_HIDDEN_DEVICES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const keys = parsed.filter((entry): entry is string => typeof entry === "string");
    return normalizeHiddenDeviceKeys(keys, sensorDeviceIds);
  } catch {
    return null;
  }
}

function clearLegacyStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_DISPLAY_ORDER_KEY);
  localStorage.removeItem(LEGACY_CHART_COLORS_KEY);
  localStorage.removeItem(LEGACY_HIDDEN_DEVICES_KEY);
}

async function migrateLegacySettingsIfNeeded(
  sensorDeviceIds: readonly number[]
): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === "true") return;

  const legacyOrder = loadLegacyDisplayOrder(sensorDeviceIds);
  const legacyColors = loadLegacyChartColors();
  const legacyHidden = loadLegacyHiddenDevices(sensorDeviceIds);

  const hasLegacy =
    legacyOrder != null || legacyColors != null || (legacyHidden != null && legacyHidden.size > 0);

  if (hasLegacy) {
    await updateUiSettings({
      ...(legacyOrder ? { display_order: legacyOrder.map(orderItemKey) } : {}),
      ...(legacyColors ? { chart_colors: legacyColors } : {}),
      ...(legacyHidden ? { hidden_devices: [...legacyHidden] } : {}),
    });
    clearLegacyStorage();
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, "true");
}

export async function loadUiSettingsFromServer(
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): Promise<{
  displayOrder: DisplayOrderItem[];
  chartColors: ChartColorSettings;
  hiddenDeviceKeys: Set<string>;
}> {
  await migrateLegacySettingsIfNeeded(sensorDeviceIds);
  const settings = await fetchUiSettings();

  const displayOrder = normalizeDisplayOrder(
    settings.display_order
      .map((key) => parseOrderItem(key))
      .filter((item): item is DisplayOrderItem => item != null),
    sensorDeviceIds
  );

  return {
    displayOrder,
    chartColors: normalizeChartColors(settings.chart_colors),
    hiddenDeviceKeys: normalizeHiddenDeviceKeys(settings.hidden_devices, sensorDeviceIds),
  };
}

export async function saveDisplayOrderToServer(order: DisplayOrderItem[]): Promise<void> {
  await updateUiSettings({ display_order: order.map(orderItemKey) });
}

export async function saveChartColorsToServer(colors: ChartColorSettings): Promise<void> {
  await updateUiSettings({ chart_colors: colors });
}

export async function saveHiddenDevicesToServer(keys: Set<string>): Promise<void> {
  await updateUiSettings({ hidden_devices: [...keys] });
}

export function getDefaultUiSettings(sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS) {
  return {
    displayOrder: buildDefaultDisplayOrder(sensorDeviceIds),
    chartColors: buildDefaultChartColors(sensorDeviceIds),
    hiddenDeviceKeys: new Set<string>(),
  };
}
