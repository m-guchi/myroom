"use client";

import { Button } from "@/components/ui/button";
import {
  ChartMetric,
  DailyStat,
  LatestData,
} from "@/lib/types";

interface DailyStatsListProps {
  dailyStats: DailyStat[];
  chartMetric: ChartMetric;
  latestData: LatestData | null;
  dailyLimit: number;
  onLoadMore: () => void;
}

export function DailyStatsList({
  dailyStats,
  chartMetric,
  latestData,
  dailyLimit,
  onLoadMore,
}: DailyStatsListProps) {
  const lastFive = dailyStats.slice(-dailyLimit).reverse();
  if (!lastFive.length) return null;

  const allValues = lastFive.flatMap((day) => {
    if (chartMetric === "temperature") return [day.temp_min, day.temp_max];
    if (chartMetric === "humidity") return [day.humid_min, day.humid_max];
    if (chartMetric === "co2") return [day.co2_min, day.co2_max];
    return [day.pressure_min, day.pressure_max];
  });

  const validValues = allValues.filter((v): v is number => v != null);
  const gMin = validValues.length > 0 ? Math.min(...validValues) : 0;
  const gMax = validValues.length > 0 ? Math.max(...validValues) : 100;
  const gRange = gMax - gMin || 1;

  const barGradients: Record<ChartMetric, string> = {
    temperature: "linear-gradient(90deg, #3498db 0%, #f1c40f 50%, #e74c3c 100%)",
    humidity: "linear-gradient(90deg, #d4f7d4 0%, #2ecc71 100%)",
    pressure: "linear-gradient(90deg, #e0c3fc 0%, #9b59b6 100%)",
    co2: "linear-gradient(90deg, #fdebd0 0%, #e67e22 100%)",
  };

  return (
    <div className="flex flex-col gap-3">
      {lastFive.map((day, index) => {
        let dayMin: number | undefined;
        let dayMax: number | undefined;
        let curVal: number | undefined;
        let unit = "";

        if (chartMetric === "temperature") {
          dayMin = day.temp_min;
          dayMax = day.temp_max;
          curVal = latestData?.temperature;
          unit = "°";
        } else if (chartMetric === "humidity") {
          dayMin = day.humid_min;
          dayMax = day.humid_max;
          curVal = latestData?.humidity;
          unit = "%";
        } else if (chartMetric === "co2") {
          dayMin = day.co2_min;
          dayMax = day.co2_max;
          curVal = latestData?.co2;
          unit = " ppm";
        } else {
          dayMin = day.pressure_min;
          dayMax = day.pressure_max;
          curVal = latestData?.pressure;
        }

        const left = dayMin != null ? ((dayMin - gMin) / gRange) * 100 : 0;
        const width =
          dayMin != null && dayMax != null ? ((dayMax - dayMin) / gRange) * 100 : 0;
        const isToday = index === 0;
        const curPos =
          isToday && curVal != null && gRange > 0
            ? ((curVal - gMin) / gRange) * 100
            : null;

        const dateLabel = isToday
          ? "今日"
          : index === 1
            ? "昨日"
            : String(day.date).substring(5).replace("-", "/") || "--";

        const formatValue = (v: number | undefined) => {
          if (v == null) return "-";
          return chartMetric === "pressure" || chartMetric === "co2"
            ? Math.round(v)
            : v.toFixed(1);
        };

        return (
          <div
            key={`${day.date}-${index}`}
            className="flex items-center justify-between rounded-[18px] bg-card px-4 py-4"
          >
            <span className="text-[15px] font-bold">{dateLabel}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">
                {formatValue(dayMin)}
                {unit}
              </span>
              <div className="relative h-1.5 w-20 overflow-visible rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className="absolute h-full rounded-full transition-all duration-300"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: barGradients[chartMetric],
                  }}
                />
                {curPos !== null && (
                  <div
                    className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background shadow-sm"
                    style={{ left: `${curPos}%` }}
                  />
                )}
              </div>
              <span className="text-sm font-bold">
                {formatValue(dayMax)}
                {unit}
              </span>
            </div>
          </div>
        );
      })}

      {dailyStats.length > dailyLimit && (
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
