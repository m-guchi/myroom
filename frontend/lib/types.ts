export type TimeRange = "day" | "week" | "month" | "year" | "custom";

/** グラフの表示幅（横スクロールのウィンドウサイズ） */
export type ChartViewRange = "day" | "week" | "month" | "year";

export type ChartMetric = "temperature" | "humidity" | "pressure" | "co2";

export interface LatestData {
  device_id?: number;
  datetime?: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  co2?: number;
  outdoor_temperature?: number;
  outdoor_humidity?: number;
  outdoor_pressure?: number;
}

export interface SensorRecord {
  datetime: string;
  device_id: number;
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  co2?: number | null;
}

export interface SensorRecordsResponse {
  records: SensorRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface HistoryPoint {
  datetime?: string;
  datetimeObj: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  co2?: number;
  outdoor_temperature?: number;
  outdoor_humidity?: number;
  outdoor_pressure?: number;
  temperatureRange?: [number, number] | null;
  humidityRange?: [number, number] | null;
  pressureRange?: [number, number] | null;
  co2Range?: [number, number] | null;
  temperature_min?: number;
  temperature_max?: number;
  humidity_min?: number;
  humidity_max?: number;
  pressure_min?: number;
  pressure_max?: number;
  co2_min?: number;
  co2_max?: number;
}

export interface DailyStat {
  date: string;
  temp_min?: number;
  temp_max?: number;
  humid_min?: number;
  humid_max?: number;
  pressure_min?: number;
  pressure_max?: number;
  co2_min?: number;
  co2_max?: number;
}

export interface OutdoorLocation {
  latitude: number;
  longitude: number;
  name: string;
}

export interface DeviceInfo {
  id: number;
  name: string;
}

export interface AirconUnitInfo {
  ac_id: number;
  name: string;
}

export interface AirconData {
  ac_id?: number;
  datetime?: string;
  name?: string;
  source_name?: string;
  room_temperature?: number;
  target_temperature?: number;
  humidity?: number;
  mode?: string;
  power?: string;
  fan_speed?: string;
  fan_swing?: string;
  online?: boolean;
  model?: string;
}

export const AIRCON_MODE_LABELS: Record<string, string> = {
  HEATING: "暖房",
  COOLING: "冷房",
  FAN: "送風",
  DRY: "除湿",
  DRY_COOL: "除湿冷房",
  AUTO: "自動",
  UNKNOWN: "--",
};

export function formatAirconMode(mode?: string | null): string {
  if (!mode) return "--";
  return AIRCON_MODE_LABELS[mode] ?? mode;
}

export function hasAirconData(data: AirconData | null | undefined): boolean {
  if (!data) return false;
  return (
    data.room_temperature != null ||
    data.target_temperature != null ||
    data.power != null ||
    data.mode != null
  );
}

/** グラフ・日次記録に使うデバイス */
export const PRIMARY_SENSOR_DEVICE_ID = 1;

/** ダッシュボードカードに表示する屋内デバイス */
export const DASHBOARD_SENSOR_DEVICE_IDS = [1, 2] as const;

/** グラフ上のエアコン（室温）用デバイスID */
export const AIRCON_CHART_DEVICE_ID = 3;

export const CHART_METRICS: ChartMetric[] = ["temperature", "humidity", "pressure", "co2"];

export function deviceMetricKey(deviceId: number, metric: ChartMetric): string {
  return `d${deviceId}_${metric}`;
}

export function deviceMetricMinKey(deviceId: number, metric: ChartMetric): string {
  return `d${deviceId}_${metric}_min`;
}

export function deviceMetricMaxKey(deviceId: number, metric: ChartMetric): string {
  return `d${deviceId}_${metric}_max`;
}

export function deviceTargetMetricKey(deviceId: number): string {
  return `d${deviceId}_target_temperature`;
}

export function deviceAirconPowerKey(deviceId: number): string {
  return `d${deviceId}_aircon_power`;
}

export function getDeviceMetricValue(
  point: HistoryPoint,
  deviceId: number,
  metric: ChartMetric
): number | undefined {
  const key = deviceMetricKey(deviceId, metric);
  const row = point as unknown as Record<string, unknown>;
  if (key in row) {
    const value = row[key];
    return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
  }
  if (deviceId === PRIMARY_SENSOR_DEVICE_ID) {
    const legacy = point[metric as keyof HistoryPoint];
    return typeof legacy === "number" && !Number.isNaN(legacy) ? legacy : undefined;
  }
  return undefined;
}

export function getDeviceTargetMetricValue(
  point: HistoryPoint,
  deviceId: number
): number | undefined {
  const key = deviceTargetMetricKey(deviceId);
  const row = point as unknown as Record<string, unknown>;
  const value = row[key];
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function isAirconPowerOff(power: unknown): boolean {
  return typeof power === "string" && power.toUpperCase() === "OFF";
}

/** Recharts 用の設定温度系列キー */
export const AIRCON_TARGET_CHART_KEY = "airconTarget";

/** グラフのデバイスライン色（指標に関係なくデバイス固定） */
export const DEVICE_LINE_COLORS: Record<number, string> = {
  1: "#3498db",
  2: "#e67e22",
  3: "#1abc9c",
};

/** エアコン設定温度ライン（室温とは別色） */
export const AIRCON_TARGET_LINE_COLORS = {
  light: "#9333ea",
  dark: "#e879f9",
} as const;

export function getDeviceLineColor(deviceId: number): string {
  return DEVICE_LINE_COLORS[deviceId] ?? "#95a5a6";
}

export function getAirconTargetLineColor(theme: "light" | "dark" = "light"): string {
  return AIRCON_TARGET_LINE_COLORS[theme];
}

export interface OutdoorLocationSearchResult {
  name: string;
  label: string;
  latitude: number;
  longitude: number;
}

export const METRIC_COLORS: Record<ChartMetric, string> = {
  temperature: "#3498db",
  humidity: "#2ecc71",
  pressure: "#9b59b6",
  co2: "#e67e22",
};

export const METRIC_LABELS: Record<ChartMetric, string> = {
  temperature: "温度",
  humidity: "湿度",
  pressure: "気圧",
  co2: "CO2",
};

export const METRIC_UNITS: Record<ChartMetric, string> = {
  temperature: "°C",
  humidity: "%",
  pressure: "hPa",
  co2: "ppm",
};

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  day: "1D",
  week: "1W",
  month: "1M",
  year: "1Y",
  custom: "全期間",
};

export const CHART_VIEW_RANGE_LABELS: Record<ChartViewRange, string> = {
  day: "日",
  week: "週",
  month: "月",
  year: "年",
};
