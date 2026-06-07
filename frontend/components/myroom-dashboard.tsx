"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  Droplets,
  Gauge,
  ListOrdered,
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
import { DisplayOrderSettings } from "@/components/display-order-settings";
import { SensorRecordsPanel } from "@/components/sensor-records-panel";
import { VersionHistoryDialog } from "@/components/version-history-dialog";
import { Button } from "@/components/ui/button";
import {
  fetchDashboardData,
  fetchDevices,
  fetchOutdoorLocation,
  fetchAirconUnits,
  login,
} from "@/lib/api";
import {
  buildDashboardOfflineSnapshot,
  isOffline,
  loadDashboardOfflineSnapshot,
  saveDashboardOfflineSnapshot,
  type DashboardOfflineSnapshot,
} from "@/lib/offline-cache";
import { useChartHistory } from "@/lib/use-chart-history";
import {
  buildDefaultDisplayOrder,
  loadDisplayOrder,
  saveDisplayOrder,
  type DisplayOrderItem,
} from "@/lib/display-order";
import {
  AIRCON_TARGET_COLOR_KEY,
  buildDefaultChartColors,
  deviceColorKey,
  getAirconTargetChartColor,
  getDeviceChartColor,
  getOutdoorChartColor,
  loadChartColors,
  OUTDOOR_COLOR_KEY,
  saveChartColors,
  setChartColor,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import {
  buildDefaultChartLineVisibility,
  deviceVisibilityKey,
  isChartLineVisible,
  loadChartLineVisibility,
  mergeEffectiveChartLineVisibility,
  AIRCON_TARGET_VISIBILITY_KEY,
  OUTDOOR_VISIBILITY_KEY,
  saveChartLineVisibility,
  type ChartLineVisibilityOverrides,
  type ChartLineVisibilitySettings,
} from "@/lib/chart-line-visibility";
import { APP_VERSION } from "@/lib/app-version";
import {
  AIRCON_CHART_DEVICE_ID,
  formatAirconMode,
  getSensorDeviceIds,
  isAirconPowerOff,
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

function buildAirconMetrics(
  data: AirconData | null | undefined,
  accentColor: string
): DeviceMetric[] {
  if (!data) return [];

  const metrics: DeviceMetric[] = [];

  if (data.room_temperature != null) {
    metrics.push({
      key: "room_temperature",
      icon: <Thermometer className="size-5" strokeWidth={1.75} style={{ color: accentColor }} />,
      value: `${data.room_temperature.toFixed(1)}°C`,
    });
  }
  if (data.target_temperature != null || data.mode || data.power) {
    const powerOff = isAirconPowerOff(data.power);
    const modeLabel = powerOff ? "停止" : formatAirconMode(data.mode);
    const value =
      !powerOff && data.target_temperature != null
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
  const [displayOrderOpen, setDisplayOrderOpen] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<DisplayOrderItem[]>(() =>
    buildDefaultDisplayOrder()
  );
  const [chartColors, setChartColors] = useState<ChartColorSettings>(() =>
    buildDefaultChartColors()
  );
  const [defaultLineVisibility, setDefaultLineVisibility] =
    useState<ChartLineVisibilitySettings>(() => buildDefaultChartLineVisibility());
  const [sessionLineOverrides, setSessionLineOverrides] =
    useState<ChartLineVisibilityOverrides>({});

  const effectiveLineVisibility = useMemo(
    () => mergeEffectiveChartLineVisibility(defaultLineVisibility, sessionLineOverrides),
    [defaultLineVisibility, sessionLineOverrides]
  );
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [airconLatest, setAirconLatest] = useState<AirconData | null>(null);
  const [airconUnits, setAirconUnits] = useState<AirconUnitInfo[]>([]);
  const [airconSettingsOpen, setAirconSettingsOpen] = useState(false);
  const [airconSettingsId, setAirconSettingsId] = useState(1);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineSnapshot, setOfflineSnapshot] = useState<DashboardOfflineSnapshot | null>(
    null
  );

  const activeAirconId = airconLatest?.ac_id ?? airconSettingsId;
  const airconChartTitle =
    airconLatest?.name ??
    airconUnits.find((unit) => unit.ac_id === activeAirconId)?.name ??
    "エアコン";

  const sensorDeviceIds = useMemo(() => getSensorDeviceIds(devices), [devices]);
  const sensorDeviceIdsKey = sensorDeviceIds.join(",");

  const chartDeviceIds = useMemo(
    () => [...sensorDeviceIds, AIRCON_CHART_DEVICE_ID],
    [sensorDeviceIds]
  );

  const {
    historyData,
    historyLoading,
    historyEpoch,
    noMoreOlderData,
    resetAndLoad,
    refreshLatest,
    ensureVisibleRangeLoaded,
  } = useChartHistory(sensorDeviceIds, viewRange, {
    airconAcId: activeAirconId,
    airconChartDeviceId: AIRCON_CHART_DEVICE_ID,
    pollIntervalMs: 30000,
    offlineMode: isOfflineMode,
    offlineHistory: offlineSnapshot?.historyData ?? null,
    offlineCacheKey: offlineSnapshot?.cachedAt ?? null,
  });

  const applyOfflineSnapshot = useCallback((snapshot: DashboardOfflineSnapshot) => {
    setLatestByDevice(snapshot.latestByDevice);
    setLatestData(snapshot.latestByDevice[PRIMARY_SENSOR_DEVICE_ID] ?? null);
    setDailyStatsByDevice(snapshot.dailyStatsByDevice);
    setAirconLatest(snapshot.airconLatest);
    setDevices(snapshot.devices);
    setAirconUnits(snapshot.airconUnits);
    setOutdoorLocation(snapshot.outdoorLocation);
    setOfflineSnapshot(snapshot);
    setIsOfflineMode(true);
  }, []);

  const deviceNames = useMemo(() => {
    const names: Record<number, string> = {};
    for (const deviceId of sensorDeviceIds) {
      const device = devices.find((item) => item.id === deviceId);
      names[deviceId] =
        device?.name ??
        (deviceId === 1 ? "リビング" : deviceId === 2 ? "寝室" : `デバイス ${deviceId}`);
    }
    names[AIRCON_CHART_DEVICE_ID] = airconChartTitle;
    return names;
  }, [devices, sensorDeviceIds, airconChartTitle]);

  useEffect(() => {
    if (localStorage.getItem(AUTH_KEY) === "true") {
      setIsAuthenticated(true);
    }
    setChartColors(loadChartColors());
  }, []);

  useEffect(() => {
    setDisplayOrder(loadDisplayOrder(sensorDeviceIds));
    setDefaultLineVisibility(loadChartLineVisibility(sensorDeviceIds));
    setSessionLineOverrides({});
  }, [sensorDeviceIdsKey]);

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
        if (isOffline()) {
          const snapshot = await loadDashboardOfflineSnapshot();
          if (snapshot) {
            applyOfflineSnapshot(snapshot);
            return;
          }
        }

        const data = await fetchDashboardData(
          airconLatest?.ac_id ?? airconSettingsId,
          sensorDeviceIds
        );
        setIsOfflineMode(false);
        setOfflineSnapshot(null);
        setLatestByDevice(data.latestByDevice);
        setLatestData(data.latest);
        setDailyStatsByDevice(data.dailyStatsByDevice);
        setAirconLatest(data.airconLatest);
        if (reloadHistory) {
          await resetAndLoad();
        }
      } catch (err) {
        console.error(err);
        const snapshot = await loadDashboardOfflineSnapshot();
        if (snapshot) {
          applyOfflineSnapshot(snapshot);
        }
      } finally {
        setRefreshing(false);
        if (showChartLoading) setChartLoading(false);
      }
    },
    [
      resetAndLoad,
      airconLatest?.ac_id,
      airconSettingsId,
      sensorDeviceIds,
      applyOfflineSnapshot,
    ]
  );

  useEffect(() => {
    if (!isAuthenticated || isOfflineMode || isOffline()) return;
    if (!historyData.length || Object.keys(latestByDevice).length === 0) return;

    const snapshot = buildDashboardOfflineSnapshot({
      sensorDeviceIds,
      airconAcId: activeAirconId,
      latestByDevice,
      dailyStatsByDevice,
      airconLatest,
      historyData,
      devices,
      airconUnits,
      outdoorLocation,
    });

    if (!snapshot) return;
    void saveDashboardOfflineSnapshot(snapshot);
  }, [
    isAuthenticated,
    isOfflineMode,
    sensorDeviceIds,
    activeAirconId,
    latestByDevice,
    dailyStatsByDevice,
    airconLatest,
    historyData,
    devices,
    airconUnits,
    outdoorLocation,
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleOnline = () => {
      setIsOfflineMode(false);
      setOfflineSnapshot(null);
      void fetchData({ showChartLoading: true, reloadHistory: true });
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isAuthenticated, fetchData]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData]);

  const handleLogin = async (password: string) => {
    const ok = await login(password);
    if (ok) {
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
    for (const deviceId of [...sensorDeviceIds, AIRCON_CHART_DEVICE_ID]) {
      for (const day of dailyStatsByDevice[deviceId] ?? []) {
        dates.add(String(day.date).slice(0, 10));
      }
    }
    return dates.size;
  }, [dailyStatsByDevice, sensorDeviceIds]);

  const dailyStatsDeviceIds = useMemo(() => {
    const ids: number[] = [];
    for (const item of displayOrder) {
      if (item.type === "device") {
        ids.push(item.deviceId);
      } else if (
        item.type === "aircon" &&
        (dailyStatsByDevice[AIRCON_CHART_DEVICE_ID]?.length ?? 0) > 0
      ) {
        ids.push(AIRCON_CHART_DEVICE_ID);
      }
    }
    return ids;
  }, [displayOrder, dailyStatsByDevice]);

  const handleDisplayOrderChange = (order: DisplayOrderItem[]) => {
    setDisplayOrder(order);
    saveDisplayOrder(order);
  };

  const handleChartColorChange = (key: string, color: string) => {
    setChartColors((prev) => {
      const next = setChartColor(prev, key, color);
      saveChartColors(next);
      return next;
    });
  };

  const handleDefaultChartLineVisibleChange = (key: string, visible: boolean) => {
    setDefaultLineVisibility((prev) => {
      const next = { ...prev, [key]: visible };
      saveChartLineVisibility(next);
      return next;
    });
    setSessionLineOverrides((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSessionChartLineVisibleChange = (key: string, visible: boolean) => {
    setSessionLineOverrides((prev) => ({ ...prev, [key]: visible }));
  };

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
  const offlineCachedAt = offlineSnapshot?.dataLatestAt
    ? new Date(offlineSnapshot.dataLatestAt).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="pb-10">
      <div className="space-y-6 px-5 pt-12">
        {isOfflineMode && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            オフライン表示中
            {offlineCachedAt ? `（${offlineCachedAt} 時点・直近24時間）` : "（直近24時間）"}
          </div>
        )}
        <section>
          <div className="mb-3 flex items-center justify-between px-0.5">
            <div>
              <h2 className="section-title">MyRoom</h2>
              <p className="section-subtitle">最終更新: {lastUpdated}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isOfflineMode) return;
                fetchData({ showChartLoading: true });
                void refreshLatest();
              }}
              disabled={isOfflineMode}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
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
            legendOrder={displayOrder}
            chartColors={chartColors}
            lineVisibility={effectiveLineVisibility}
            onLineVisibilityChange={handleSessionChartLineVisibleChange}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between px-0.5">
            <h2 className="section-title">センサー</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDisplayOrderOpen(true)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ListOrdered className="size-4" />
                表示順
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayOrder.map((item) => {
              if (item.type === "device") {
                const deviceId = item.deviceId;
                const device = getDeviceInfo(deviceId);
                const accentColor = getDeviceChartColor(chartColors, deviceId);
                return (
                  <DeviceCard
                    key={`device-${deviceId}`}
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
              }

              if (item.type === "outdoor") {
                return (
                  <DeviceCard
                    key="outdoor"
                    title={outdoorLocation?.name ?? "屋外"}
                    metrics={outdoorMetrics}
                    action={
                      <ChevronRight
                        className="size-5 shrink-0 text-muted-foreground/60"
                        strokeWidth={1.75}
                      />
                    }
                    onSettingsClick={() => setOutdoorSettingsOpen(true)}
                    onClick={() => setOutdoorSettingsOpen(true)}
                  />
                );
              }

              return (
                <DeviceCard
                  key="aircon"
                  title={airconTitle}
                  accentColor={getDeviceChartColor(chartColors, AIRCON_CHART_DEVICE_ID)}
                  action={
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground/60"
                      strokeWidth={1.75}
                    />
                  }
                  onSettingsClick={() => {
                    setAirconSettingsId(activeAirconId);
                    setAirconSettingsOpen(true);
                  }}
                  onClick={() => {
                    setAirconSettingsId(activeAirconId);
                    setAirconSettingsOpen(true);
                  }}
                  metrics={buildAirconMetrics(
                    airconLatest,
                    getDeviceChartColor(chartColors, AIRCON_CHART_DEVICE_ID)
                  )}
                />
              );
            })}
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
            chartColors={chartColors}
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

      <DisplayOrderSettings
        open={displayOrderOpen}
        order={displayOrder}
        deviceNames={deviceNames}
        outdoorName={outdoorLocation?.name}
        airconName={airconTitle}
        chartColors={chartColors}
        onClose={() => setDisplayOrderOpen(false)}
        onChange={handleDisplayOrderChange}
      />

      <DeviceNameSettings
        open={deviceSettingsOpen}
        deviceId={deviceSettingsId}
        chartColor={getDeviceChartColor(chartColors, deviceSettingsId)}
        onChartColorChange={(color) =>
          handleChartColorChange(deviceColorKey(deviceSettingsId), color)
        }
        chartLineVisible={isChartLineVisible(
          defaultLineVisibility,
          deviceVisibilityKey(deviceSettingsId)
        )}
        onChartLineVisibleChange={(visible) =>
          handleDefaultChartLineVisibleChange(deviceVisibilityKey(deviceSettingsId), visible)
        }
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
        chartColor={getOutdoorChartColor(chartColors)}
        onChartColorChange={(color) => handleChartColorChange(OUTDOOR_COLOR_KEY, color)}
        chartLineVisible={isChartLineVisible(defaultLineVisibility, OUTDOOR_VISIBILITY_KEY)}
        onChartLineVisibleChange={(visible) =>
          handleDefaultChartLineVisibleChange(OUTDOOR_VISIBILITY_KEY, visible)
        }
        onClose={() => setOutdoorSettingsOpen(false)}
        onSaved={(location) => {
          setOutdoorLocation(location);
          fetchData();
        }}
      />

      <AirconNameSettings
        open={airconSettingsOpen}
        acId={airconSettingsId}
        roomChartColor={getDeviceChartColor(chartColors, AIRCON_CHART_DEVICE_ID)}
        targetChartColor={getAirconTargetChartColor(chartColors)}
        onRoomChartColorChange={(color) =>
          handleChartColorChange(deviceColorKey(AIRCON_CHART_DEVICE_ID), color)
        }
        onTargetChartColorChange={(color) =>
          handleChartColorChange(AIRCON_TARGET_COLOR_KEY, color)
        }
        roomChartLineVisible={isChartLineVisible(
          defaultLineVisibility,
          deviceVisibilityKey(AIRCON_CHART_DEVICE_ID)
        )}
        targetChartLineVisible={isChartLineVisible(
          defaultLineVisibility,
          AIRCON_TARGET_VISIBILITY_KEY
        )}
        onRoomChartLineVisibleChange={(visible) =>
          handleDefaultChartLineVisibleChange(
            deviceVisibilityKey(AIRCON_CHART_DEVICE_ID),
            visible
          )
        }
        onTargetChartLineVisibleChange={(visible) =>
          handleDefaultChartLineVisibleChange(AIRCON_TARGET_VISIBILITY_KEY, visible)
        }
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
