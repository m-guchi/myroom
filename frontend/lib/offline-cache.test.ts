import { describe, expect, it } from "vitest";
import {
  OFFLINE_CACHE_WINDOW_MS,
  buildDashboardOfflineSnapshot,
  filterDailyStatsToOfflineWindow,
  filterHistoryToOfflineWindow,
  getLatestDataTimestamp,
} from "@/lib/offline-cache";
import type { DailyStat, HistoryPoint, LatestData } from "@/lib/types";

const latestMs = new Date("2026-06-07T12:00:00").getTime();

function makePoint(offsetHours: number): HistoryPoint {
  const datetimeObj = latestMs + offsetHours * 60 * 60 * 1000;
  return {
    datetime: new Date(datetimeObj).toISOString(),
    datetimeObj,
    temperature: 24,
  };
}

describe("getLatestDataTimestamp", () => {
  it("uses the newest timestamp across latest values and history", () => {
    const latestByDevice: Record<number, LatestData | null> = {
      1: { datetime: "2026-06-07T11:50:00" },
      2: { datetime: "2026-06-07T12:00:00" },
    };

    expect(getLatestDataTimestamp(latestByDevice, null, [makePoint(-1)])).toBe(latestMs);
  });
});

describe("filterHistoryToOfflineWindow", () => {
  it("keeps only the latest 24 hours of history", () => {
    const history = [makePoint(-30), makePoint(-23), makePoint(-1), makePoint(0)];

    const filtered = filterHistoryToOfflineWindow(history, latestMs);

    expect(filtered.map((point) => point.datetimeObj)).toEqual([
      makePoint(-23).datetimeObj,
      makePoint(-1).datetimeObj,
      makePoint(0).datetimeObj,
    ]);
  });

  it("defaults to a 24 hour window", () => {
    expect(OFFLINE_CACHE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("filterDailyStatsToOfflineWindow", () => {
  it("keeps daily stats that overlap the offline window", () => {
    const dailyStatsByDevice: Record<number, DailyStat[]> = {
      1: [
        { date: "2026-06-05" },
        { date: "2026-06-06" },
        { date: "2026-06-07" },
      ],
    };

    const filtered = filterDailyStatsToOfflineWindow(dailyStatsByDevice, latestMs);

    expect(filtered[1]?.map((stat) => stat.date)).toEqual(["2026-06-06", "2026-06-07"]);
  });
});

describe("buildDashboardOfflineSnapshot", () => {
  it("builds a trimmed snapshot from dashboard state", () => {
    const snapshot = buildDashboardOfflineSnapshot({
      sensorDeviceIds: [1, 2],
      airconAcId: 1,
      latestByDevice: {
        1: { datetime: "2026-06-07T12:00:00", temperature: 24.5 },
      },
      dailyStatsByDevice: {
        1: [{ date: "2026-06-07", temp_max: 26, temp_min: 22 }],
      },
      airconLatest: { datetime: "2026-06-07T11:55:00", room_temperature: 24.2 },
      historyData: [makePoint(-30), makePoint(-2)],
      devices: [{ id: 1, name: "リビング" }],
      airconUnits: [{ ac_id: 1, name: "エアコン" }],
      outdoorLocation: null,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.historyData).toHaveLength(1);
    expect(snapshot?.dataLatestAt).toBe(new Date(latestMs).toISOString());
    expect(snapshot?.latestByDevice[1]?.temperature).toBe(24.5);
  });

  it("returns null when there is no history to cache", () => {
    const snapshot = buildDashboardOfflineSnapshot({
      sensorDeviceIds: [1],
      airconAcId: 1,
      latestByDevice: { 1: { datetime: "2026-06-07T12:00:00" } },
      dailyStatsByDevice: {},
      airconLatest: null,
      historyData: [makePoint(-30)],
      devices: [],
      airconUnits: [],
      outdoorLocation: null,
    });

    expect(snapshot).toBeNull();
  });
});
