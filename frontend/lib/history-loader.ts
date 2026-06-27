import type { ChartMetric, ChartViewRange, HistoryPoint } from "@/lib/types";
import {
  CHART_METRICS,
  deviceAirconPowerKey,
  deviceDht11TemperatureKey,
  deviceMetricKey,
  deviceMetricMaxKey,
  deviceMetricMinKey,
  deviceTargetMetricKey,
  getDeviceTargetMetricValue,
  isAirconPowerOff,
} from "@/lib/types";
import { getViewRangeMs } from "@/lib/chart-utils";

const DAY_MS = 86400000;

/** 初回に読み込む期間（表示幅の数倍） */
export function getHistoryInitialSpanMs(viewRange: ChartViewRange): number {
  const windowMs = getViewRangeMs(viewRange);
  switch (viewRange) {
    case "day":
      return Math.max(windowMs * 3, 7 * DAY_MS);
    case "week":
      return Math.max(windowMs * 2, 21 * DAY_MS);
    case "month":
      return Math.max(windowMs * 2, 45 * DAY_MS);
    case "year":
      return 400 * DAY_MS;
    default:
      return windowMs * 2;
  }
}

/** パン時に追加取得する1チャンクの長さ */
export function getHistoryChunkMs(viewRange: ChartViewRange): number {
  if (viewRange === "year") return 180 * DAY_MS;
  return 14 * DAY_MS;
}

export function toApiDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function mergeHistoryPoints(
  existing: HistoryPoint[],
  incoming: HistoryPoint[]
): HistoryPoint[] {
  if (!incoming.length) return existing;
  if (!existing.length) return incoming;

  const byTime = new Map<number, HistoryPoint>();
  for (const point of existing) byTime.set(point.datetimeObj, point);
  for (const point of incoming) {
    const prev = byTime.get(point.datetimeObj);
    byTime.set(point.datetimeObj, prev ? { ...prev, ...point } : point);
  }

  return Array.from(byTime.values()).sort((a, b) => a.datetimeObj - b.datetimeObj);
}

/** 複数デバイスの履歴を時刻軸で1本にマージ */
export function mergeMultiDeviceHistory(
  byDevice: Record<number, HistoryPoint[]>
): HistoryPoint[] {
  const byTime = new Map<number, HistoryPoint>();

  for (const [deviceIdStr, points] of Object.entries(byDevice)) {
    const deviceId = Number(deviceIdStr);
    for (const point of points) {
      let row = byTime.get(point.datetimeObj);
      if (!row) {
        row = {
          datetime: point.datetime,
          datetimeObj: point.datetimeObj,
          outdoor_temperature: point.outdoor_temperature,
          outdoor_humidity: point.outdoor_humidity,
          outdoor_pressure: point.outdoor_pressure,
        };
        byTime.set(point.datetimeObj, row);
      } else if (point.outdoor_temperature != null) {
        row.outdoor_temperature = point.outdoor_temperature;
        row.outdoor_humidity = point.outdoor_humidity;
        row.outdoor_pressure = point.outdoor_pressure;
      }

      const rowRecord = row as unknown as Record<string, unknown>;
      for (const metric of CHART_METRICS) {
        const value = point[metric as keyof HistoryPoint];
        if (typeof value === "number" && !Number.isNaN(value)) {
          rowRecord[deviceMetricKey(deviceId, metric)] = value;
        }

        const minVal = point[`${metric}_min` as keyof HistoryPoint];
        const maxVal = point[`${metric}_max` as keyof HistoryPoint];
        if (typeof minVal === "number" && !Number.isNaN(minVal)) {
          rowRecord[deviceMetricMinKey(deviceId, metric)] = minVal;
        }
        if (typeof maxVal === "number" && !Number.isNaN(maxVal)) {
          rowRecord[deviceMetricMaxKey(deviceId, metric)] = maxVal;
        }

        const range = point[`${metric}Range` as keyof HistoryPoint];
        if (Array.isArray(range) && range.length === 2) {
          rowRecord[`d${deviceId}_${metric}Range`] = range;
        }
      }

      const dht11 = point.temperature_dht11;
      if (typeof dht11 === "number" && !Number.isNaN(dht11)) {
        rowRecord[deviceDht11TemperatureKey(deviceId)] = dht11;
      }
    }
  }

  return Array.from(byTime.values()).sort((a, b) => a.datetimeObj - b.datetimeObj);
}

export type LoadedHistoryRange = { min: number; max: number };

export function getLoadedRange(data: HistoryPoint[]): LoadedHistoryRange | null {
  if (!data.length) return null;
  return {
    min: data[0].datetimeObj,
    max: data[data.length - 1].datetimeObj,
  };
}

export interface AirconHistoryPoint {
  datetime?: string;
  datetimeObj: number;
  temperature?: number;
  target_temperature?: number;
  power?: string;
}

/** エアコン履歴をグラフ用のマルチデバイス形式にマージ */
export function mergeAirconIntoHistory(
  base: HistoryPoint[],
  airconPoints: AirconHistoryPoint[],
  chartDeviceId: number
): HistoryPoint[] {
  if (!airconPoints.length) return base;

  const byTime = new Map<number, HistoryPoint>();
  for (const point of base) byTime.set(point.datetimeObj, { ...point });

  for (const point of airconPoints) {
    let row = byTime.get(point.datetimeObj);
    if (!row) {
      row = {
        datetime: point.datetime,
        datetimeObj: point.datetimeObj,
      };
      byTime.set(point.datetimeObj, row);
    }

    const record = row as unknown as Record<string, unknown>;
    if (point.temperature != null) {
      record[deviceMetricKey(chartDeviceId, "temperature")] = point.temperature;
    }
    if (point.power != null) {
      record[deviceAirconPowerKey(chartDeviceId)] = point.power;
    }
    if (point.target_temperature != null && !isAirconPowerOff(point.power)) {
      record[deviceTargetMetricKey(chartDeviceId)] = point.target_temperature;
    }
  }

  const merged = Array.from(byTime.values()).sort((a, b) => a.datetimeObj - b.datetimeObj);
  return merged;
}

/** @deprecated 設定温度の前方補完は行わない（OFF 区間をグラフに出さないため） */
export function applyAirconTargetForwardFill(
  data: HistoryPoint[],
  _chartDeviceId: number
): HistoryPoint[] {
  return data;
}
