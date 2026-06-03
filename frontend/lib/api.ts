import {
  AIRCON_CHART_DEVICE_ID,
  DASHBOARD_SENSOR_DEVICE_IDS,
  FALLBACK_SENSOR_DEVICE_IDS,
  PRIMARY_SENSOR_DEVICE_ID,
  hasAirconData,
  type AirconData,
  type AirconUnitInfo,
  type DailyStat,
  type DeviceInfo,
  type HistoryPoint,
  type LatestData,
  type OutdoorLocation,
  type OutdoorLocationSearchResult,
  type SensorRecordsResponse,
  type TimeRange,
  type ChartViewRange,
} from "@/lib/types";
import { processHistoryData, processAirconHistoryData } from "@/lib/chart-utils";
import { toApiDateTime, type AirconHistoryPoint } from "@/lib/history-loader";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchLatest(deviceId = PRIMARY_SENSOR_DEVICE_ID): Promise<LatestData> {
  return fetchJson<LatestData>(`/api/latest?device=${deviceId}`);
}

export async function fetchAirconLatest(acId?: number): Promise<AirconData | null> {
  const url =
    acId != null ? `/api/aircon/latest?ac_id=${acId}` : "/api/aircon/latest";
  const data = await fetchJson<AirconData>(url);
  return hasAirconData(data) ? data : null;
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

export async function fetchAirconHistoryWindow(
  start: Date,
  end: Date,
  viewRange: ChartViewRange,
  acId = 1
): Promise<AirconHistoryPoint[]> {
  const params = new URLSearchParams({
    start: toApiDateTime(start),
    end: toApiDateTime(end),
    ac_id: String(acId),
  });
  if (viewRange === "year") {
    params.set("range", "year");
  }
  const data = await fetchJson<Record<string, unknown>[]>(
    `/api/aircon/history?${params.toString()}`
  );
  return processAirconHistoryData(data);
}

export async function fetchDailyStats(
  deviceId = PRIMARY_SENSOR_DEVICE_ID
): Promise<DailyStat[]> {
  return fetchJson<DailyStat[]>(`/api/daily-stats?device=${deviceId}`);
}

export async function fetchDailyStatsBatch(
  deviceIds: readonly number[] = DASHBOARD_SENSOR_DEVICE_IDS
): Promise<Record<number, DailyStat[]>> {
  const results = await Promise.allSettled(
    deviceIds.map((deviceId) => fetchDailyStats(deviceId))
  );

  const dailyStatsByDevice: Record<number, DailyStat[]> = {};
  deviceIds.forEach((deviceId, index) => {
    const result = results[index];
    dailyStatsByDevice[deviceId] =
      result.status === "fulfilled" ? result.value : [];
  });
  return dailyStatsByDevice;
}

export async function fetchAirconDailyStats(acId = 1): Promise<DailyStat[]> {
  return fetchJson<DailyStat[]>(`/api/aircon/daily-stats?ac_id=${acId}`);
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

export async function fetchAirconUnits(): Promise<AirconUnitInfo[]> {
  const data = await fetchJson<{ units: AirconUnitInfo[] }>("/api/aircon/units");
  return data.units;
}

export async function updateAirconUnitName(
  acId: number,
  name: string
): Promise<AirconUnitInfo> {
  const res = await fetch(`/api/aircon/units/${acId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<AirconUnitInfo>;
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

export type SensorRecordsRange = "day" | "week" | "month";

function getSensorRecordsWindow(range: SensorRecordsRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  if (range === "day") {
    start.setDate(start.getDate() - 1);
  } else if (range === "week") {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(start.getDate() - 30);
  }
  return { start, end };
}

export async function fetchSensorRecords(
  deviceId: number,
  range: SensorRecordsRange,
  offset = 0,
  limit = 100
): Promise<SensorRecordsResponse> {
  const { start, end } = getSensorRecordsWindow(range);
  const params = new URLSearchParams({
    device: String(deviceId),
    start: toApiDateTime(start),
    end: toApiDateTime(end),
    limit: String(limit),
    offset: String(offset),
  });
  return fetchJson<SensorRecordsResponse>(`/api/records?${params.toString()}`);
}

export async function deleteSensorRecord(
  deviceId: number,
  datetime: string
): Promise<void> {
  const params = new URLSearchParams({
    device: String(deviceId),
    datetime,
  });
  const res = await fetch(`/api/records?${params.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || `Request failed: ${res.status}`);
  }
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

export async function fetchDashboardData(
  acId = 1,
  sensorDeviceIds: readonly number[] = FALLBACK_SENSOR_DEVICE_IDS
) {
  const [latestByDevice, dailyStatsByDevice, airconDailyStats, airconLatest] =
    await Promise.allSettled([
      fetchLatestBatch(sensorDeviceIds),
      fetchDailyStatsBatch(sensorDeviceIds),
      fetchAirconDailyStats(acId),
      fetchAirconLatest(acId),
    ]);

  const mergedDailyStats =
    dailyStatsByDevice.status === "fulfilled" ? { ...dailyStatsByDevice.value } : {};
  if (airconDailyStats.status === "fulfilled" && airconDailyStats.value.length > 0) {
    mergedDailyStats[AIRCON_CHART_DEVICE_ID] = airconDailyStats.value;
  }

  return {
    latestByDevice:
      latestByDevice.status === "fulfilled" ? latestByDevice.value : {},
    latest:
      latestByDevice.status === "fulfilled"
        ? latestByDevice.value[PRIMARY_SENSOR_DEVICE_ID] ?? null
        : null,
    dailyStatsByDevice: mergedDailyStats,
    airconLatest: airconLatest.status === "fulfilled" ? airconLatest.value : null,
  };
}
