"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  Droplets,
  Gauge,
  RefreshCw,
  Settings,
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
import { SensorRecordsPanel } from "@/components/sensor-records-panel";
import { VersionHistoryDialog } from "@/components/version-history-dialog";
import { Button } from "@/components/ui/button";
import { fetchDashboardData, fetchDevices, fetchOutdoorLocation, fetchAirconUnits } from "@/lib/api";
import { useChartHistory } from "@/lib/use-chart-history";
import { APP_VERSION } from "@/lib/app-version";
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
  onSettingsClick?: () => void;
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

function DeviceCard({
  title,
  metrics,
  accentColor,
  action,
  onClick,
  onSettingsClick,
}: DeviceCardProps) {
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
        <div className="flex shrink-0 items-center gap-0.5">
          {onSettingsClick && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSettingsClick();
              }}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent hover:text-muted-foreground"
              aria-label={`${title}の設定`}
            >
              <Settings className="size-4" strokeWidth={1.75} />
            </button>
          )}
          {action}
        </div>
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
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        className={className}
        style={cardStyle}
      >
        {content}
      </div>
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
  const [dailyStatsByDevice, setDailyStatsByDevice] = useState<
    Record<number, DailyStat[]>
  >({});
  const [refreshing, setRefreshing] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("temperature");
  const [viewRange, setViewRange] = useState<ChartViewRange>("day");
  const [dailyLimit, setDailyLimit] = useState(7);
  const [outdoorLocation, setOutdoorLocation] = useState<OutdoorLocation | null>(null);
  const [outdoorSettingsOpen, setOutdoorSettingsOpen] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [deviceSettingsId, setDeviceSettingsId] = useState(PRIMARY_SENSOR_DEVICE_ID);
  const [recordsPanelOpen, setRecordsPanelOpen] = useState(false);
  const [recordsDeviceId, setRecordsDeviceId] = useState(PRIMARY_SENSOR_DEVICE_ID);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
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
        const data = await fetchDashboardData(
          airconLatest?.ac_id ?? airconSettingsId
        );
        setLatestByDevice(data.latestByDevice);
        setLatestData(data.latest);
        setDailyStatsByDevice(data.dailyStatsByDevice);
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
    [resetAndLoad, airconLatest?.ac_id, airconSettingsId]
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

  const maxDailyStatsDays = useMemo(() => {
    const dates = new Set<string>();
    for (const deviceId of [...DASHBOARD_SENSOR_DEVICE_IDS, AIRCON_CHART_DEVICE_ID]) {
      for (const day of dailyStatsByDevice[deviceId] ?? []) {
        dates.add(String(day.date).slice(0, 10));
      }
    }
    return dates.size;
  }, [dailyStatsByDevice]);

  const dailyStatsDeviceIds = useMemo(() => {
    const ids: number[] = [...DASHBOARD_SENSOR_DEVICE_IDS];
    if ((dailyStatsByDevice[AIRCON_CHART_DEVICE_ID]?.length ?? 0) > 0) {
      ids.push(AIRCON_CHART_DEVICE_ID);
    }
    return ids;
  }, [dailyStatsByDevice]);

  const latestForDailyStats = useMemo(() => {
    const merged = { ...latestByDevice };
    if (airconLatest?.room_temperature != null) {
      merged[AIRCON_CHART_DEVICE_ID] = {
        device_id: AIRCON_CHART_DEVICE_ID,
        datetime: airconLatest.datetime,
        temperature: airconLatest.room_temperature,
      };
    }
    return merged;
  }, [latestByDevice, airconLatest]);

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
              <h2 className="section-title">MyRoom</h2>
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
                  onSettingsClick={() => {
                    setDeviceSettingsId(deviceId);
                    setDeviceSettingsOpen(true);
                  }}
                  onClick={() => {
                    setRecordsDeviceId(deviceId);
                    setRecordsPanelOpen(true);
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
            dailyStatsByDevice={dailyStatsByDevice}
            deviceIds={dailyStatsDeviceIds}
            deviceNames={deviceNames}
            chartMetric={chartMetric}
            latestByDevice={latestForDailyStats}
            dailyLimit={dailyLimit}
            onLoadMore={() =>
              setDailyLimit((prev) => Math.min(prev + 7, maxDailyStatsDays))
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
        <button
          type="button"
          onClick={() => setVersionHistoryOpen(true)}
          className="mx-auto block pt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          バージョン {APP_VERSION}
        </button>
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

      <SensorRecordsPanel
        open={recordsPanelOpen}
        deviceId={recordsDeviceId}
        deviceName={deviceNames[recordsDeviceId] ?? `デバイス ${recordsDeviceId}`}
        onClose={() => setRecordsPanelOpen(false)}
        onOpenSettings={() => {
          setRecordsPanelOpen(false);
          setDeviceSettingsId(recordsDeviceId);
          setDeviceSettingsOpen(true);
        }}
        onChanged={() => fetchData({ reloadHistory: true })}
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

      <VersionHistoryDialog
        open={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
      />
    </div>
  );
}
