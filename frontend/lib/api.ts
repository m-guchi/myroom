import {
  DASHBOARD_SENSOR_DEVICE_IDS,
  PRIMARY_SENSOR_DEVICE_ID,
  type DailyStat,
  type DeviceInfo,
  type HistoryPoint,
  type LatestData,
  type OutdoorLocation,
  type OutdoorLocationSearchResult,
  type TimeRange,
  type ChartViewRange,
} from "@/lib/types";
import { processHistoryData } from "@/lib/chart-utils";
import { toApiDateTime } from "@/lib/history-loader";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchLatest(deviceId = PRIMARY_SENSOR_DEVICE_ID): Promise<LatestData> {
  return fetchJson<LatestData>(`/api/latest?device=${deviceId}`);
}

export async function fetchHistory(
  timeRange: TimeRange,
  customStartDate: string,
  customEndDate: string,
  deviceId = PRIMARY_SENSOR_DEVICE_ID
): Promise<HistoryPoint[]> {
  let url = `/api/history?range=${timeRange}&device=${deviceId}`;
  if (timeRange === "custom") {
    url = `/api/history?start=${customStartDate}&end=${customEndDate}&device=${deviceId}`;
  }
  const data = await fetchJson<Record<string, unknown>[]>(url);
  return processHistoryData(data);
}

export async function fetchHistoryWindow(
  start: Date,
  end: Date,
  viewRange: ChartViewRange,
  deviceId = PRIMARY_SENSOR_DEVICE_ID
): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({
    start: toApiDateTime(start),
    end: toApiDateTime(end),
    device: String(deviceId),
  });
  if (viewRange === "year") {
    params.set("range", "year");
  }
  const data = await fetchJson<Record<string, unknown>[]>(
    `/api/history?${params.toString()}`
  );
  return processHistoryData(data);
}

export async function fetchDailyStats(
  deviceId = PRIMARY_SENSOR_DEVICE_ID
): Promise<DailyStat[]> {
  return fetchJson<DailyStat[]>(`/api/daily-stats?device=${deviceId}`);
}

export async function fetchDevices(): Promise<DeviceInfo[]> {
  const data = await fetchJson<{ devices: DeviceInfo[] }>("/api/devices");
  return data.devices;
}

export async function updateDeviceName(
  deviceId: number,
  name: string
): Promise<DeviceInfo> {
  const res = await fetch(`/api/devices/${deviceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<DeviceInfo>;
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

export async function fetchLatestBatch(
  deviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): Promise<Record<number, LatestData | null>> {
  const results = await Promise.allSettled(
    deviceIds.map((deviceId) => fetchLatest(deviceId))
  );

  const latestByDevice: Record<number, LatestData | null> = {};
  deviceIds.forEach((deviceId, index) => {
    const result = results[index];
    latestByDevice[deviceId] =
      result.status === "fulfilled" ? result.value : null;
  });
  return latestByDevice;
}

export async function fetchDashboardData(deviceId = PRIMARY_SENSOR_DEVICE_ID) {
  const [latestByDevice, dailyStats] = await Promise.allSettled([
    fetchLatestBatch(DASHBOARD_SENSOR_DEVICE_IDS),
    fetchDailyStats(deviceId),
  ]);

  return {
    latestByDevice:
      latestByDevice.status === "fulfilled" ? latestByDevice.value : {},
    latest:
      latestByDevice.status === "fulfilled"
        ? latestByDevice.value[PRIMARY_SENSOR_DEVICE_ID] ?? null
        : null,
    dailyStats: dailyStats.status === "fulfilled" ? dailyStats.value : [],
  };
}
