import { describe, expect, it } from "vitest";
import {
  calcDiscomfortIndex,
  computeChartDomain,
  downsampleHistoryForChart,
  filterHistoryForDomain,
  getComfortAdvice,
  getViewRangeMs,
  isAggregatedRange,
} from "@/lib/chart-utils";
import type { HistoryPoint } from "@/lib/types";
import {
  getHistoryChunkMs,
  getHistoryInitialSpanMs,
  mergeHistoryPoints,
  toApiDateTime,
} from "@/lib/history-loader";

function makePoint(
  datetimeObj: number,
  temperature: number,
  humidity = 50,
  pressure = 1013
): HistoryPoint {
  return {
    datetimeObj,
    temperature,
    humidity,
    pressure,
  };
}

describe("getViewRangeMs", () => {
  it("returns expected window sizes", () => {
    expect(getViewRangeMs("day")).toBe(86400000);
    expect(getViewRangeMs("week")).toBe(7 * 86400000);
  });
});

describe("computeChartDomain", () => {
  it("builds a sliding window from the latest point", () => {
    const history = [
      makePoint(1000, 20),
      makePoint(2000, 21),
      makePoint(3000, 22),
    ];
    const domain = computeChartDomain(history, "day", 0);
    expect(domain[0]).not.toBe("dataMin");
    expect(domain[1]).toBeGreaterThan(domain[0] as number);
  });
});

describe("filterHistoryForDomain", () => {
  it("returns points inside the visible domain", () => {
    const history = [
      makePoint(1000, 20),
      makePoint(2000, 21),
      makePoint(3000, 22),
    ];
    const filtered = filterHistoryForDomain(history, [1500, 2500], 0);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].datetimeObj).toBe(2000);
  });
});

describe("downsampleHistoryForChart", () => {
  it("reduces large datasets while keeping extrema", () => {
    const history = Array.from({ length: 1000 }, (_, index) =>
      makePoint(index, index % 2 === 0 ? 10 : 30)
    );
    const downsampled = downsampleHistoryForChart(history, "temperature", 40);
    expect(downsampled.length).toBeLessThanOrEqual(80);
    expect(downsampled.length).toBeGreaterThan(0);
  });
});

describe("comfort helpers", () => {
  it("calculates discomfort index", () => {
    const di = calcDiscomfortIndex(25, 50);
    expect(di).toBeGreaterThan(60);
    expect(di).toBeLessThan(80);
  });

  it("returns advice for comfortable conditions", () => {
    const advice = getComfortAdvice(24, 50);
    expect(advice.mainAdvice).toContain("快適");
  });
});

describe("history-loader", () => {
  it("formats API datetime strings", () => {
    const formatted = toApiDateTime(new Date("2026-05-30T12:34:56"));
    expect(formatted).toBe("2026-05-30T12:34:56");
  });

  it("merges history without duplicates", () => {
    const existing = [makePoint(1000, 20)];
    const incoming = [makePoint(1000, 20), makePoint(2000, 21)];
    const merged = mergeHistoryPoints(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((point) => point.datetimeObj)).toEqual([1000, 2000]);
  });

  it("returns larger initial spans for year view", () => {
    expect(getHistoryInitialSpanMs("year")).toBeGreaterThan(
      getHistoryInitialSpanMs("day")
    );
    expect(getHistoryChunkMs("year")).toBeGreaterThan(getHistoryChunkMs("day"));
  });
});

describe("isAggregatedRange", () => {
  it("aggregates only year view", () => {
    expect(isAggregatedRange("year")).toBe(true);
    expect(isAggregatedRange("month")).toBe(false);
  });
});
