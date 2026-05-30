"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Droplets, Gauge, Thermometer } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartMetric,
  CHART_VIEW_RANGE_LABELS,
  ChartViewRange,
  HistoryPoint,
  METRIC_COLORS,
  METRIC_LABELS,
} from "@/lib/types";
import {
  clampDomainOffset,
  computeChartDomain,
  computeVisibleYDomain,
  downsampleHistoryForChart,
  filterHistoryForDomain,
  findActivePoint,
  formatActivePointLabel,
  formatChartAxisDate,
  getChartTicksForDomain,
  isAggregatedRange,
} from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

const METRIC_ICONS = {
  temperature: Thermometer,
  humidity: Droplets,
  pressure: Gauge,
} as const;

const VIEW_RANGES: ChartViewRange[] = ["day", "week", "month", "year"];

/** ComposedChart margin + YAxis width + container px-2 padding */
const PLOT_INSET = { left: 48, right: 28, top: 28, bottom: 0 };

interface EnvironmentChartProps {
  historyData: HistoryPoint[];
  chartMetric: ChartMetric;
  onChartMetricChange: (metric: ChartMetric) => void;
  viewRange: ChartViewRange;
  onViewRangeChange: (range: ChartViewRange) => void;
  loading: boolean;
  historyLoading?: boolean;
  historyEpoch?: number;
  noMoreOlderData?: boolean;
  onVisibleDomainChange?: (visibleMin: number, visibleMax: number) => void;
}

function getMetricKeys(metric: ChartMetric) {
  return {
    dataKey: metric,
    outdoorKey: `outdoor_${metric}` as keyof HistoryPoint,
  };
}

function getMetricValue(point: HistoryPoint, metric: ChartMetric): number | undefined {
  const value = point[metric];
  return typeof value === "number" ? value : undefined;
}

function formatMetricValue(value: number | undefined, metric: ChartMetric): string {
  if (value == null) return "--";
  return metric === "pressure" ? String(Math.round(value)) : value.toFixed(1);
}

function computePlotPosition(
  currentDomain: ReturnType<typeof computeChartDomain>,
  visibleYDomain: ReturnType<typeof computeVisibleYDomain>,
  selectionLineX: number | undefined,
  activeValue: number | undefined
) {
  if (currentDomain[0] === "dataMin" || selectionLineX == null) return null;

  const [minT, maxT] = currentDomain;
  const timeSpan = maxT - minT;
  if (timeSpan <= 0) return null;

  const xRatio = Math.max(0, Math.min(1, (selectionLineX - minT) / timeSpan));

  let yRatio: number | null = null;
  if (
    activeValue != null &&
    typeof visibleYDomain[0] === "number" &&
    typeof visibleYDomain[1] === "number"
  ) {
    const ymin = visibleYDomain[0];
    const ymax = visibleYDomain[1];
    const valueSpan = ymax - ymin;
    if (valueSpan > 0) {
      yRatio = 1 - (activeValue - ymin) / valueSpan;
    }
  }

  return { xRatio, yRatio };
}

export function EnvironmentChart({
  historyData,
  chartMetric,
  onChartMetricChange,
  viewRange,
  onViewRangeChange,
  loading,
  historyLoading = false,
  historyEpoch = 0,
  noMoreOlderData = false,
  onVisibleDomainChange,
}: EnvironmentChartProps) {
  const color = METRIC_COLORS[chartMetric];
  const { dataKey, outdoorKey } = getMetricKeys(chartMetric);
  const aggregated = isAggregatedRange(viewRange);

  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [domainOffset, setDomainOffset] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const dragDomainRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    dragDomainRef.current = domainOffset;
  }, [domainOffset]);

  useEffect(() => {
    setDomainOffset(0);
  }, [viewRange, historyEpoch]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const scheduleDomainOffset = useCallback((nextOffset: number) => {
    dragDomainRef.current = nextOffset;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      setDomainOffset(dragDomainRef.current);
      rafRef.current = null;
    });
  }, []);

  const currentDomain = useMemo(
    () => computeChartDomain(historyData, viewRange, domainOffset),
    [historyData, viewRange, domainOffset]
  );

  useEffect(() => {
    if (currentDomain[0] === "dataMin" || !onVisibleDomainChange) return;

    const timer = window.setTimeout(() => {
      onVisibleDomainChange(currentDomain[0] as number, currentDomain[1] as number);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [currentDomain, onVisibleDomainChange]);

  const activePoint = useMemo(
    () => findActivePoint(historyData, currentDomain),
    [historyData, currentDomain]
  );

  const ticks = useMemo(() => {
    if (currentDomain[0] === "dataMin") return undefined;
    const [minT, maxT] = currentDomain;
    return getChartTicksForDomain(minT, maxT, viewRange);
  }, [currentDomain, viewRange]);

  const visibleYDomain = useMemo(
    () => computeVisibleYDomain(historyData, currentDomain, chartMetric, aggregated),
    [historyData, currentDomain, chartMetric, aggregated]
  );

  const chartData = useMemo(() => {
    if (!historyData.length) return [];

    const visible = filterHistoryForDomain(historyData, currentDomain);
    const source = visible.length > 0 ? visible : historyData;
    return aggregated
      ? source
      : downsampleHistoryForChart(source, chartMetric);
  }, [historyData, currentDomain, chartMetric, aggregated]);

  const referenceLines = ticks?.map((t) => (
    <ReferenceLine
      key={t}
      x={t}
      stroke="var(--chart-line)"
      strokeDasharray="3 3"
    />
  ));

  const activeValue = activePoint ? getMetricValue(activePoint, chartMetric) : undefined;
  const activeOutdoor = activePoint
    ? (activePoint[outdoorKey as keyof HistoryPoint] as number | undefined)
    : undefined;

  const selectionLineX = activePoint?.datetimeObj;
  const selectionLabel = activePoint
    ? formatActivePointLabel(activePoint.datetimeObj, viewRange)
    : "";

  const plotPosition = useMemo(
    () =>
      computePlotPosition(currentDomain, visibleYDomain, selectionLineX, activeValue),
    [currentDomain, visibleYDomain, selectionLineX, activeValue]
  );

  const unit =
    chartMetric === "temperature" ? "°C" : chartMetric === "humidity" ? "%" : "hPa";

  const handleViewRangeChange = (range: ChartViewRange) => {
    setDomainOffset(0);
    onViewRangeChange(range);
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (dragStartX === null || !historyData.length || currentDomain[0] === "dataMin") return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const dx = clientX - dragStartX;

      if (chartRef.current) {
        const width = chartRef.current.clientWidth;
        const [minT, maxT] = currentDomain as [number, number];
        const timePerPixel = (maxT - minT) / width;
        const timeShift = -dx * timePerPixel;

        const next = clampDomainOffset(
          historyData,
          viewRange,
          dragDomainRef.current,
          timeShift,
          {
            allowPastExtension: !noMoreOlderData,
            noMoreOlderData,
          }
        );
        scheduleDomainOffset(next);
        setDragStartX(clientX);
      }
    },
    [dragStartX, historyData, currentDomain, viewRange, scheduleDomainOffset, noMoreOlderData]
  );

  const handleMouseUp = () => {
    setDragStartX(null);
  };

  const plotWidthExpr = `(100% - ${PLOT_INSET.left + PLOT_INSET.right}px)`;
  const lineLeft =
    plotPosition != null
      ? `calc(${PLOT_INSET.left}px + ${plotWidthExpr} * ${plotPosition.xRatio})`
      : undefined;
  const dotTop =
    plotPosition?.yRatio != null
      ? `calc(${PLOT_INSET.top}px + (100% - ${PLOT_INSET.top}px) * ${plotPosition.yRatio})`
      : undefined;

  return (
    <div className="climate-card flex flex-col gap-0 overflow-hidden p-0">
      <div className="px-4 pt-4">
        <Tabs
          value={chartMetric}
          onValueChange={(v) => onChartMetricChange(v as ChartMetric)}
        >
          <TabsList className="h-10 w-full bg-[#f0f0f0]">
            {(Object.keys(METRIC_LABELS) as ChartMetric[]).map((metric) => {
              const Icon = METRIC_ICONS[metric];
              const active = chartMetric === metric;
              return (
                <TabsTrigger
                  key={metric}
                  value={metric}
                  className={cn(
                    "gap-1 text-xs sm:text-sm",
                    active && "text-[var(--metric-color)]"
                  )}
                  style={
                    active
                      ? ({ "--metric-color": METRIC_COLORS[metric] } as CSSProperties)
                      : undefined
                  }
                >
                  <Icon className="size-4" />
                  {METRIC_LABELS[metric]}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {activePoint && (
        <div className="px-4 pt-3 text-center">
          <p className="text-xs text-muted-foreground">{selectionLabel}</p>
          <p className="text-2xl font-bold" style={{ color }}>
            {formatMetricValue(activeValue, chartMetric)}
            {unit}
          </p>
          {activeOutdoor != null && (
            <p className="text-xs text-muted-foreground">
              屋外: {formatMetricValue(activeOutdoor, chartMetric)}
              {unit}
            </p>
          )}
        </div>
      )}

      <div
        ref={chartRef}
        className="relative h-[240px] w-full select-none px-2 pt-2"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        style={{
          touchAction: "none",
          cursor: dragStartX !== null ? "grabbing" : "grab",
        }}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/50">
            <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {historyLoading && !loading && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm">
            <div className="size-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
            読み込み中
          </div>
        )}

        {!historyData.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <p>データがありません</p>
            <p className="text-[10px] opacity-70">バックエンドが起動しているか確認してください</p>
          </div>
        ) : !chartData.length ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            表示範囲内にデータがありません
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" className="pointer-events-none">
            <ComposedChart
              key={`${chartMetric}-${viewRange}`}
              data={chartData}
              margin={{ top: PLOT_INSET.top, right: PLOT_INSET.right - 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="datetimeObj"
                type="number"
                domain={currentDomain}
                ticks={ticks}
                tickFormatter={(t) => formatChartAxisDate(t, viewRange)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                scale="time"
                allowDataOverflow
              />
              <YAxis
                domain={visibleYDomain}
                allowDataOverflow
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(val) =>
                  chartMetric === "pressure" ? String(Math.round(val)) : val.toFixed(1)
                }
              />
              <Line
                type="monotone"
                dataKey={outdoorKey as string}
                stroke="#adb5bd"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="屋外"
                isAnimationActive={false}
              />
              {referenceLines}
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={3}
                dot={false}
                name="屋内"
                isAnimationActive={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {plotPosition && lineLeft && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <p
              className="absolute -translate-x-1/2 text-[10px] font-bold text-[#888888]"
              style={{ left: lineLeft, top: 4 }}
            >
              {selectionLabel}
            </p>
            <div
              className="absolute bottom-0 top-6 w-0 -translate-x-1/2 border-l border-dashed border-[#888888]"
              style={{ left: lineLeft }}
            />
            {dotTop && activeValue != null && (
              <div
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                style={{ left: lineLeft, top: dotTop, backgroundColor: color }}
              />
            )}
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="flex rounded-lg border bg-[#f0f0f0] p-0.5">
          {VIEW_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => handleViewRangeChange(range)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-all",
                viewRange === range
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {CHART_VIEW_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          左右にドラッグして表示期間を変更
        </p>
      </div>
    </div>
  );
}
