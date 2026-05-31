import { describe, expect, it } from "vitest";
import {
  buildDefaultDisplayOrder,
  getChartDeviceSeriesOrder,
  moveDisplayOrderItem,
  normalizeDisplayOrder,
  orderItemKey,
} from "@/lib/display-order";

describe("display-order", () => {
  it("builds default order with sensors, outdoor, and aircon", () => {
    expect(buildDefaultDisplayOrder([1, 2])).toEqual([
      { type: "device", deviceId: 1 },
      { type: "device", deviceId: 2 },
      { type: "outdoor" },
      { type: "aircon" },
    ]);
  });

  it("normalizes saved order and appends missing items", () => {
    const normalized = normalizeDisplayOrder(
      [
        { type: "device", deviceId: 2 },
        { type: "aircon" },
      ],
      [1, 2]
    );

    expect(normalized.map(orderItemKey)).toEqual([
      "device:2",
      "aircon",
      "device:1",
      "outdoor",
    ]);
  });

  it("moves items up and down", () => {
    const order = buildDefaultDisplayOrder([1, 2]);
    expect(moveDisplayOrderItem(order, 1, -1).map(orderItemKey)).toEqual([
      "device:2",
      "device:1",
      "outdoor",
      "aircon",
    ]);
  });

  it("derives chart device order", () => {
    expect(
      getChartDeviceSeriesOrder([
        { type: "device", deviceId: 2 },
        { type: "outdoor" },
        { type: "device", deviceId: 1 },
        { type: "aircon" },
      ])
    ).toEqual([2, 1, 3]);
  });
});
