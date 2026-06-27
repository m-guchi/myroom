import type { DisplayOrderItem } from "@/lib/display-order";
import {
  CHART_METRICS,
  deviceDht11TemperatureKey,
  deviceMetricKey,
  deviceMetricMaxKey,
  deviceMetricMinKey,
  type DeviceInfo,
  type HistoryPoint,
} from "@/lib/types";

/** 継承チェーンを古い順（先祖→現在）で返す */
export function getInheritanceChain(
  deviceId: number,
  devices: readonly DeviceInfo[]
): number[] {
  const byId = new Map(devices.map((device) => [device.id, device]));
  const chain: number[] = [];
  const visited = new Set<number>();
  let current: number | null = deviceId;

  while (current != null) {
    if (visited.has(current)) break;
    visited.add(current);
    chain.unshift(current);
    const device = byId.get(current);
    current = device?.inherits_from ?? null;
  }

  return chain;
}

/** グラフ取得用に継承元デバイス ID を含めて展開 */
export function expandDeviceIdsForHistory(
  deviceIds: readonly number[],
  devices: readonly DeviceInfo[]
): number[] {
  const expanded = new Set<number>();
  for (const deviceId of deviceIds) {
    for (const chainId of getInheritanceChain(deviceId, devices)) {
      expanded.add(chainId);
    }
  }
  return [...expanded].sort((a, b) => a - b);
}

function hasDeviceMetricData(point: HistoryPoint, deviceId: number): boolean {
  const row = point as unknown as Record<string, unknown>;
  for (const metric of CHART_METRICS) {
    const value = row[deviceMetricKey(deviceId, metric)];
    if (typeof value === "number" && !Number.isNaN(value)) return true;
  }
  return false;
}

function getFirstDataTime(
  history: HistoryPoint[],
  deviceId: number
): number | null {
  for (const point of history) {
    if (hasDeviceMetricData(point, deviceId)) {
      return point.datetimeObj;
    }
  }
  return null;
}

function getActiveDeviceAtTime(
  chain: number[],
  firstDataByDevice: Map<number, number>,
  time: number
): number {
  let active = chain[0];
  for (let index = 1; index < chain.length; index += 1) {
    const deviceId = chain[index];
    const firstTime = firstDataByDevice.get(deviceId);
    if (firstTime != null && time >= firstTime) {
      active = deviceId;
    }
  }
  return active;
}

function copyDeviceMetrics(
  target: HistoryPoint,
  source: HistoryPoint,
  fromDeviceId: number,
  toDeviceId: number
): void {
  const targetRow = target as unknown as Record<string, unknown>;
  const sourceRow = source as unknown as Record<string, unknown>;

  for (const metric of CHART_METRICS) {
    const sourceKey = deviceMetricKey(fromDeviceId, metric);
    const targetKey = deviceMetricKey(toDeviceId, metric);
    const value = sourceRow[sourceKey];
    if (typeof value === "number" && !Number.isNaN(value)) {
      targetRow[targetKey] = value;
    }

    const minKey = deviceMetricMinKey(fromDeviceId, metric);
    const maxKey = deviceMetricMaxKey(fromDeviceId, metric);
    const targetMinKey = deviceMetricMinKey(toDeviceId, metric);
    const targetMaxKey = deviceMetricMaxKey(toDeviceId, metric);
    const minVal = sourceRow[minKey];
    const maxVal = sourceRow[maxKey];
    if (typeof minVal === "number" && !Number.isNaN(minVal)) {
      targetRow[targetMinKey] = minVal;
    }
    if (typeof maxVal === "number" && !Number.isNaN(maxVal)) {
      targetRow[targetMaxKey] = maxVal;
    }

    const rangeKey = `d${fromDeviceId}_${metric}Range`;
    const targetRangeKey = `d${toDeviceId}_${metric}Range`;
    const range = sourceRow[rangeKey];
    if (Array.isArray(range) && range.length === 2) {
      targetRow[targetRangeKey] = range;
    }
  }

  const dht11Key = deviceDht11TemperatureKey(fromDeviceId);
  const targetDht11Key = deviceDht11TemperatureKey(toDeviceId);
  const dht11 = sourceRow[dht11Key];
  if (typeof dht11 === "number" && !Number.isNaN(dht11)) {
    targetRow[targetDht11Key] = dht11;
  }
}

/** 継承チェーンに基づき、後継デバイスの系列に先行データを連結する */
export function applyDeviceInheritance(
  history: HistoryPoint[],
  targetDeviceId: number,
  devices: readonly DeviceInfo[]
): HistoryPoint[] {
  const chain = getInheritanceChain(targetDeviceId, devices);
  if (chain.length <= 1) return history;

  const firstDataByDevice = new Map<number, number>();
  for (const deviceId of chain) {
    const firstTime = getFirstDataTime(history, deviceId);
    if (firstTime != null) {
      firstDataByDevice.set(deviceId, firstTime);
    }
  }

  return history.map((point) => {
    const activeDeviceId = getActiveDeviceAtTime(
      chain,
      firstDataByDevice,
      point.datetimeObj
    );
    if (activeDeviceId === targetDeviceId) return point;

    const next = { ...point };
    copyDeviceMetrics(next, point, activeDeviceId, targetDeviceId);
    return next;
  });
}

/** 表示対象デバイスそれぞれに継承を適用 */
export function applyAllDeviceInheritance(
  history: HistoryPoint[],
  deviceIds: readonly number[],
  devices: readonly DeviceInfo[]
): HistoryPoint[] {
  let result = history;
  for (const deviceId of deviceIds) {
    result = applyDeviceInheritance(result, deviceId, devices);
  }
  return result;
}

/** 他デバイスの inherits_from になっている = 継承元（トップ画面非表示） */
export function isPredecessorDevice(
  deviceId: number,
  devices: readonly DeviceInfo[]
): boolean {
  return devices.some((device) => device.inherits_from === deviceId);
}

/** 同じ設置場所のチェーン先端（現在稼働中のデバイス）を返す */
export function findLeafDeviceId(
  deviceId: number,
  devices: readonly DeviceInfo[]
): number {
  let current = deviceId;
  const visited = new Set<number>();

  while (true) {
    if (visited.has(current)) return current;
    visited.add(current);
    const successor = devices.find((device) => device.inherits_from === current);
    if (!successor) return current;
    current = successor.id;
  }
}

/** 設置場所名（継承チェーン最古のデバイス名） */
export function getLocationName(
  activeDeviceId: number,
  devices: readonly DeviceInfo[],
  deviceNames: Record<number, string>
): string {
  const chain = getInheritanceChain(activeDeviceId, devices);
  const rootId = chain[0];
  return (
    deviceNames[rootId] ??
    devices.find((device) => device.id === rootId)?.name ??
    `デバイス ${rootId}`
  );
}

/** ダッシュボード用: 継承元を先端デバイスに置き換え、重複を除く */
export function resolveLocationDisplayOrder(
  order: readonly DisplayOrderItem[],
  devices: readonly DeviceInfo[]
): DisplayOrderItem[] {
  const seenActive = new Set<number>();
  const result: DisplayOrderItem[] = [];

  for (const item of order) {
    if (item.type !== "device") {
      result.push(item);
      continue;
    }
    const leafId = findLeafDeviceId(item.deviceId, devices);
    if (seenActive.has(leafId)) continue;
    seenActive.add(leafId);
    result.push({ type: "device", deviceId: leafId });
  }

  return result;
}

/** 表示対象 ID を設置場所（チェーン先端）単位に正規化 */
export function filterToLocationActiveDeviceIds(
  deviceIds: readonly number[],
  devices: readonly DeviceInfo[]
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];

  for (const deviceId of deviceIds) {
    const leafId = findLeafDeviceId(deviceId, devices);
    if (seen.has(leafId)) continue;
    seen.add(leafId);
    result.push(leafId);
  }

  return result;
}

/** 設置場所カード用の表示名マップ（先端 device_id → 場所名） */
export function buildLocationNames(
  devices: readonly DeviceInfo[],
  deviceNames: Record<number, string>
): Record<number, string> {
  const names: Record<number, string> = {};
  for (const device of devices) {
    const leafId = findLeafDeviceId(device.id, devices);
    names[leafId] = getLocationName(leafId, devices, deviceNames);
  }
  return names;
}
