import type {
  AnalysisData,
  DailyStat,
  HistoryPoint,
  LatestData,
  OutdoorLocation,
  OutdoorLocationSearchResult,
  TimeRange,
} from "@/lib/types";
import { processHistoryData } from "@/lib/chart-utils";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchLatest(): Promise<LatestData> {
  return fetchJson<LatestData>("/api/latest");
}

export async function fetchHistory(
  timeRange: TimeRange,
  customStartDate: string,
  customEndDate: string
): Promise<HistoryPoint[]> {
  let url = `/api/history?range=${timeRange}`;
  if (timeRange === "custom") {
    url = `/api/history?start=${customStartDate}&end=${customEndDate}`;
  }
  const data = await fetchJson<Record<string, unknown>[]>(url);
  return processHistoryData(data);
}

export async function fetchDailyStats(): Promise<DailyStat[]> {
  return fetchJson<DailyStat[]>("/api/daily-stats");
}

export async function fetchAnalysis(): Promise<AnalysisData> {
  return fetchJson<AnalysisData>("/api/analysis");
}

export async function fetchOutdoorLocation(): Promise<OutdoorLocation> {
  return fetchJson<OutdoorLocation>("/api/outdoor-location");
}

export async function updateOutdoorLocation(
  location: OutdoorLocation
): Promise<OutdoorLocation> {
  const res = await fetch("/api/outdoor-location", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<OutdoorLocation>;
}

export async function searchOutdoorLocations(
  query: string
): Promise<OutdoorLocationSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const data = await fetchJson<{ results: OutdoorLocationSearchResult[] }>(
    `/api/outdoor-location/search?${params}`
  );
  return data.results;
}

export async function fetchAllData(historyRange: TimeRange = "month") {
  const [latest, history, dailyStats, analysis] = await Promise.allSettled([
    fetchLatest(),
    fetchHistory(historyRange, "", ""),
    fetchDailyStats(),
    fetchAnalysis(),
  ]);

  return {
    latest: latest.status === "fulfilled" ? latest.value : null,
    history: history.status === "fulfilled" ? history.value : [],
    dailyStats: dailyStats.status === "fulfilled" ? dailyStats.value : [],
    analysis: analysis.status === "fulfilled" ? analysis.value : null,
  };
}
