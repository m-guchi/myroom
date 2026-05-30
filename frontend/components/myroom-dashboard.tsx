"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AirVent,
  ChevronRight,
  Droplets,
  Gauge,
  Power,
  RefreshCw,
  Sun,
  Thermometer,
} from "lucide-react";
import { LoginScreen } from "@/components/login-screen";
import { EnvironmentChart } from "@/components/environment-chart";
import { DailyStatsList } from "@/components/daily-stats-list";
import { OutdoorLocationSettings } from "@/components/outdoor-location-settings";
import { Button } from "@/components/ui/button";
import { fetchAllData, fetchOutdoorLocation } from "@/lib/api";
import {
  AnalysisData,
  ChartMetric,
  ChartViewRange,
  DailyStat,
  HistoryPoint,
  LatestData,
  OutdoorLocation,
  TimeRange,
} from "@/lib/types";

const AUTH_KEY = "app_auth";

interface DeviceCardProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  action?: React.ReactNode;
  onClick?: () => void;
}

function DeviceCard({ icon, title, status, action, onClick }: DeviceCardProps) {
  const className = onClick
    ? "device-card cursor-pointer text-left transition-transform active:scale-[0.98]"
    : "device-card text-left";
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="text-muted-foreground">{icon}</div>
        {action}
      </div>
      <p className="device-card-title">{title}</p>
      <p className="device-card-status">{status}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function MyRoomDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("temperature");
  const [viewRange, setViewRange] = useState<ChartViewRange>("day");
  const [dailyLimit, setDailyLimit] = useState(7);
  const [outdoorLocation, setOutdoorLocation] = useState<OutdoorLocation | null>(null);
  const [outdoorSettingsOpen, setOutdoorSettingsOpen] = useState(false);

  // 日・週・月は詳細データ（30日分）、年のみ日次集計
  const historyFetchRange: TimeRange = viewRange === "year" ? "year" : "month";

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
  }, [isAuthenticated]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllData(historyFetchRange);
      setLatestData(data.latest);
      setHistoryData(data.history);
      setDailyStats(data.dailyStats);
      setAnalysisData(data.analysis);
      if (!data.history.length) {
        console.warn("History API returned no data. Is the backend running?");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [historyFetchRange]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
    const interval = setInterval(fetchData, 30000);
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

  const temp =
    latestData?.temperature != null ? latestData.temperature.toFixed(1) : "--";
  const humid = latestData?.humidity != null ? latestData.humidity : "--";
  const press =
    latestData?.pressure != null ? Math.round(latestData.pressure) : "--";
  const outTemp =
    latestData?.outdoor_temperature != null
      ? latestData.outdoor_temperature.toFixed(1)
      : "--";
  const outHumid =
    latestData?.outdoor_humidity != null ? latestData.outdoor_humidity : "--";
  const lastUpdated = latestData?.datetime
    ? new Date(latestData.datetime).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  const acMode = analysisData?.ac_status || "OFF";
  const acText =
    acMode === "HEATING" ? "暖房 ON" : acMode === "COOLING" ? "冷房 ON" : "オフ";
  const acColor =
    acMode === "HEATING" ? "#ff6b6b" : acMode === "COOLING" ? "#4dabf7" : "#888888";
  const AcIcon =
    acMode === "HEATING" ? Sun : acMode === "COOLING" ? AirVent : Power;

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
              onClick={fetchData}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5"
              aria-label="更新"
            >
              <RefreshCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <EnvironmentChart
            historyData={historyData}
            chartMetric={chartMetric}
            onChartMetricChange={setChartMetric}
            viewRange={viewRange}
            onViewRangeChange={setViewRange}
            loading={loading}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between px-0.5">
            <div>
              <h2 className="section-title">リビング</h2>
              <p className="section-subtitle">
                {temp}°C | {humid}%
              </p>
            </div>
            <ChevronRight className="size-5 text-muted-foreground/60" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="device-card">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Thermometer className="size-5 text-[#6fcf97]" strokeWidth={1.75} />
                  <span className="text-lg font-bold text-foreground">{temp}°C</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="size-5 text-[#56ccf2]" strokeWidth={1.75} />
                  <span className="text-lg font-bold text-foreground">{humid}%</span>
                </div>
              </div>
              <p className="device-card-title">環境センサー</p>
            </div>

            <DeviceCard
              icon={<AcIcon className="size-6" style={{ color: acColor }} strokeWidth={1.75} />}
              title="エアコン"
              status={acText}
              action={
                <div className="flex size-8 items-center justify-center rounded-full bg-[#f0f0f0]">
                  <Power className="size-4 text-muted-foreground" strokeWidth={1.75} />
                </div>
              }
            />

            <DeviceCard
              icon={<Gauge className="size-6 text-[#bb86fc]" strokeWidth={1.75} />}
              title="気圧"
              status={`${press} hPa`}
            />

            <DeviceCard
              icon={<Sun className="size-6 text-[#f1c40f]" strokeWidth={1.75} />}
              title="屋外"
              status={
                outdoorLocation
                  ? `${outdoorLocation.name} · ${outTemp}°C | ${outHumid}%`
                  : `${outTemp}°C | ${outHumid}%`
              }
              action={
                <ChevronRight className="size-5 text-muted-foreground/60" strokeWidth={1.75} />
              }
              onClick={() => setOutdoorSettingsOpen(true)}
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

      <OutdoorLocationSettings
        open={outdoorSettingsOpen}
        onClose={() => setOutdoorSettingsOpen(false)}
        onSaved={(location) => {
          setOutdoorLocation(location);
          fetchData();
        }}
      />
    </div>
  );
}
