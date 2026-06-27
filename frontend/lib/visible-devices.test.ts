import { describe, expect, it, vi } from "vitest";
import {
  buildAllDashboardTargetKeys,
  getVisibleChartDeviceIds,
  getVisibleSensorDeviceIds,
  isTargetVisible,
  loadHiddenDeviceKeys,
  normalizeHiddenDeviceKeys,
  saveHiddenDeviceKeys,
  setTargetVisible,
  HIDDEN_DEVICES_STORAGE_KEY,
} from "@/lib/visible-devices";
import { AIRCON_CHART_DEVICE_ID, getSensorDeviceIds } from "@/lib/types";

describe("visible-devices", () => {
  it("includes real sensor device id 3", () => {
    expect(
      getSensorDeviceIds([
        { id: 1, name: "リビング" },
        { id: 2, name: "寝室" },
        { id: 3, name: "書斎" },
      ])
    ).toEqual([1, 2, 3]);
    expect(getSensorDeviceIds([{ id: 3, name: "書斎" }])).toEqual([3]);
  });

  it("treats all dashboard targets as visible by default", () => {
    expect([...buildAllDashboardTargetKeys([1, 2])].sort()).toEqual(
      ["aircon", "device:1", "device:2", "outdoor"].sort()
    );
    expect(isTargetVisible(new Set(), { type: "device", deviceId: 2 })).toBe(true);
  });

  it("keeps hidden devices hidden while new devices stay visible", () => {
    const hidden = normalizeHiddenDeviceKeys(["device:2"], [1, 2, 3]);
    expect(isTargetVisible(hidden, { type: "device", deviceId: 2 })).toBe(false);
    expect(isTargetVisible(hidden, { type: "device", deviceId: 3 })).toBe(true);
  });

  it("filters visible sensor and chart device ids", () => {
    const hidden = new Set(["device:1", "outdoor"]);
    expect(getVisibleSensorDeviceIds([1, 2], hidden)).toEqual([2]);
    expect(getVisibleChartDeviceIds([1, 2], hidden)).toEqual([
      2,
      AIRCON_CHART_DEVICE_ID,
    ]);
  });

  it("toggles visibility for a target", () => {
    const hidden = setTargetVisible(new Set(), { type: "device", deviceId: 1 }, false);
    expect(hidden.has("device:1")).toBe(true);
    const shown = setTargetVisible(hidden, { type: "device", deviceId: 1 }, true);
    expect(shown.has("device:1")).toBe(false);
  });

  it("persists hidden devices to localStorage", () => {
    const backing: Record<string, string> = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => backing[key] ?? null,
        setItem: (key: string, value: string) => {
          backing[key] = value;
        },
      },
      dispatchEvent: vi.fn(),
    });

    saveHiddenDeviceKeys(new Set(["device:2"]));
    expect(JSON.parse(backing[HIDDEN_DEVICES_STORAGE_KEY]!)).toEqual(["device:2"]);
    expect(
      isTargetVisible(loadHiddenDeviceKeys([1, 2]), { type: "device", deviceId: 2 })
    ).toBe(false);
    expect(
      isTargetVisible(loadHiddenDeviceKeys([1, 2]), { type: "device", deviceId: 1 })
    ).toBe(true);

    vi.unstubAllGlobals();
  });
});
