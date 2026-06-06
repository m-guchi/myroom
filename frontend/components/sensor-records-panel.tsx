"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteSensorRecord,
  fetchSensorRecords,
  type SensorRecordsRange,
} from "@/lib/api";
import type { SensorRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANGE_LABELS: Record<SensorRecordsRange, string> = {
  day: "24時間",
  week: "7日",
  month: "30日",
};

interface SensorRecordsPanelProps {
  open: boolean;
  deviceId: number;
  deviceName: string;
  onClose: () => void;
  onOpenSettings: () => void;
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
  if (unit === "hPa" || unit === "ppm") return `${Math.round(value)}${unit === "ppm" ? " ppm" : " hPa"}`;
  return `${value.toFixed(1)}${unit}`;
}

export function SensorRecordsPanel({
  open,
  deviceId,
  deviceName,
  onClose,
  onOpenSettings,
  onChanged,
}: SensorRecordsPanelProps) {
  const [range, setRange] = useState<SensorRecordsRange>("week");
  const [records, setRecords] = useState<SensorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await fetchSensorRecords(deviceId, range, offset);
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
    [deviceId, range]
  );

  useEffect(() => {
    if (!open) return;
    loadPage(0, false);
  }, [open, deviceId, range, loadPage]);

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
  const canLoadMore = records.length < total;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-[20px] bg-card shadow-lg sm:rounded-[20px]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{deviceName}</h2>
            <p className="text-xs text-muted-foreground">記録一覧・外れ値の削除</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex size-8 items-center justify-center rounded-full hover:bg-accent"
              aria-label="表示名を設定"
            >
              <Settings className="size-5 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full hover:bg-accent"
              aria-label="閉じる"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b px-5 py-3">
          {(Object.keys(RANGE_LABELS) as SensorRecordsRange[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                range === item
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {RANGE_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">読み込み中...</p>
          ) : records.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              この期間の記録はありません
            </p>
          ) : (
            <div className="space-y-2">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
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
        </div>
      </div>
    </div>
  );
}
