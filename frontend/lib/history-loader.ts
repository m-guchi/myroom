import type { ChartViewRange, HistoryPoint } from "@/lib/types";
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
  for (const point of incoming) byTime.set(point.datetimeObj, point);

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
