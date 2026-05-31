"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  ChartMetric,
  DailyStat,
  LatestData,
  getDeviceLineColor,
} from "@/lib/types";

interface DailyStatsListProps {
  dailyStatsByDevice: Record<number, DailyStat[]>;
  deviceIds: readonly number[];
  deviceNames: Record<number, string>;
  chartMetric: ChartMetric;
  latestByDevice: Record<number, LatestData | null>;
  dailyLimit: number;
  onLoadMore: () => void;
}

function getDayMetricValues(day: DailyStat, metric: ChartMetric) {
  if (metric === "temperature") {
    return { min: day.temp_min, max: day.temp_max };
  }
  if (metric === "humidity") {
    return { min: day.humid_min, max: day.humid_max };
  }
  if (metric === "co2") {
    return { min: day.co2_min, max: day.co2_max };
  }
  return { min: day.pressure_min, max: day.pressure_max };
}

function getLatestMetricValue(
  latest: LatestData | null | undefined,
  metric: ChartMetric
): number | undefined {
  if (!latest) return undefined;
  if (metric === "temperature") return latest.temperature;
  if (metric === "humidity") return latest.humidity;
  if (metric === "co2") return latest.co2;
  return latest.pressure ?? undefined;
}

function formatMetricValue(value: number | undefined, metric: ChartMetric): string {
  if (value == null) return "-";
  if (metric === "pressure" || metric === "co2") return String(Math.round(value));
  return value.toFixed(1);
}

function normalizeDateKey(date: DailyStat["date"]): string {
  return String(date).slice(0, 10);
}

export function DailyStatsList({
  dailyStatsByDevice,
  deviceIds,
  deviceNames,
  chartMetric,
  latestByDevice,
  dailyLimit,
  onLoadMore,
}: DailyStatsListProps) {
  const { visibleDates, globalRange, maxAvailableDays } = useMemo(() => {
    const dateSet = new Set<string>();

    for (const deviceId of deviceIds) {
      for (const day of dailyStatsByDevice[deviceId] ?? []) {
        dateSet.add(normalizeDateKey(day.date));
      }
    }

    const sortedDates = Array.from(dateSet).sort();
    const visible = sortedDates.slice(-dailyLimit).reverse();

    const values: number[] = [];
    for (const date of visible) {
      for (const deviceId of deviceIds) {
        const day = (dailyStatsByDevice[deviceId] ?? []).find(
          (item) => normalizeDateKey(item.date) === date
        );
        if (!day) continue;
        const { min, max } = getDayMetricValues(day, chartMetric);
        if (min != null) values.push(min);
        if (max != null) values.push(max);
      }
    }

    const gMin = values.length > 0 ? Math.min(...values) : 0;
    const gMax = values.length > 0 ? Math.max(...values) : 100;

    return {
      visibleDates: visible,
      globalRange: { min: gMin, max: gMax, span: gMax - gMin || 1 },
      maxAvailableDays: sortedDates.length,
    };
  }, [dailyStatsByDevice, deviceIds, chartMetric, dailyLimit]);

  if (!visibleDates.length) return null;

  const unit =
    chartMetric === "temperature"
      ? "°"
      : chartMetric === "humidity"
        ? "%"
        : chartMetric === "co2"
          ? " ppm"
          : "";

  return (
    <div className="flex flex-col gap-3">
      {visibleDates.map((dateKey, index) => {
        const dateLabel =
          index === 0
            ? "今日"
            : index === 1
              ? "昨日"
              : dateKey.substring(5).replace("-", "/");

        return (
          <div
            key={dateKey}
            className="rounded-[18px] bg-card px-4 py-4"
          >
            <span className="text-[15px] font-bold">{dateLabel}</span>
            <div className="mt-3 flex flex-col gap-3">
              {deviceIds.map((deviceId) => {
                const day = (dailyStatsByDevice[deviceId] ?? []).find(
                  (item) => normalizeDateKey(item.date) === dateKey
                );
                if (!day) return null;

                const { min: dayMin, max: dayMax } = getDayMetricValues(day, chartMetric);
                if (dayMin == null && dayMax == null) return null;

                const left =
                  dayMin != null
                    ? ((dayMin - globalRange.min) / globalRange.span) * 100
                    : 0;
                const width =
                  dayMin != null && dayMax != null
                    ? ((dayMax - dayMin) / globalRange.span) * 100
                    : 0;
                const isToday = index === 0;
                const curVal = isToday
                  ? getLatestMetricValue(latestByDevice[deviceId], chartMetric)
                  : undefined;
                const curPos =
                  isToday && curVal != null
                    ? ((curVal - globalRange.min) / globalRange.span) * 100
                    : null;
                const accentColor = getDeviceLineColor(deviceId);

                return (
                  <div key={deviceId} className="flex items-center gap-3">
                    <span
                      className="w-14 shrink-0 truncate text-xs font-semibold"
                      style={{ color: accentColor }}
                      title={deviceNames[deviceId] ?? `デバイス ${deviceId}`}
                    >
                      {deviceNames[deviceId] ?? `D${deviceId}`}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-10 shrink-0 text-right text-sm font-medium text-muted-foreground">
                        {formatMetricValue(dayMin, chartMetric)}
                        {unit}
                      </span>
                      <div className="relative h-1.5 min-w-0 flex-1 overflow-visible rounded-full bg-black/5 dark:bg-white/10">
                        <div
                          className="absolute h-full rounded-full transition-all duration-300"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: accentColor,
                          }}
                        />
                        {curPos != null && (
                          <div
                            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background shadow-sm"
                            style={{ left: `${curPos}%` }}
                          />
                        )}
                      </div>
                      <span className="w-10 shrink-0 text-sm font-bold">
                        {formatMetricValue(dayMax, chartMetric)}
                        {unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {maxAvailableDays > dailyLimit && (
        <Button
          variant="outline"
          className="mt-1 rounded-[18px] border-border bg-card text-muted-foreground"
          onClick={onLoadMore}
        >
          さらに表示する
        </Button>
      )}
    </div>
  );
}
