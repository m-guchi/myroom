import type { ChartMetric, ChartViewRange, HistoryPoint, TimeRange } from "@/lib/types";
import {
  CHART_METRICS,
  deviceAirconPowerKey,
  deviceMetricKey,
  deviceMetricMaxKey,
  deviceMetricMinKey,
  deviceTargetMetricKey,
  getDeviceMetricValue,
  getDeviceTargetMetricValue,
  isAirconPowerOff,
  AIRCON_TARGET_CHART_KEY,
} from "@/lib/types";

export const VIEW_RANGE_MS: Record<ChartViewRange, number> = {
  day: 86400000,
  week: 7 * 86400000,
  month: 30 * 86400000,
  year: 365 * 86400000,
};

export function getViewRangeMs(viewRange: ChartViewRange): number {
  return VIEW_RANGE_MS[viewRange];
}

export type ChartDomain = [number, number];

/** 選択カーソルの位置（表示域の右から 10% = 90% 地点） */
export const SELECTION_TIME_RATIO = 0.9;

export function getMaxPositiveDomainOffset(viewRange: ChartViewRange): number {
  const windowMs = getViewRangeMs(viewRange);
  const rightPadding = windowMs * 0.03;
  return Math.max(0, windowMs * (1 - SELECTION_TIME_RATIO) - rightPadding);
}

/** 指定した選択時刻がカーソル位置（90%）に来る domainOffset を求める */
export function computeDomainOffsetForSelectionTime(
  historyData: HistoryPoint[],
  viewRange: ChartViewRange,
  selectionTime: number,
  options?: { allowPastExtension?: boolean; noMoreOlderData?: boolean }
): number {
  if (!historyData.length) return 0;

  const dataMaxTime = historyData[historyData.length - 1].datetimeObj;
  const windowMs = getViewRangeMs(viewRange);
  const rightPadding = windowMs * 0.03;
  const rawOffset =
    selectionTime -
    dataMaxTime -
    rightPadding +
    windowMs * (1 - SELECTION_TIME_RATIO);

  return clampDomainOffset(historyData, viewRange, rawOffset, 0, options);
}

export function computeChartDomain(
  historyData: HistoryPoint[],
  viewRange: ChartViewRange,
  domainOffset: number
): ChartDomain | ["dataMin", "dataMax"] {
  if (!historyData.length) return ["dataMin", "dataMax"];

  const dataMinTime = historyData[0].datetimeObj;
  const dataMaxTime = historyData[historyData.length - 1].datetimeObj;
  const windowMs = getViewRangeMs(viewRange);
  const rightPadding = windowMs * 0.03;
  const maxT = dataMaxTime + rightPadding + domainOffset;
  const minT = maxT - windowMs;

  return [minT, maxT];
}

export function filterHistoryForDomain(
  historyData: HistoryPoint[],
  domain: ChartDomain | ["dataMin", "dataMax"],
  bufferRatio = 0.05
): HistoryPoint[] {
  if (!historyData.length || domain[0] === "dataMin") return historyData;

  const dataMaxTime = historyData[historyData.length - 1].datetimeObj;
  let minT = domain[0];
  let maxT = Math.min(domain[1], dataMaxTime);
  const span = maxT - minT;
  minT -= span * bufferRatio;
  maxT += span * bufferRatio;

  let start = 0;
  let end = historyData.length - 1;

  let lo = 0;
  let hi = historyData.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (historyData[mid].datetimeObj < minT) lo = mid + 1;
    else hi = mid;
  }
  start = lo;

  lo = start;
  hi = historyData.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (historyData[mid].datetimeObj > maxT) hi = mid - 1;
    else lo = mid;
  }
  end = lo;

  if (start > end) return [];
  return historyData.slice(start, end + 1);
}

/** 描画用に間引き（ピークを保ちつつ点数を抑える） */
export function downsampleHistoryForChart(
  historyData: HistoryPoint[],
  metric: ChartMetric,
  maxPoints = 320,
  deviceIds?: readonly number[]
): HistoryPoint[] {
  if (historyData.length <= maxPoints) return historyData;

  const bucketCount = Math.ceil(maxPoints / 2);
  const bucketSize = historyData.length / bucketCount;
  const result: HistoryPoint[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const from = Math.floor(i * bucketSize);
    const to = Math.min(historyData.length, Math.floor((i + 1) * bucketSize));
    if (from >= to) continue;

    let minPoint = historyData[from];
    let maxPoint = historyData[from];
    let minVal: number | undefined;
    let maxVal: number | undefined;

    for (let j = from; j < to; j++) {
      const point = historyData[j];
      if (deviceIds?.length) {
        for (const deviceId of deviceIds) {
          const value = getDeviceMetricValue(point, deviceId, metric);
          if (value == null) continue;
          if (minVal == null || value < minVal) {
            minVal = value;
            minPoint = point;
          }
          if (maxVal == null || value > maxVal) {
            maxVal = value;
            maxPoint = point;
          }
        }
        continue;
      }

      const value = point[metric];
      if (typeof value !== "number") continue;
      if (minVal == null || value < minVal) {
        minVal = value;
        minPoint = point;
      }
      if (maxVal == null || value > maxVal) {
        maxVal = value;
        maxPoint = point;
      }
    }

    if (minVal == null && maxVal == null) continue;

    if (minPoint.datetimeObj <= maxPoint.datetimeObj) {
      result.push(minPoint);
      if (maxPoint !== minPoint) result.push(maxPoint);
    } else {
      result.push(maxPoint);
      if (minPoint !== maxPoint) result.push(minPoint);
    }
  }

  return result.sort((a, b) => a.datetimeObj - b.datetimeObj);
}

type MetricSeriesPoint = {
  datetimeObj: number;
  datetime?: string;
  value: number;
};

function downsampleMetricSeries(
  points: MetricSeriesPoint[],
  maxPoints = 320
): MetricSeriesPoint[] {
  if (points.length <= maxPoints) return points;

  const bucketCount = Math.ceil(maxPoints / 2);
  const bucketSize = points.length / bucketCount;
  const result: MetricSeriesPoint[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const from = Math.floor(i * bucketSize);
    const to = Math.min(points.length, Math.floor((i + 1) * bucketSize));
    if (from >= to) continue;

    let minPoint = points[from];
    let maxPoint = points[from];

    for (let j = from + 1; j < to; j++) {
      const point = points[j];
      if (point.value < minPoint.value) minPoint = point;
      if (point.value > maxPoint.value) maxPoint = point;
    }

    if (minPoint.datetimeObj <= maxPoint.datetimeObj) {
      result.push(minPoint);
      if (maxPoint !== minPoint) result.push(maxPoint);
    } else {
      result.push(maxPoint);
      if (minPoint !== maxPoint) result.push(minPoint);
    }
  }

  return result.sort((a, b) => a.datetimeObj - b.datetimeObj);
}

/** デバイスごとに間引いてから時刻軸でマージ（各デバイスの線が連続する） */
export function downsampleMultiDeviceHistoryForChart(
  historyData: HistoryPoint[],
  metric: ChartMetric,
  maxPoints = 320,
  deviceIds?: readonly number[]
): HistoryPoint[] {
  if (!deviceIds?.length) {
    return downsampleHistoryForChart(historyData, metric, maxPoints);
  }

  const byTime = new Map<number, HistoryPoint>();
  const historyByTime = new Map(historyData.map((point) => [point.datetimeObj, point]));

  for (const deviceId of deviceIds) {
    const series: MetricSeriesPoint[] = [];
    for (const point of historyData) {
      const value = getDeviceMetricValue(point, deviceId, metric);
      if (value == null) continue;
      series.push({
        datetimeObj: point.datetimeObj,
        datetime: point.datetime,
        value,
      });
    }

    const sampled = downsampleMetricSeries(series, maxPoints);
    const key = deviceMetricKey(deviceId, metric);
    const targetKey = deviceTargetMetricKey(deviceId);

    for (const entry of sampled) {
      let row = byTime.get(entry.datetimeObj);
      if (!row) {
        row = {
          datetimeObj: entry.datetimeObj,
          datetime: entry.datetime,
        };
        byTime.set(entry.datetimeObj, row);
      }
      const record = row as unknown as Record<string, unknown>;
      record[key] = entry.value;

      if (metric === "temperature") {
        const source = historyByTime.get(entry.datetimeObj);
        const targetValue =
          source != null ? getDeviceTargetMetricValue(source, deviceId) : undefined;
        if (targetValue != null) {
          record[targetKey] = targetValue;
        }
      }
    }
  }

  if (metric !== "co2" && hasOutdoorMetricData(historyData, metric)) {
    const outdoorKey = `outdoor_${metric}` as keyof HistoryPoint;
    const outdoorSeries: MetricSeriesPoint[] = [];

    for (const point of historyData) {
      const value = point[outdoorKey];
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      outdoorSeries.push({
        datetimeObj: point.datetimeObj,
        datetime: point.datetime,
        value,
      });
    }

    const sampledOutdoor = downsampleMetricSeries(outdoorSeries, maxPoints);
    for (const entry of sampledOutdoor) {
      let row = byTime.get(entry.datetimeObj);
      if (!row) {
        row = {
          datetimeObj: entry.datetimeObj,
          datetime: entry.datetime,
        };
        byTime.set(entry.datetimeObj, row);
      }
      (row as unknown as Record<string, unknown>)[outdoorKey] = entry.value;
    }
  }

  if (metric === "temperature" && deviceIds?.length) {
    for (const deviceId of deviceIds) {
      if (hasDeviceTargetMetricData(historyData, deviceId)) {
        downsampleTargetSeriesForDevice(historyData, deviceId, byTime, maxPoints);
      }
    }
  }

  return Array.from(byTime.values()).sort((a, b) => a.datetimeObj - b.datetimeObj);
}

export interface AirconTargetChartPoint {
  datetimeObj: number;
  datetime?: string;
  airconTarget: number;
}

/** 設定温度だけを連続した系列にして Recharts で描画する（OFF 区間で分割） */
export function buildAirconTargetChartSeries(
  historyData: HistoryPoint[],
  deviceId: number,
  maxPoints = 320
): AirconTargetChartPoint[] {
  return buildAirconTargetChartSegments(historyData, deviceId, maxPoints).flat();
}

export function buildAirconTargetChartSegments(
  historyData: HistoryPoint[],
  deviceId: number,
  maxPoints = 320
): AirconTargetChartPoint[][] {
  const powerKey = deviceAirconPowerKey(deviceId);
  const sorted = [...historyData].sort((a, b) => a.datetimeObj - b.datetimeObj);
  const segments: AirconTargetChartPoint[][] = [];
  let currentSegment: AirconTargetChartPoint[] = [];

  for (const point of sorted) {
    const record = point as unknown as Record<string, unknown>;
    const power = record[powerKey];
    if (isAirconPowerOff(power)) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    const value = getDeviceTargetMetricValue(point, deviceId);
    if (value == null) continue;

    currentSegment.push({
      datetimeObj: point.datetimeObj,
      datetime: point.datetime,
      airconTarget: value,
    });
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  if (maxPoints <= 0) {
    return segments;
  }

  return segments
    .map((segment) => {
      if (segment.length <= maxPoints) return segment;
      const sampled = downsampleMetricSeries(
        segment.map((entry) => ({
          datetimeObj: entry.datetimeObj,
          datetime: entry.datetime,
          value: entry.airconTarget,
        })),
        maxPoints
      );
      return sampled.map((entry) => ({
        datetimeObj: entry.datetimeObj,
        datetime: entry.datetime,
        airconTarget: entry.value,
      }));
    })
    .filter((segment) => segment.length > 0);
}

function downsampleTargetSeriesForDevice(
  historyData: HistoryPoint[],
  deviceId: number,
  byTime: Map<number, HistoryPoint>,
  maxPoints: number
) {
  const targetKey = deviceTargetMetricKey(deviceId);
  const powerKey = deviceAirconPowerKey(deviceId);
  const series: MetricSeriesPoint[] = [];

  for (const point of historyData) {
    const record = point as unknown as Record<string, unknown>;
    if (isAirconPowerOff(record[powerKey])) continue;

    const value = getDeviceTargetMetricValue(point, deviceId);
    if (value == null) continue;
    series.push({
      datetimeObj: point.datetimeObj,
      datetime: point.datetime,
      value,
    });
  }

  const sampled = downsampleMetricSeries(series, maxPoints);
  for (const entry of sampled) {
    let row = byTime.get(entry.datetimeObj);
    if (!row) {
      row = {
        datetimeObj: entry.datetimeObj,
        datetime: entry.datetime,
      };
      byTime.set(entry.datetimeObj, row);
    }
    (row as unknown as Record<string, unknown>)[targetKey] = entry.value;
  }
}

/** 選択カーソル位置まで線を延ばす（最終データより後のときのみ） */
export function withSelectionEndPoints(
  chartData: HistoryPoint[],
  selectionTime: number | null,
  deviceIds: readonly number[],
  metric: ChartMetric,
  includeOutdoor = false,
  targetDeviceIds?: readonly number[]
): HistoryPoint[] {
  if (!chartData.length || selectionTime == null) return chartData;

  const lastTime = chartData[chartData.length - 1].datetimeObj;
  if (selectionTime <= lastTime) return chartData;

  const row: HistoryPoint = { datetimeObj: selectionTime };
  const record = row as unknown as Record<string, unknown>;
  let hasAny = false;

  for (const deviceId of deviceIds) {
    const value = interpolateDeviceMetricAtTime(chartData, deviceId, metric, selectionTime);
    if (value != null) {
      record[deviceMetricKey(deviceId, metric)] = value;
      hasAny = true;
    }
  }

  if (includeOutdoor && metric !== "co2") {
    const outdoorValue = interpolateOutdoorMetricAtTime(chartData, metric, selectionTime);
    if (outdoorValue != null) {
      record[`outdoor_${metric}`] = outdoorValue;
      hasAny = true;
    }
  }

  if (metric === "temperature" && targetDeviceIds?.length) {
    for (const deviceId of targetDeviceIds) {
      const value = getDeviceTargetMetricValueAtTime(chartData, deviceId, selectionTime);
      if (value != null) {
        record[deviceTargetMetricKey(deviceId)] = value;
        hasAny = true;
      }
    }
  }

  if (!hasAny) return chartData;
  return [...chartData, row];
}

export function hasDeviceMetricData(
  historyData: HistoryPoint[],
  deviceId: number,
  metric: ChartMetric
): boolean {
  const key = deviceMetricKey(deviceId, metric);
  return historyData.some((point) => {
    const value = (point as unknown as Record<string, unknown>)[key];
    return typeof value === "number" && !Number.isNaN(value);
  });
}

export function hasDeviceTargetMetricData(
  historyData: HistoryPoint[],
  deviceId: number
): boolean {
  const key = deviceTargetMetricKey(deviceId);
  return historyData.some((point) => {
    const value = (point as unknown as Record<string, unknown>)[key];
    return typeof value === "number" && !Number.isNaN(value);
  });
}

export function hasOutdoorMetricData(
  historyData: HistoryPoint[],
  metric: ChartMetric
): boolean {
  if (metric === "co2") return false;
  const key = `outdoor_${metric}` as keyof HistoryPoint;
  return historyData.some((point) => {
    const value = point[key];
    return typeof value === "number" && !Number.isNaN(value);
  });
}

export function getDevicesWithMetricData(
  historyData: HistoryPoint[],
  deviceIds: readonly number[],
  metric: ChartMetric
): number[] {
  return deviceIds.filter((deviceId) =>
    hasDeviceMetricData(historyData, deviceId, metric)
  );
}

export function getAvailableChartMetrics(
  historyData: HistoryPoint[],
  deviceIds: readonly number[]
): ChartMetric[] {
  return CHART_METRICS.filter(
    (metric) =>
      getDevicesWithMetricData(historyData, deviceIds, metric).length > 0 ||
      hasOutdoorMetricData(historyData, metric)
  );
}

export function findActivePoint(
  historyData: HistoryPoint[],
  domain: ChartDomain | ["dataMin", "dataMax"]
): HistoryPoint | null {
  const candidates = filterHistoryForDomain(historyData, domain, 0.15);
  if (!candidates.length) return null;

  let minT: number;
  let maxT: number;

  if (domain[0] === "dataMin") {
    minT = historyData[0].datetimeObj;
    maxT = historyData[historyData.length - 1].datetimeObj;
  } else {
    [minT, maxT] = domain;
  }

  const targetTime = maxT - (maxT - minT) * 0.1;

  return candidates.reduce((prev, curr) =>
    Math.abs(curr.datetimeObj - targetTime) < Math.abs(prev.datetimeObj - targetTime)
      ? curr
      : prev
  );
}

/** 右側カーソル（表示域の90%位置）の時刻 */
export function getSelectionTime(
  historyData: HistoryPoint[],
  domain: ChartDomain | ["dataMin", "dataMax"]
): number | null {
  if (!historyData.length || domain[0] === "dataMin") return null;

  const [minT, maxT] = domain;
  return minT + (maxT - minT) * SELECTION_TIME_RATIO;
}

function findPrevNextDeviceValues(
  historyData: HistoryPoint[],
  deviceId: number,
  metric: ChartMetric,
  targetTime: number
): {
  prev?: { t: number; v: number };
  next?: { t: number; v: number };
} {
  let prev: { t: number; v: number } | undefined;
  let next: { t: number; v: number } | undefined;

  for (const point of historyData) {
    const value = getDeviceMetricValue(point, deviceId, metric);
    if (value == null) continue;

    if (point.datetimeObj <= targetTime) {
      prev = { t: point.datetimeObj, v: value };
      continue;
    }

    if (!next) {
      next = { t: point.datetimeObj, v: value };
      break;
    }
  }

  return { prev, next };
}

function interpolateBetween(
  prev: { t: number; v: number },
  next: { t: number; v: number },
  targetTime: number
): number {
  if (prev.t === next.t) return prev.v;
  const ratio = (targetTime - prev.t) / (next.t - prev.t);
  return prev.v + (next.v - prev.v) * ratio;
}

/** 指定時刻のデバイス指標値（線形補間。開始前は undefined、終了後は直前の値） */
export function interpolateDeviceMetricAtTime(
  historyData: HistoryPoint[],
  deviceId: number,
  metric: ChartMetric,
  targetTime: number
): number | undefined {
  const { prev, next } = findPrevNextDeviceValues(
    historyData,
    deviceId,
    metric,
    targetTime
  );

  if (prev && next) {
    if (targetTime === prev.t) return prev.v;
    if (targetTime === next.t) return next.v;
    if (targetTime > prev.t && targetTime < next.t) {
      return interpolateBetween(prev, next, targetTime);
    }
  }

  if (prev) return prev.v;
  return undefined;
}

/** @deprecated alias */
export function getDeviceMetricValueAtTime(
  historyData: HistoryPoint[],
  deviceId: number,
  metric: ChartMetric,
  targetTime: number
): number | undefined {
  return interpolateDeviceMetricAtTime(historyData, deviceId, metric, targetTime);
}

function findPrevNextTargetValues(
  historyData: HistoryPoint[],
  deviceId: number,
  targetTime: number
): {
  prev?: { t: number; v: number };
  next?: { t: number; v: number };
} {
  let prev: { t: number; v: number } | undefined;
  let next: { t: number; v: number } | undefined;
  const powerKey = deviceAirconPowerKey(deviceId);

  for (const point of historyData) {
    const record = point as unknown as Record<string, unknown>;
    if (isAirconPowerOff(record[powerKey])) continue;

    const value = getDeviceTargetMetricValue(point, deviceId);
    if (value == null) continue;

    if (point.datetimeObj <= targetTime) {
      prev = { t: point.datetimeObj, v: value };
      continue;
    }
    next = { t: point.datetimeObj, v: value };
    break;
  }

  return { prev, next };
}

function hasAirconOffBetween(
  historyData: HistoryPoint[],
  deviceId: number,
  startTime: number,
  endTime: number
): boolean {
  const powerKey = deviceAirconPowerKey(deviceId);

  for (const point of historyData) {
    if (point.datetimeObj <= startTime) continue;
    if (point.datetimeObj >= endTime) break;
    const power = (point as unknown as Record<string, unknown>)[powerKey];
    if (isAirconPowerOff(power)) return true;
  }

  return false;
}

function getAirconPowerAtTime(
  historyData: HistoryPoint[],
  deviceId: number,
  targetTime: number
): string | undefined {
  const powerKey = deviceAirconPowerKey(deviceId);
  let lastPower: string | undefined;

  for (const point of historyData) {
    if (point.datetimeObj > targetTime) break;
    const power = (point as unknown as Record<string, unknown>)[powerKey];
    if (typeof power === "string") {
      lastPower = power;
    }
  }

  return lastPower;
}

export function isAirconOffAtTime(
  historyData: HistoryPoint[],
  deviceId: number,
  targetTime: number
): boolean {
  return isAirconPowerOff(getAirconPowerAtTime(historyData, deviceId, targetTime));
}

export function getDeviceTargetMetricValueAtTime(
  historyData: HistoryPoint[],
  deviceId: number,
  targetTime: number
): number | undefined {
  if (isAirconOffAtTime(historyData, deviceId, targetTime)) {
    return undefined;
  }

  for (const point of historyData) {
    if (point.datetimeObj !== targetTime) continue;
    return getDeviceTargetMetricValue(point, deviceId);
  }

  const { prev, next } = findPrevNextTargetValues(historyData, deviceId, targetTime);

  if (prev && next) {
    if (hasAirconOffBetween(historyData, deviceId, prev.t, next.t)) {
      return undefined;
    }
    if (targetTime === prev.t) return prev.v;
    if (targetTime === next.t) return next.v;
    if (targetTime > prev.t && targetTime < next.t) {
      return interpolateBetween(prev, next, targetTime);
    }
  }

  if (prev && !hasAirconOffBetween(historyData, deviceId, prev.t, targetTime)) {
    return prev.v;
  }
  return undefined;
}

/** 指定時刻の屋外指標値（線形補間。データがなければ直前の値） */
export function interpolateOutdoorMetricAtTime(
  historyData: HistoryPoint[],
  metric: ChartMetric,
  targetTime: number
): number | undefined {
  if (metric === "co2") return undefined;

  const key = `outdoor_${metric}` as keyof HistoryPoint;
  let prev: { t: number; v: number } | undefined;
  let next: { t: number; v: number } | undefined;

  for (const point of historyData) {
    const value = point[key];
    if (typeof value !== "number" || Number.isNaN(value)) continue;

    if (point.datetimeObj <= targetTime) {
      prev = { t: point.datetimeObj, v: value };
      continue;
    }

    if (!next) {
      next = { t: point.datetimeObj, v: value };
      break;
    }
  }

  if (prev && next) {
    if (targetTime === prev.t) return prev.v;
    if (targetTime === next.t) return next.v;
    if (targetTime > prev.t && targetTime < next.t) {
      return interpolateBetween(prev, next, targetTime);
    }
  }

  if (prev) return prev.v;
  return undefined;
}

/** @deprecated alias */
export function getOutdoorMetricValueAtTime(
  historyData: HistoryPoint[],
  metric: ChartMetric,
  targetTime: number
): number | undefined {
  return interpolateOutdoorMetricAtTime(historyData, metric, targetTime);
}

export function clampDomainOffset(
  historyData: HistoryPoint[],
  viewRange: ChartViewRange,
  domainOffset: number,
  timeShift: number,
  options?: { allowPastExtension?: boolean; noMoreOlderData?: boolean }
): number {
  if (!historyData.length) return 0;

  const dataMaxTime = historyData[historyData.length - 1].datetimeObj;
  let newOffset = domainOffset + timeShift;
  const maxPositiveOffset = getMaxPositiveDomainOffset(viewRange);

  if (newOffset > maxPositiveOffset) newOffset = maxPositiveOffset;

  if (!options?.allowPastExtension || options?.noMoreOlderData) {
    const dataMinTime = historyData[0].datetimeObj;
    const minOffset = dataMinTime - dataMaxTime;
    if (minOffset >= 0) return 0;
    if (newOffset < minOffset) return minOffset;
  }

  return newOffset;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatChartAxisDate(timestamp: number, viewRange: ChartViewRange): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  if (viewRange === "year") {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatActivePointLabel(timestamp: number, viewRange: ChartViewRange): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  if (viewRange === "year") {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function getChartTicksForDomain(
  minT: number,
  maxT: number,
  viewRange: ChartViewRange
): number[] {
  const ticks: number[] = [];
  const startDate = new Date(minT);
  const startDay = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  ).getTime();

  if (viewRange === "day") {
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const base = startDay + dayOffset * 86400000;
      [0, 6, 12, 18].forEach((h) => {
        const t = base + h * 3600000;
        if (t >= minT && t <= maxT) ticks.push(t);
      });
    }
  } else if (viewRange === "week") {
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const t = startDay + dayOffset * 86400000;
      if (t >= minT && t <= maxT) ticks.push(t);
    }
  } else if (viewRange === "month") {
    const current = new Date(startDay);
    current.setDate(1);
    for (let i = 0; i < 60; i++) {
      [1, 11, 21].forEach((day) => {
        const t = new Date(current.getFullYear(), current.getMonth(), day).getTime();
        if (t >= minT && t <= maxT) ticks.push(t);
      });
      current.setMonth(current.getMonth() + 1);
      if (current.getTime() > maxT) break;
    }
  } else {
    const current = new Date(startDate.getFullYear(), 0, 1);
    for (let i = 0; i < 20; i++) {
      [0, 3, 6, 9].forEach((monthOffset) => {
        const t = new Date(current.getFullYear(), monthOffset, 1).getTime();
        if (t >= minT && t <= maxT) ticks.push(t);
      });
      current.setFullYear(current.getFullYear() + 1);
      if (current.getTime() > maxT) break;
    }
  }

  return [...new Set(ticks)].sort((a, b) => a - b);
}

function collectNumericValues(values: number[], raw: unknown) {
  if (typeof raw === "number" && !Number.isNaN(raw)) values.push(raw);
}

export function computeVisibleYDomain(
  historyData: HistoryPoint[],
  domain: ChartDomain | ["dataMin", "dataMax"],
  metric: ChartMetric,
  aggregated: boolean,
  deviceIds?: readonly number[],
  includeOutdoor = false,
  targetDeviceIds?: readonly number[]
): [number, number] | ["auto", "auto"] {
  if (!historyData.length) return ["auto", "auto"];

  const dataMaxTime = historyData[historyData.length - 1].datetimeObj;
  let minT: number;
  let maxT: number;

  if (domain[0] === "dataMin") {
    minT = historyData[0].datetimeObj;
    maxT = dataMaxTime;
  } else {
    minT = domain[0];
    maxT = Math.min(domain[1], dataMaxTime);
  }

  const visiblePoints = historyData.filter(
    (p) => p.datetimeObj >= minT && p.datetimeObj <= maxT
  );
  if (!visiblePoints.length) return ["auto", "auto"];

  const values: number[] = [];
  const outdoorKey = `outdoor_${metric}` as keyof HistoryPoint;
  const rangeKey = `${metric}Range` as keyof HistoryPoint;

  for (const point of visiblePoints) {
    if (deviceIds?.length) {
      for (const deviceId of deviceIds) {
        collectNumericValues(values, getDeviceMetricValue(point, deviceId, metric));
        if (aggregated) {
          const row = point as unknown as Record<string, unknown>;
          collectNumericValues(values, row[deviceMetricMinKey(deviceId, metric)]);
          collectNumericValues(values, row[deviceMetricMaxKey(deviceId, metric)]);
        }
      }
    } else {
      collectNumericValues(values, point[metric]);
      if (aggregated) {
        const maxKey = `${metric}_max` as keyof HistoryPoint;
        const minKey = `${metric}_min` as keyof HistoryPoint;
        collectNumericValues(values, point[maxKey]);
        collectNumericValues(values, point[minKey]);
      }
    }

    if (includeOutdoor) {
      collectNumericValues(values, point[outdoorKey]);
    }

    if (metric === "temperature" && targetDeviceIds?.length) {
      for (const deviceId of targetDeviceIds) {
        collectNumericValues(values, getDeviceTargetMetricValue(point, deviceId));
      }
    }

    const range = point[rangeKey];
    if (Array.isArray(range) && range.length === 2) {
      collectNumericValues(values, range[0]);
      collectNumericValues(values, range[1]);
    }
  }

  if (!values.length) return ["auto", "auto"];

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  if (minValue === maxValue) {
    const pad =
      metric === "pressure"
        ? Math.max(Math.abs(minValue) * 0.05, 5)
        : metric === "co2"
          ? Math.max(Math.abs(minValue) * 0.05, 30)
          : Math.max(Math.abs(minValue) * 0.1, 1);
    return [minValue - pad, maxValue + pad];
  }

  const span = maxValue - minValue;
  const pad =
    metric === "pressure"
      ? Math.max(span * 0.08, 3)
      : metric === "co2"
        ? Math.max(span * 0.08, 20)
        : Math.max(span * 0.1, 0.5);

  return [minValue - pad, maxValue + pad];
}

export function processHistoryData(raw: Record<string, unknown>[]): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];

  const processed = raw
    .map((item) => ({
      ...item,
      datetimeObj: item.datetime ? new Date(String(item.datetime)).getTime() : 0,
      temperature:
        item.temperature != null && item.temperature !== ""
          ? Number(item.temperature)
          : undefined,
      humidity:
        item.humidity != null && item.humidity !== ""
          ? Number(item.humidity)
          : undefined,
      pressure:
        item.pressure != null && item.pressure !== ""
          ? Math.round(Number(item.pressure))
          : undefined,
      co2: item.co2 != null ? Math.round(Number(item.co2)) : undefined,
      outdoor_temperature:
        item.outdoor_temperature != null && item.outdoor_temperature !== ""
          ? Number(item.outdoor_temperature)
          : undefined,
      outdoor_humidity:
        item.outdoor_humidity != null && item.outdoor_humidity !== ""
          ? Number(item.outdoor_humidity)
          : undefined,
      outdoor_pressure:
        item.outdoor_pressure != null && item.outdoor_pressure !== ""
          ? Math.round(Number(item.outdoor_pressure))
          : undefined,
      temperatureRange:
        item.temperature_min !== undefined && item.temperature_max !== undefined
          ? [Number(item.temperature_min), Number(item.temperature_max)]
          : null,
      humidityRange:
        item.humidity_min !== undefined && item.humidity_max !== undefined
          ? [Number(item.humidity_min), Number(item.humidity_max)]
          : null,
      pressureRange:
        item.pressure_min !== undefined && item.pressure_max !== undefined
          ? [Math.round(Number(item.pressure_min)), Math.round(Number(item.pressure_max))]
          : null,
      co2Range:
        item.co2_min !== undefined && item.co2_max !== undefined
          ? [Math.round(Number(item.co2_min)), Math.round(Number(item.co2_max))]
          : null,
    }))
    .filter((item) => item.datetimeObj > 0) as HistoryPoint[];

  return processed.sort((a, b) => a.datetimeObj - b.datetimeObj);
}

export function processAirconHistoryData(
  raw: Record<string, unknown>[]
): import("@/lib/history-loader").AirconHistoryPoint[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => ({
      datetime: item.datetime != null ? String(item.datetime) : undefined,
      datetimeObj: item.datetime ? new Date(String(item.datetime)).getTime() : 0,
      temperature:
        item.temperature != null && item.temperature !== ""
          ? Number(item.temperature)
          : undefined,
      target_temperature:
        item.target_temperature != null && item.target_temperature !== ""
          ? Number(item.target_temperature)
          : undefined,
      power: item.power != null ? String(item.power) : undefined,
    }))
    .filter((item) => item.datetimeObj > 0)
    .sort((a, b) => a.datetimeObj - b.datetimeObj);
}

function getEffectiveLogic(timeRange: TimeRange, start: number, end: number): string {
  if (timeRange !== "custom") return timeRange;
  const durationDays = (end - start) / 86400000;
  if (durationDays <= 2.1) return "day";
  if (durationDays <= 14) return "week";
  if (durationDays <= 65) return "month";
  if (durationDays <= 200) return "month_starts";
  return "year";
}

export function getChartTicks(
  historyData: HistoryPoint[],
  timeRange: TimeRange
): number[] | undefined {
  if (
    timeRange !== "day" &&
    timeRange !== "week" &&
    timeRange !== "month" &&
    timeRange !== "year" &&
    timeRange !== "custom"
  ) {
    return undefined;
  }

  const start = historyData[0]?.datetimeObj;
  const end = historyData[historyData.length - 1]?.datetimeObj;
  if (!start || !end) return undefined;

  const ticks: number[] = [];
  const startDate = new Date(start);
  const startDay = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  ).getTime();
  const effectiveLogic = getEffectiveLogic(timeRange, start, end);

  if (effectiveLogic === "day") {
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const base = startDay + dayOffset * 86400000;
      [0, 6, 12, 18].forEach((h) => {
        const t = base + h * 3600000;
        if (t >= start && t <= end) ticks.push(t);
      });
    }
  } else if (effectiveLogic === "week") {
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const t = startDay + dayOffset * 86400000;
      if (t >= start && t <= end) ticks.push(t);
    }
  } else if (effectiveLogic === "month") {
    const current = new Date(startDay);
    current.setDate(1);
    for (let i = 0; i < 60; i++) {
      [1, 11, 21].forEach((day) => {
        const t = new Date(current.getFullYear(), current.getMonth(), day).getTime();
        if (t >= start && t <= end) ticks.push(t);
      });
      current.setMonth(current.getMonth() + 1);
      if (current.getTime() > end) break;
    }
  } else if (effectiveLogic === "month_starts") {
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      const t = current.getTime();
      if (t >= start && t <= end) ticks.push(t);
      current.setMonth(current.getMonth() + 1);
      if (current.getTime() > end) break;
    }
  } else if (effectiveLogic === "year") {
    const current = new Date(startDate.getFullYear(), 0, 1);
    for (let i = 0; i < 20; i++) {
      [0, 3, 6, 9].forEach((monthOffset) => {
        const t = new Date(current.getFullYear(), monthOffset, 1).getTime();
        if (t >= start && t <= end) ticks.push(t);
      });
      current.setFullYear(current.getFullYear() + 1);
      if (current.getTime() > end) break;
    }
  }

  return [...new Set(ticks)].sort((a, b) => a - b);
}

export function isAggregatedRange(viewRange: ChartViewRange): boolean {
  return viewRange === "year";
}

export function calcDiscomfortIndex(temperature: number, humidity: number): number {
  return 0.81 * temperature + 0.01 * humidity * (0.99 * temperature - 14.3) + 46.3;
}

export function getComfortAdvice(temperature: number, humidity: number) {
  const di = calcDiscomfortIndex(temperature, humidity);
  let mainAdvice = "とても快適な環境です 🙂";
  let subAdvice = "";

  if (di < 55) mainAdvice = "寒いですね。暖房の使用を検討してください 🧣";
  else if (di < 60) mainAdvice = "少し肌寒いです。羽織るものがあると良さそうです 🧥";
  else if (di < 70) mainAdvice = "ちょうど良い、快適な状態です ✨";
  else if (di < 75) mainAdvice = "少し暖かくなってきましたね 🙂";
  else if (di < 80) mainAdvice = "やや蒸し暑いです。風通しを良くしてください 🎐";
  else mainAdvice = "かなり暑いです！熱中症に気をつけてください ⚠️";

  if (humidity < 40) subAdvice = "空気が乾燥しています。加湿を検討してください 💧";
  else if (humidity > 65) subAdvice = "湿気が多いです。除湿や換気がオススメです ☂️";

  return { di, mainAdvice, subAdvice };
}
