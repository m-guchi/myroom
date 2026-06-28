import { describe, expect, it } from "vitest";
import {
  pickOutdoorLatestSource,
  resolveOutdoorBatchLoadStatus,
  type LatestData,
} from "@/lib/types";

describe("outdoor latest helpers", () => {
  it("uses outdoor values from any visible device when primary device lacks them", () => {
    const latestByDevice: Record<number, LatestData | null> = {
      1: { device_id: 1, temperature: 24.0 },
      2: {
        device_id: 2,
        temperature: 26.0,
        outdoor_temperature: 28.1,
        outdoor_humidity: 62,
      },
    };

    expect(pickOutdoorLatestSource(latestByDevice)?.outdoor_temperature).toBe(28.1);
    expect(
      resolveOutdoorBatchLoadStatus(latestByDevice, { 1: "ok", 2: "ok" })
    ).toBe("ok");
  });

  it("reports empty when no device has outdoor values", () => {
    const latestByDevice: Record<number, LatestData | null> = {
      2: { device_id: 2, temperature: 26.0 },
    };

    expect(pickOutdoorLatestSource(latestByDevice)).toBeNull();
    expect(
      resolveOutdoorBatchLoadStatus(latestByDevice, { 2: "ok" })
    ).toBe("empty");
  });
});
