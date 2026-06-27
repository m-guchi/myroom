import {
  orderItemKey,
  type DisplayOrderItem,
} from "@/lib/display-order";
import {
  AIRCON_CHART_DEVICE_ID,
  DASHBOARD_SENSOR_DEVICE_IDS,
} from "@/lib/types";

export const HIDDEN_DEVICES_STORAGE_KEY = "myroom_hidden_devices";
export const VISIBLE_DEVICES_CHANGED_EVENT = "myroom-visible-devices-changed";

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function buildAllDashboardTargetKeys(
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): Set<string> {
  const keys = new Set<string>();
  for (const deviceId of sensorDeviceIds) {
    keys.add(orderItemKey({ type: "device", deviceId }));
  }
  keys.add("outdoor");
  keys.add("aircon");
  return keys;
}

export function normalizeHiddenDeviceKeys(
  saved: readonly string[] | null,
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): Set<string> {
  const validKeys = buildAllDashboardTargetKeys(sensorDeviceIds);
  if (!saved?.length) return new Set();

  return new Set(saved.filter((key) => validKeys.has(key)));
}

export function loadHiddenDeviceKeys(
  sensorDeviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): Set<string> {
  const storage = getStorage();
  if (!storage) return new Set();

  try {
    const raw = storage.getItem(HIDDEN_DEVICES_STORAGE_KEY);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();

    const keys = parsed.filter((entry): entry is string => typeof entry === "string");
    return normalizeHiddenDeviceKeys(keys, sensorDeviceIds);
  } catch {
    return new Set();
  }
}

export function saveHiddenDeviceKeys(keys: Set<string>): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(HIDDEN_DEVICES_STORAGE_KEY, JSON.stringify([...keys]));
  window.dispatchEvent(new Event(VISIBLE_DEVICES_CHANGED_EVENT));
}

export function isTargetVisible(
  hiddenKeys: Set<string>,
  item: DisplayOrderItem
): boolean {
  return !hiddenKeys.has(orderItemKey(item));
}

export function setTargetVisible(
  hiddenKeys: Set<string>,
  item: DisplayOrderItem,
  visible: boolean
): Set<string> {
  const key = orderItemKey(item);
  const next = new Set(hiddenKeys);
  if (visible) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

export function filterDisplayOrderByVisibility(
  order: DisplayOrderItem[],
  hiddenKeys: Set<string>
): DisplayOrderItem[] {
  return order.filter((item) => isTargetVisible(hiddenKeys, item));
}

export function getVisibleSensorDeviceIds(
  sensorDeviceIds: readonly number[],
  hiddenKeys: Set<string>
): number[] {
  return sensorDeviceIds.filter((deviceId) =>
    isTargetVisible(hiddenKeys, { type: "device", deviceId })
  );
}

export function getVisibleChartDeviceIds(
  sensorDeviceIds: readonly number[],
  hiddenKeys: Set<string>
): number[] {
  const ids = getVisibleSensorDeviceIds(sensorDeviceIds, hiddenKeys);
  if (isTargetVisible(hiddenKeys, { type: "aircon" })) {
    ids.push(AIRCON_CHART_DEVICE_ID);
  }
  return ids;
}
