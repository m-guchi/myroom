import { describe, expect, it } from "vitest";
import {
  applyDeviceInheritance,
  buildLocationNames,
  expandDeviceIdsForHistory,
  filterToLocationActiveDeviceIds,
  findLeafDeviceId,
  getInheritanceChain,
  getLocationName,
  isPredecessorDevice,
  resolveLocationDisplayOrder,
} from "@/lib/device-inheritance";
import { deviceMetricKey, type DeviceInfo, type HistoryPoint } from "@/lib/types";

const devices: DeviceInfo[] = [
  { id: 1, name: "旧リビング", inherits_from: null },
  { id: 2, name: "新リビング", inherits_from: 1 },
];

function point(
  time: number,
  values: Record<number, Partial<Record<"temperature", number>>>
): HistoryPoint {
  const row: HistoryPoint = {
    datetime: new Date(time).toISOString(),
    datetimeObj: time,
  };
  const record = row as unknown as Record<string, unknown>;
  for (const [deviceId, metrics] of Object.entries(values)) {
    for (const [metric, value] of Object.entries(metrics)) {
      if (value != null) {
        record[deviceMetricKey(Number(deviceId), metric as "temperature")] = value;
      }
    }
  }
  return row;
}

describe("device-inheritance", () => {
  it("builds inheritance chain from root to device", () => {
    expect(getInheritanceChain(2, devices)).toEqual([1, 2]);
    expect(getInheritanceChain(1, devices)).toEqual([1]);
  });

  it("expands fetch ids with predecessors", () => {
    expect(expandDeviceIdsForHistory([2], devices)).toEqual([1, 2]);
  });

  it("maps predecessor data onto successor before successor starts", () => {
    const history = [
      point(1000, { 1: { temperature: 20 } }),
      point(2000, { 1: { temperature: 21 } }),
      point(3000, { 2: { temperature: 22 } }),
    ];

    const merged = applyDeviceInheritance(history, 2, devices);
    const row0 = merged[0] as unknown as Record<string, unknown>;
    const row2 = merged[2] as unknown as Record<string, unknown>;

    expect(row0[deviceMetricKey(2, "temperature")]).toBe(20);
    expect(row2[deviceMetricKey(2, "temperature")]).toBe(22);
  });

  it("identifies predecessor and leaf devices", () => {
    expect(isPredecessorDevice(1, devices)).toBe(true);
    expect(isPredecessorDevice(2, devices)).toBe(false);
    expect(findLeafDeviceId(1, devices)).toBe(2);
    expect(findLeafDeviceId(2, devices)).toBe(2);
  });

  it("uses root device name as location name", () => {
    const names = { 1: "旧リビング", 2: "新リビング" };
    expect(getLocationName(2, devices, names)).toBe("旧リビング");
    expect(buildLocationNames(devices, names)).toEqual({ 2: "旧リビング" });
  });

  it("resolves display order to location cards only", () => {
    const order = [
      { type: "device" as const, deviceId: 1 },
      { type: "device" as const, deviceId: 2 },
      { type: "outdoor" as const },
    ];
    expect(resolveLocationDisplayOrder(order, devices)).toEqual([
      { type: "device", deviceId: 2 },
      { type: "outdoor" },
    ]);
    expect(filterToLocationActiveDeviceIds([1, 2], devices)).toEqual([2]);
  });
});
