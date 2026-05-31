"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  Droplets,
  Gauge,
  RefreshCw,
  Snowflake,
  Thermometer,
  Wind,
} from "lucide-react";
import { LoginScreen } from "@/components/login-screen";
import { EnvironmentChart } from "@/components/environment-chart";
import { DailyStatsList } from "@/components/daily-stats-list";
import { DeviceNameSettings } from "@/components/device-name-settings";
import { AirconNameSettings } from "@/components/aircon-name-settings";
import { OutdoorLocationSettings } from "@/components/outdoor-location-settings";
import { Button } from "@/components/ui/button";
import { fetchDashboardData, fetchDevices, fetchOutdoorLocation, fetchAirconUnits } from "@/lib/api";
import { useChartHistory } from "@/lib/use-chart-history";
import {
  AIRCON_CHART_DEVICE_ID,
  DASHBOARD_SENSOR_DEVICE_IDS,
  formatAirconMode,
  getDeviceLineColor,
  PRIMARY_SENSOR_DEVICE_ID,
  type AirconData,
  type AirconUnitInfo,
  type ChartMetric,
  type ChartViewRange,
  type DailyStat,
  type DeviceInfo,
  type LatestData,
  type OutdoorLocation,
} from "@/lib/types";

const AUTH_KEY = "app_auth";

interface DeviceMetric {
  key: string;
  icon?: React.ReactNode;
  value: React.ReactNode;
}

interface DeviceCardProps {
  title: string;
  metrics: DeviceMetric[];
  accentColor?: string;
  action?: React.ReactNode;
  onClick?: () => void;
}

function buildIndoorMetrics(
  data: LatestData | null | undefined,
  accentColor?: string
): DeviceMetric[] {
  if (!data) return [];

  const iconStyle = accentColor ? { color: accentColor } : undefined;
  const metrics: DeviceMetric[] = [];

  if (data.temperature != null) {
    metrics.push({
      key: "temperature",
      icon: (
        <Thermometer className="size-5" strokeWidth={1.75} style={iconStyle} />
      ),
      value: `${data.temperature.toFixed(1)}°C`,
    });
  }
  if (data.humidity != null) {
    metrics.push({
      key: "humidity",
      icon: <Droplets className="size-5" strokeWidth={1.75} style={iconStyle} />,
      value: `${data.humidity}%`,
    });
  }
  if (data.pressure != null) {
    metrics.push({
      key: "pressure",
      icon: <Gauge className="size-5" strokeWidth={1.75} style={iconStyle} />,
      value: `${Math.round(data.pressure)} hPa`,
    });
  }
  if (data.co2 != null) {
    metrics.push({
      key: "co2",
      icon: <Wind className="size-5" strokeWidth={1.75} style={iconStyle} />,
      value: `${data.co2} ppm`,
    });
  }

  return metrics;
}

function buildAirconMetrics(data: AirconData | null | undefined): DeviceMetric[] {
  if (!data) return [];

  const metrics: DeviceMetric[] = [];
  const accentColor = "#1abc9c";

  if (data.room_temperature != null) {
    metrics.push({
      key: "room_temperature",
      icon: <Thermometer className="size-5" strokeWidth={1.75} style={{ color: accentColor }} />,
      value: `${data.room_temperature.toFixed(1)}°C`,
    });
  }
  if (data.target_temperature != null || data.mode || data.power) {
    const modeLabel = data.power === "OFF" ? "停止" : formatAirconMode(data.mode);
    const value =
      data.power !== "OFF" && data.target_temperature != null
        ? `${modeLabel} ${data.target_temperature.toFixed(1)}°C`
        : modeLabel;
    metrics.push({
      key: "mode_target",
      icon: <Snowflake className="size-5" strokeWidth={1.75} style={{ color: accentColor }} />,
      value,
    });
  }

  return metrics;
}

function buildOutdoorMetrics(data: LatestData | null | undefined): DeviceMetric[] {
  if (!data) return [];

  const metrics: DeviceMetric[] = [];

  if (data.outdoor_temperature != null) {
    metrics.push({
      key: "outdoor_temperature",
      icon: <Thermometer className="size-5 text-[#f1c40f]" strokeWidth={1.75} />,
      value: `${data.outdoor_temperature.toFixed(1)}°C`,
    });
  }
  if (data.outdoor_humidity != null) {
    metrics.push({
      key: "outdoor_humidity",
      icon: <Droplets className="size-5 text-[#56ccf2]" strokeWidth={1.75} />,
      value: `${data.outdoor_humidity}%`,
    });
  }
  if (data.outdoor_pressure != null) {
    metrics.push({
      key: "outdoor_pressure",
      icon: <Gauge className="size-5 text-[#bb86fc]" strokeWidth={1.75} />,
      value: `${Math.round(data.outdoor_pressure)} hPa`,
    });
  }

  return metrics;
}

function DeviceCard({ title, metrics, accentColor, action, onClick }: DeviceCardProps) {
  const className = onClick
    ? "device-card cursor-pointer text-left transition-transform active:scale-[0.98]"
    : "device-card text-left";
  const cardStyle = accentColor
    ? ({ borderLeft: `4px solid ${accentColor}` } satisfies CSSProperties)
    : undefined;
  const content = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <p
          className="device-card-title min-w-0 flex-1"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {title}
        </p>
        {action}
      </div>
      {metrics.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-center gap-2">
              {metric.icon}
              <span className="text-lg font-bold leading-none text-foreground">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">データがありません</p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={cardStyle}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={cardStyle}>
      {content}
    </div>
  );
}

export function MyRoomDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [latestByDevice, setLatestByDevice] = useState<Record<number, LatestData | null>>(
    {}
  );
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("temperature");
  const [viewRange, setViewRange] = useState<ChartViewRange>("day");
  const [dailyLimit, setDailyLimit] = useState(7);
  const [outdoorLocation, setOutdoorLocation] = useState<OutdoorLocation | null>(null);
  const [outdoorSettingsOpen, setOutdoorSettingsOpen] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [deviceSettingsId, setDeviceSettingsId] = useState(PRIMARY_SENSOR_DEVICE_ID);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [airconLatest, setAirconLatest] = useState<AirconData | null>(null);
  const [airconUnits, setAirconUnits] = useState<AirconUnitInfo[]>([]);
  const [airconSettingsOpen, setAirconSettingsOpen] = useState(false);
  const [airconSettingsId, setAirconSettingsId] = useState(1);

  const activeAirconId = airconLatest?.ac_id ?? airconSettingsId;
  const airconChartTitle =
    airconLatest?.name ??
    airconUnits.find((unit) => unit.ac_id === activeAirconId)?.name ??
    "エアコン";

  const chartDeviceIds = useMemo(
    () => [...DASHBOARD_SENSOR_DEVICE_IDS, AIRCON_CHART_DEVICE_ID] as const,
    []
  );

  const {
    historyData,
    historyLoading,
    historyEpoch,
    noMoreOlderData,
    resetAndLoad,
    ensureVisibleRangeLoaded,
  } = useChartHistory(DASHBOARD_SENSOR_DEVICE_IDS, viewRange, {
    airconAcId: activeAirconId,
    airconChartDeviceId: AIRCON_CHART_DEVICE_ID,
  });

  const deviceNames = useMemo(() => {
    const names: Record<number, string> = {};
    for (const deviceId of DASHBOARD_SENSOR_DEVICE_IDS) {
      const device = devices.find((item) => item.id === deviceId);
      names[deviceId] =
        device?.name ??
        (deviceId === 1 ? "リビング" : deviceId === 2 ? "寝室" : `デバイス ${deviceId}`);
    }
    names[AIRCON_CHART_DEVICE_ID] = airconChartTitle;
    return names;
  }, [devices, airconChartTitle]);

  useEffect(() => {
    if (localStorage.getItem(AUTH_KEY) === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchOutdoorLocation()
      .then(setOutdoorLocation)
      .catch(() => setOutdoorLocation(null));
    fetchDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
    fetchAirconUnits()
      .then(setAirconUnits)
      .catch(() => setAirconUnits([]));
  }, [isAuthenticated]);

  const fetchData = useCallback(
    async (options?: { showChartLoading?: boolean; reloadHistory?: boolean }) => {
      const showChartLoading = options?.showChartLoading ?? false;
      const reloadHistory = options?.reloadHistory ?? false;
      setRefreshing(true);
      if (showChartLoading) setChartLoading(true);
      try {
        const data = await fetchDashboardData(PRIMARY_SENSOR_DEVICE_ID);
        setLatestByDevice(data.latestByDevice);
        setLatestData(data.latest);
        setDailyStats(data.dailyStats);
        setAirconLatest(data.airconLatest);
        if (reloadHistory) {
          await resetAndLoad();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setRefreshing(false);
        if (showChartLoading) setChartLoading(false);
      }
    },
    [resetAndLoad]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData]);

  const handleLogin = (password: string) => {
    const envPassword = process.env.NEXT_PUBLIC_APP_PASSWORD || "admin";
    if (password === envPassword) {
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_KEY, "true");
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_KEY);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const getDeviceInfo = (deviceId: number): DeviceInfo =>
    devices.find((device) => device.id === deviceId) ?? {
      id: deviceId,
      name: deviceNames[deviceId] ?? `デバイス ${deviceId}`,
    };

  const sensorLatest = latestByDevice[PRIMARY_SENSOR_DEVICE_ID] ?? latestData;
  const outdoorMetrics = buildOutdoorMetrics(sensorLatest);
  const airconTitle = airconChartTitle;
  const lastUpdated = sensorLatest?.datetime
    ? new Date(sensorLatest.datetime).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  return (
    <div className="pb-10">
      <div className="space-y-6 px-5 pt-12">
        <section>
          <div className="mb-3 flex items-center justify-between px-0.5">
            <div>
              <h2 className="section-title">履歴</h2>
              <p className="section-subtitle">最終更新: {lastUpdated}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchData({ showChartLoading: true, reloadHistory: true })}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
              aria-label="更新"
            >
              <RefreshCw className={`size-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          <EnvironmentChart
            historyData={historyData}
            deviceIds={chartDeviceIds}
            deviceNames={deviceNames}
            chartMetric={chartMetric}
            onChartMetricChange={setChartMetric}
            viewRange={viewRange}
            onViewRangeChange={setViewRange}
            loading={chartLoading}
            historyLoading={historyLoading}
            historyEpoch={historyEpoch}
            noMoreOlderData={noMoreOlderData}
            onVisibleDomainChange={ensureVisibleRangeLoaded}
            airconTargetDeviceId={AIRCON_CHART_DEVICE_ID}
            outdoorLocationName={outdoorLocation?.name}
          />
        </section>

        <section>
          <div className="grid grid-cols-2 gap-3">
            {DASHBOARD_SENSOR_DEVICE_IDS.map((deviceId) => {
              const device = getDeviceInfo(deviceId);
              const accentColor = getDeviceLineColor(deviceId);
              return (
                <DeviceCard
                  key={deviceId}
                  title={device.name}
                  accentColor={accentColor}
                  action={
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground/60"
                      strokeWidth={1.75}
                    />
                  }
                  onClick={() => {
                    setDeviceSettingsId(deviceId);
                    setDeviceSettingsOpen(true);
                  }}
                  metrics={buildIndoorMetrics(latestByDevice[deviceId], accentColor)}
                />
              );
            })}

            <DeviceCard
              title={outdoorLocation?.name ?? "屋外"}
              metrics={outdoorMetrics}
              action={
                <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
              }
              onClick={() => setOutdoorSettingsOpen(true)}
            />

            <DeviceCard
              title={airconTitle}
              accentColor="#1abc9c"
              action={
                <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
              }
              onClick={() => {
                setAirconSettingsId(activeAirconId);
                setAirconSettingsOpen(true);
              }}
              metrics={buildAirconMetrics(airconLatest)}
            />
          </div>
        </section>

        <section>
          <div className="mb-3 px-0.5">
            <h2 className="section-title">最近の記録</h2>
          </div>

          <DailyStatsList
            dailyStats={dailyStats}
            chartMetric={chartMetric}
            latestData={latestData}
            dailyLimit={dailyLimit}
            onLoadMore={() =>
              setDailyLimit((prev) => Math.min(prev + 7, dailyStats.length))
            }
          />
        </section>

        <div className="flex gap-2 pt-2">
          <Button
            variant="ghost"
            className="flex-1 text-muted-foreground"
            onClick={() => window.location.reload()}
          >
            画面再読み込み
          </Button>
          <Button
            variant="ghost"
            className="flex-1 text-[#e74c3c]"
            onClick={handleLogout}
          >
            ログアウト
          </Button>
        </div>
      </div>

      <DeviceNameSettings
        open={deviceSettingsOpen}
        deviceId={deviceSettingsId}
        onClose={() => setDeviceSettingsOpen(false)}
        onSaved={(device) => {
          setDevices((prev) => {
            const others = prev.filter((item) => item.id !== device.id);
            return [...others, device].sort((a, b) => a.id - b.id);
          });
        }}
      />

      <OutdoorLocationSettings
        open={outdoorSettingsOpen}
        onClose={() => setOutdoorSettingsOpen(false)}
        onSaved={(location) => {
          setOutdoorLocation(location);
          fetchData();
        }}
      />

      <AirconNameSettings
        open={airconSettingsOpen}
        acId={airconSettingsId}
        onClose={() => setAirconSettingsOpen(false)}
        onSaved={(unit: AirconUnitInfo) => {
          setAirconUnits((prev) => {
            const others = prev.filter((item) => item.ac_id !== unit.ac_id);
            return [...others, unit].sort((a, b) => a.ac_id - b.ac_id);
          });
          setAirconLatest((prev) =>
            prev && prev.ac_id === unit.ac_id ? { ...prev, name: unit.name } : prev
          );
          fetchData();
        }}
      />
    </div>
  );
}
