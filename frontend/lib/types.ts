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

export interface HistoryPoint {
  datetime?: string;
  datetimeObj: number;
  temperature: number;
  humidity: number;
  pressure: number;
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

/** グラフ・日次記録に使うデバイス */
export const PRIMARY_SENSOR_DEVICE_ID = 1;

/** ダッシュボードカードに表示する屋内デバイス */
export const DASHBOARD_SENSOR_DEVICE_IDS = [1, 2] as const;

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
