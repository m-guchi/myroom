import type { ChartMetric, ChartViewRange, HistoryPoint, TimeRange } from "@/lib/types";

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

export function computeChartDomain(
  historyData: HistoryPoint[],
  viewRange: ChartViewRange,
  domainOffset: number
): ChartDomain | ["dataMin", "dataMax"] {
  if (!historyData.length) return ["dataMin", "dataMax"];

  const dataMinTime = historyData[0].datetimeObj;
  const dataMaxTime = historyData[historyData.length - 1].datetimeObj;
  const windowMs = getViewRangeMs(viewRange);
  const rightPadding = windowMs * 0.1;
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
  maxPoints = 320
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
    for (let j = from + 1; j < to; j++) {
      const point = historyData[j];
      const value = point[metric];
      if (typeof value !== "number") continue;
      const minVal = minPoint[metric];
      const maxVal = maxPoint[metric];
      if (typeof minVal !== "number" || value < minVal) minPoint = point;
      if (typeof maxVal !== "number" || value > maxVal) maxPoint = point;
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
  return maxT - (maxT - minT) * 0.1;
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

  if (newOffset > 0) newOffset = 0;

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
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
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
  aggregated: boolean
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
  const maxKey = `${metric}_max` as keyof HistoryPoint;
  const minKey = `${metric}_min` as keyof HistoryPoint;
  const rangeKey = `${metric}Range` as keyof HistoryPoint;

  for (const point of visiblePoints) {
    collectNumericValues(values, point[metric]);
    collectNumericValues(values, point[outdoorKey]);

    if (aggregated) {
      collectNumericValues(values, point[maxKey]);
      collectNumericValues(values, point[minKey]);
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
        : Math.max(Math.abs(minValue) * 0.1, 1);
    return [minValue - pad, maxValue + pad];
  }

  const span = maxValue - minValue;
  const pad =
    metric === "pressure"
      ? Math.max(span * 0.08, 3)
      : Math.max(span * 0.1, 0.5);

  return [minValue - pad, maxValue + pad];
}

export function processHistoryData(raw: Record<string, unknown>[]): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];

  const processed = raw
    .map((item) => ({
      ...item,
      datetimeObj: item.datetime ? new Date(String(item.datetime)).getTime() : 0,
      temperature: Number(item.temperature) || 0,
      humidity: Number(item.humidity) || 0,
      pressure: item.pressure ? Math.round(Number(item.pressure)) : 0,
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
    }))
    .filter((item) => item.datetimeObj > 0) as HistoryPoint[];

  return processed.sort((a, b) => a.datetimeObj - b.datetimeObj);
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
