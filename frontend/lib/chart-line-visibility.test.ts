import { describe, expect, it, vi } from "vitest";
import {
  AIRCON_TARGET_VISIBILITY_KEY,
  buildDefaultChartLineVisibility,
  deviceDht11VisibilityKey,
  deviceMetricVisibilityKey,
  isChartLineVisible,
  getDisplayItemVisibilityKey,
  loadChartLineVisibility,
  mergeEffectiveChartLineVisibility,
  normalizeChartLineVisibility,
  OUTDOOR_VISIBILITY_KEY,
  resolveEffectiveChartLineVisibility,
  saveChartLineVisibility,
  toggleChartLineVisibility,
} from "@/lib/chart-line-visibility";

describe("chart-line-visibility", () => {
  it("builds defaults with all metric keys visible per device and outdoor hidden", () => {
    const defaults = buildDefaultChartLineVisibility([1, 2]);

    expect(defaults[deviceMetricVisibilityKey(1, "temperature")]).toBe(true);
    expect(defaults[deviceMetricVisibilityKey(1, "humidity")]).toBe(true);
    expect(defaults[deviceMetricVisibilityKey(2, "temperature")]).toBe(true);
    expect(defaults[deviceMetricVisibilityKey(2, "humidity")]).toBe(true);
    expect(defaults[deviceDht11VisibilityKey(1)]).toBe(true);
    expect(defaults[OUTDOOR_VISIBILITY_KEY]).toBe(false);
    expect(defaults[AIRCON_TARGET_VISIBILITY_KEY]).toBe(true);
  });

  it("normalizes saved settings and keeps defaults for missing keys", () => {
    const normalized = normalizeChartLineVisibility(
      {
        [deviceMetricVisibilityKey(1, "temperature")]: false,
        [OUTDOOR_VISIBILITY_KEY]: true,
      },
      [1, 2]
    );

    expect(normalized[deviceMetricVisibilityKey(1, "temperature")]).toBe(false);
    expect(normalized[deviceMetricVisibilityKey(1, "humidity")]).toBe(true);
    expect(normalized[deviceMetricVisibilityKey(2, "temperature")]).toBe(true);
    expect(normalized[OUTDOOR_VISIBILITY_KEY]).toBe(true);
  });

  it("toggles visibility", () => {
    const defaults = buildDefaultChartLineVisibility([1]);
    const key = deviceMetricVisibilityKey(1, "temperature");
    const hidden = toggleChartLineVisibility(defaults, key);

    expect(isChartLineVisible(defaults, key)).toBe(true);
    expect(isChartLineVisible(hidden, key)).toBe(false);
  });

  it("toggling temperature does not affect humidity", () => {
    const defaults = buildDefaultChartLineVisibility([1]);
    const tempKey = deviceMetricVisibilityKey(1, "temperature");
    const humKey = deviceMetricVisibilityKey(1, "humidity");
    const updated = toggleChartLineVisibility(defaults, tempKey);

    expect(isChartLineVisible(updated, tempKey)).toBe(false);
    expect(isChartLineVisible(updated, humKey)).toBe(true);
  });

  it("loads and saves settings from localStorage", () => {
    const backing: Record<string, string> = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => backing[key] ?? null,
        setItem: (key: string, value: string) => {
          backing[key] = value;
        },
        removeItem: (key: string) => {
          delete backing[key];
        },
      },
    });

    saveChartLineVisibility({
      [deviceMetricVisibilityKey(2, "temperature")]: false,
      [OUTDOOR_VISIBILITY_KEY]: true,
    });

    const loaded = loadChartLineVisibility([1, 2]);
    expect(loaded[deviceMetricVisibilityKey(1, "temperature")]).toBe(true);
    expect(loaded[deviceMetricVisibilityKey(2, "temperature")]).toBe(false);
    expect(loaded[OUTDOOR_VISIBILITY_KEY]).toBe(true);

    vi.unstubAllGlobals();
  });

  it("maps display order items to visibility keys", () => {
    expect(
      getDisplayItemVisibilityKey({ type: "device", deviceId: 2 })
    ).toBe("device:2");
    expect(getDisplayItemVisibilityKey({ type: "outdoor" })).toBe(
      OUTDOOR_VISIBILITY_KEY
    );
  });

  it("merges session overrides on top of defaults", () => {
    const defaults = buildDefaultChartLineVisibility([1]);
    const tempKey = deviceMetricVisibilityKey(1, "temperature");
    const effective = mergeEffectiveChartLineVisibility(defaults, {
      [tempKey]: false,
      [OUTDOOR_VISIBILITY_KEY]: true,
    });

    expect(resolveEffectiveChartLineVisibility(defaults, {}, tempKey)).toBe(
      true
    );
    expect(
      resolveEffectiveChartLineVisibility(defaults, { [tempKey]: false }, tempKey)
    ).toBe(false);
    expect(isChartLineVisible(effective, tempKey)).toBe(false);
    expect(isChartLineVisible(effective, OUTDOOR_VISIBILITY_KEY)).toBe(true);
  });
});
