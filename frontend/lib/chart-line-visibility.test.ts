import { describe, expect, it, vi } from "vitest";
import {
  AIRCON_TARGET_VISIBILITY_KEY,
  buildDefaultChartLineVisibility,
  deviceVisibilityKey,
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
  it("builds defaults with sensors visible and outdoor hidden", () => {
    const defaults = buildDefaultChartLineVisibility([1, 2]);

    expect(defaults[deviceVisibilityKey(1)]).toBe(true);
    expect(defaults[deviceVisibilityKey(2)]).toBe(true);
    expect(defaults[OUTDOOR_VISIBILITY_KEY]).toBe(false);
    expect(defaults[AIRCON_TARGET_VISIBILITY_KEY]).toBe(true);
  });

  it("normalizes saved settings and keeps defaults for missing keys", () => {
    const normalized = normalizeChartLineVisibility(
      {
        [deviceVisibilityKey(1)]: false,
        [OUTDOOR_VISIBILITY_KEY]: true,
      },
      [1, 2]
    );

    expect(normalized[deviceVisibilityKey(1)]).toBe(false);
    expect(normalized[deviceVisibilityKey(2)]).toBe(true);
    expect(normalized[OUTDOOR_VISIBILITY_KEY]).toBe(true);
  });

  it("toggles visibility", () => {
    const defaults = buildDefaultChartLineVisibility([1]);
    const hidden = toggleChartLineVisibility(defaults, deviceVisibilityKey(1));

    expect(isChartLineVisible(defaults, deviceVisibilityKey(1))).toBe(true);
    expect(isChartLineVisible(hidden, deviceVisibilityKey(1))).toBe(false);
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
      [deviceVisibilityKey(2)]: false,
      [OUTDOOR_VISIBILITY_KEY]: true,
    });

    const loaded = loadChartLineVisibility([1, 2]);
    expect(loaded[deviceVisibilityKey(1)]).toBe(true);
    expect(loaded[deviceVisibilityKey(2)]).toBe(false);
    expect(loaded[OUTDOOR_VISIBILITY_KEY]).toBe(true);

    vi.unstubAllGlobals();
  });

  it("maps display order items to visibility keys", () => {
    expect(
      getDisplayItemVisibilityKey({ type: "device", deviceId: 2 })
    ).toBe(deviceVisibilityKey(2));
    expect(getDisplayItemVisibilityKey({ type: "outdoor" })).toBe(
      OUTDOOR_VISIBILITY_KEY
    );
  });

  it("merges session overrides on top of defaults", () => {
    const defaults = buildDefaultChartLineVisibility([1]);
    const effective = mergeEffectiveChartLineVisibility(defaults, {
      [deviceVisibilityKey(1)]: false,
      [OUTDOOR_VISIBILITY_KEY]: true,
    });

    expect(resolveEffectiveChartLineVisibility(defaults, {}, deviceVisibilityKey(1))).toBe(
      true
    );
    expect(
      resolveEffectiveChartLineVisibility(defaults, { [deviceVisibilityKey(1)]: false }, deviceVisibilityKey(1))
    ).toBe(false);
    expect(isChartLineVisible(effective, deviceVisibilityKey(1))).toBe(false);
    expect(isChartLineVisible(effective, OUTDOOR_VISIBILITY_KEY)).toBe(true);
  });
});
