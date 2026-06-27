"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trash2, X } from "lucide-react";
import { EnvironmentChart } from "@/components/environment-chart";
import { Button } from "@/components/ui/button";
import { deleteSensorRecord, fetchSensorRecords } from "@/lib/api";
import type { ChartColorSettings } from "@/lib/chart-colors";
import {
  deviceVisibilityKey,
  type ChartLineVisibilitySettings,
} from "@/lib/chart-line-visibility";
import type { DisplayOrderItem } from "@/lib/display-order";
import { useChartHistory } from "@/lib/use-chart-history";
import type {
  ChartMetric,
  ChartViewRange,
  DeviceInfo,
  HistoryPoint,
  SensorRecord,
} from "@/lib/types";

type PanelView = "chart" | "records";

interface DeviceDetailPanelProps {
  open: boolean;
  deviceId: number;
  deviceName: string;
  chartColors: ChartColorSettings;
  lineVisibility?: ChartLineVisibilitySettings;
  devices: DeviceInfo[];
  isOfflineMode?: boolean;
  offlineHistory?: HistoryPoint[] | null;
  offlineCacheKey?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

function formatRecordDatetime(value: string): string {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCell(value: number | null | undefined, unit: string): string {
  if (value == null) return "--";
  if (unit === "hPa" || unit === "ppm") {
    return `${Math.round(value)}${unit === "ppm" ? " ppm" : " hPa"}`;
  }
  if (unit === "lx") {
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} lx`;
  }
  return `${value.toFixed(1)}${unit}`;
}

export function DeviceDetailPanel({
  open,
  deviceId,
  deviceName,
  chartColors,
  lineVisibility: lineVisibilityProp,
  devices,
  isOfflineMode = false,
  offlineHistory = null,
  offlineCacheKey = null,
  onClose,
  onChanged,
}: DeviceDetailPanelProps) {
  const [view, setView] = useState<PanelView>("chart");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("temperature");
  const [viewRange, setViewRange] = useState<ChartViewRange>("day");
  const [records, setRecords] = useState<SensorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const deviceIds = useMemo(() => [deviceId] as const, [deviceId]);
  const deviceNames = useMemo(
    () => ({ [deviceId]: deviceName }),
    [deviceId, deviceName]
  );
  const legendOrder = useMemo(
    (): DisplayOrderItem[] => [{ type: "device", deviceId }],
    [deviceId]
  );
  const lineVisibility = useMemo(
    () =>
      lineVisibilityProp ?? ({ [deviceVisibilityKey(deviceId)]: true } as ChartLineVisibilitySettings),
    [lineVisibilityProp, deviceId]
  );

  const {
    historyData,
    historyLoading,
    historyEpoch,
    noMoreOlderData,
    ensureVisibleRangeLoaded,
  } = useChartHistory(deviceIds, viewRange, {
    devices,
    offlineMode: isOfflineMode,
    offlineHistory,
    offlineCacheKey,
    pollIntervalMs: open && view === "chart" && !isOfflineMode ? 30000 : 0,
  });

  useEffect(() => {
    if (!open) return;
    setView("chart");
    setError("");
  }, [open, deviceId]);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await fetchSensorRecords(deviceId, offset);
        setTotal(data.total);
        setRecords((prev) => (append ? [...prev, ...data.records] : data.records));
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
        if (!append) {
          setRecords([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [deviceId]
  );

  useEffect(() => {
    if (!open || view !== "records" || isOfflineMode) return;
    loadPage(0, false);
  }, [open, view, deviceId, loadPage, isOfflineMode]);

  const handleDelete = async (record: SensorRecord) => {
    const label = formatRecordDatetime(record.datetime);
    if (!window.confirm(`${label} の記録を削除しますか？`)) return;

    setDeletingKey(record.datetime);
    setError("");
    try {
      await deleteSensorRecord(deviceId, record.datetime);
      setRecords((prev) => prev.filter((item) => item.datetime !== record.datetime));
      setTotal((prev) => Math.max(0, prev - 1));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeletingKey(null);
    }
  };

  if (!open) return null;

  const hasPressure = records.some((record) => record.pressure != null);
  const hasCo2 = records.some((record) => record.co2 != null);
  const hasIlluminance = records.some((record) => record.illuminance != null);
  const canLoadMore = records.length < total;

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex min-h-0 max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] bg-card shadow-lg sm:max-h-[88vh] sm:rounded-[20px]">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {view === "records" ? (
              <button
                type="button"
                onClick={() => setView("chart")}
                className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent"
                aria-label="グラフに戻る"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{deviceName}</h2>
              <p className="text-xs text-muted-foreground">
                {view === "chart" ? "グラフ" : "記録一覧・外れ値の削除"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {view === "chart" ? (
            <div className="px-3 py-3">
              <EnvironmentChart
                historyData={historyData}
                deviceIds={deviceIds}
                deviceNames={deviceNames}
                chartMetric={chartMetric}
                onChartMetricChange={setChartMetric}
                viewRange={viewRange}
                onViewRangeChange={setViewRange}
                loading={false}
                historyLoading={historyLoading}
                historyEpoch={historyEpoch}
                noMoreOlderData={noMoreOlderData}
                onVisibleDomainChange={ensureVisibleRangeLoaded}
                legendOrder={legendOrder}
                chartColors={chartColors}
                lineVisibility={lineVisibility}
                onLineVisibilityChange={() => {}}
              />
            </div>
          ) : loading ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              読み込み中...
            </p>
          ) : isOfflineMode ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              オフライン中は記録一覧を表示できません
            </p>
          ) : records.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              記録がありません
            </p>
          ) : (
            <div className="space-y-2 px-5 py-3">
              {records.map((record) => (
                <div
                  key={record.datetime}
                  className="rounded-xl border bg-background/60 px-3 py-2.5"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {formatRecordDatetime(record.datetime)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDelete(record)}
                      disabled={deletingKey === record.datetime}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                      aria-label="この記録を削除"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>温度: {formatCell(record.temperature, "°C")}</span>
                    <span>湿度: {formatCell(record.humidity, "%")}</span>
                    {hasPressure && (
                      <span>気圧: {formatCell(record.pressure, "hPa")}</span>
                    )}
                    {hasCo2 && <span>CO2: {formatCell(record.co2, "ppm")}</span>}
                    {hasIlluminance && (
                      <span>照度: {formatCell(record.illuminance, "lx")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {view === "chart" ? (
            <Button
              className="h-10 w-full rounded-xl"
              onClick={() => setView("records")}
              disabled={isOfflineMode}
            >
              データを表示する
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {total > 0 ? `${records.length} / ${total} 件` : "0 件"}
              </p>
              {canLoadMore && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => loadPage(records.length, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "読み込み中..." : "もっと見る"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
