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
import { Droplets, Gauge, Thermometer, Wind } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartMetric,
  CHART_VIEW_RANGE_LABELS,
  ChartViewRange,
  deviceMetricKey,
  getDeviceLineColor,
  HistoryPoint,
  METRIC_COLORS,
  METRIC_LABELS,
  METRIC_UNITS,
} from "@/lib/types";
import {
  clampDomainOffset,
  computeChartDomain,
  computeVisibleYDomain,
  downsampleMultiDeviceHistoryForChart,
  filterHistoryForDomain,
  formatActivePointLabel,
  formatChartAxisDate,
  getAvailableChartMetrics,
  getChartTicksForDomain,
  getDeviceMetricValueAtTime,
  getDevicesWithMetricData,
  getMaxPositiveDomainOffset,
  getOutdoorMetricValueAtTime,
  getSelectionTime,
  hasOutdoorMetricData,
  isAggregatedRange,
  withSelectionEndPoints,
} from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

const METRIC_ICONS = {
  temperature: Thermometer,
  humidity: Droplets,
  pressure: Gauge,
  co2: Wind,
} as const;

const VIEW_RANGES: ChartViewRange[] = ["day", "week", "month", "year"];

/** ComposedChart margin + YAxis width + container padding（オーバーレイ位置合わせ用） */
const PLOT_INSET = { left: 36, right: 6, top: 28, bottom: 22 };
const Y_AXIS_WIDTH = 32;

interface EnvironmentChartProps {
  historyData: HistoryPoint[];
  deviceIds: readonly number[];
  deviceNames: Record<number, string>;
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
    outdoorKey: `outdoor_${metric}` as keyof HistoryPoint,
  };
}

function formatMetricValue(value: number | undefined, metric: ChartMetric): string {
  if (value == null) return "--";
  if (metric === "pressure" || metric === "co2") return String(Math.round(value));
  return value.toFixed(1);
}

function computeSelectionXRatio(
  currentDomain: ReturnType<typeof computeChartDomain>,
  selectionTime: number | null
): number | null {
  if (selectionTime == null || currentDomain[0] === "dataMin") return null;

  const [minT, maxT] = currentDomain;
  const timeSpan = maxT - minT;
  if (timeSpan <= 0) return null;

  return Math.max(0, Math.min(1, (selectionTime - minT) / timeSpan));
}

function computePlotYRatio(
  visibleYDomain: ReturnType<typeof computeVisibleYDomain>,
  activeValue: number | undefined
): number | null {
  if (
    activeValue == null ||
    typeof visibleYDomain[0] !== "number" ||
    typeof visibleYDomain[1] !== "number"
  ) {
    return null;
  }

  const ymin = visibleYDomain[0];
  const ymax = visibleYDomain[1];
  const valueSpan = ymax - ymin;
  if (valueSpan <= 0) return null;

  return 1 - (activeValue - ymin) / valueSpan;
}

function computePlotPosition(
  currentDomain: ReturnType<typeof computeChartDomain>,
  visibleYDomain: ReturnType<typeof computeVisibleYDomain>,
  selectionLineX: number | undefined,
  activeValue: number | undefined
) {
  const xRatio = computeSelectionXRatio(
    currentDomain,
    selectionLineX ?? null
  );
  if (xRatio == null || activeValue == null) return null;

  const yRatio = computePlotYRatio(visibleYDomain, activeValue);
  if (yRatio == null) return null;

  return { xRatio, yRatio };
}

function plotHeightExpr(): string {
  return `(100% - ${PLOT_INSET.top + PLOT_INSET.bottom}px)`;
}

export function EnvironmentChart({
  historyData,
  deviceIds,
  deviceNames,
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
  const { outdoorKey } = getMetricKeys(chartMetric);
  const aggregated = isAggregatedRange(viewRange);

  const availableMetrics = useMemo(
    () => getAvailableChartMetrics(historyData, deviceIds),
    [historyData, deviceIds]
  );

  const visibleDeviceIds = useMemo(
    () => getDevicesWithMetricData(historyData, deviceIds, chartMetric),
    [historyData, deviceIds, chartMetric]
  );

  const canShowOutdoor = hasOutdoorMetricData(historyData, chartMetric);
  const [outdoorVisible, setOutdoorVisible] = useState(false);
  const showOutdoorLine = canShowOutdoor && outdoorVisible;

  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [domainOffset, setDomainOffset] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const dragDomainRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setOutdoorVisible(false);
  }, [chartMetric]);

  useEffect(() => {
    dragDomainRef.current = domainOffset;
  }, [domainOffset]);

  useEffect(() => {
    const nextOffset = getMaxPositiveDomainOffset(viewRange);
    dragDomainRef.current = nextOffset;
    setDomainOffset(nextOffset);
  }, [viewRange, historyEpoch]);

  useEffect(() => {
    if (!availableMetrics.length) return;
    if (!availableMetrics.includes(chartMetric)) {
      onChartMetricChange(availableMetrics[0]);
    }
  }, [availableMetrics, chartMetric, onChartMetricChange]);

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

  const selectionTime = useMemo(
    () => getSelectionTime(historyData, currentDomain),
    [historyData, currentDomain]
  );

  const ticks = useMemo(() => {
    if (currentDomain[0] === "dataMin") return undefined;
    const [minT, maxT] = currentDomain;
    return getChartTicksForDomain(minT, maxT, viewRange);
  }, [currentDomain, viewRange]);

  const visibleYDomain = useMemo(
    () =>
      computeVisibleYDomain(
        historyData,
        currentDomain,
        chartMetric,
        aggregated,
        visibleDeviceIds,
        showOutdoorLine
      ),
    [historyData, currentDomain, chartMetric, aggregated, visibleDeviceIds, showOutdoorLine]
  );

  const chartPlotData = useMemo(() => {
    if (!historyData.length) return [];

    const visible = filterHistoryForDomain(historyData, currentDomain);
    const source = visible.length > 0 ? visible : historyData;
    const base = aggregated
      ? source
      : downsampleMultiDeviceHistoryForChart(
          source,
          chartMetric,
          320,
          visibleDeviceIds
        );

    return withSelectionEndPoints(
      base,
      selectionTime,
      visibleDeviceIds,
      chartMetric,
      showOutdoorLine
    );
  }, [
    historyData,
    currentDomain,
    chartMetric,
    aggregated,
    visibleDeviceIds,
    selectionTime,
    showOutdoorLine,
  ]);

  const referenceLines = ticks?.map((t) => (
    <ReferenceLine
      key={t}
      x={t}
      stroke="var(--chart-line)"
      strokeDasharray="3 3"
    />
  ));

  const activeDeviceValues = useMemo(() => {
    if (selectionTime == null) return [];
    return visibleDeviceIds
      .map((deviceId) => ({
        deviceId,
        name: deviceNames[deviceId] ?? `デバイス ${deviceId}`,
        value: getDeviceMetricValueAtTime(
          chartPlotData,
          deviceId,
          chartMetric,
          selectionTime
        ),
        color: getDeviceLineColor(deviceId),
      }))
      .filter((entry) => entry.value != null);
  }, [selectionTime, visibleDeviceIds, deviceNames, chartMetric, chartPlotData]);

  const activeOutdoor = useMemo(() => {
    if (selectionTime == null) return undefined;
    return getOutdoorMetricValueAtTime(chartPlotData, chartMetric, selectionTime);
  }, [selectionTime, chartPlotData, chartMetric]);

  const selectionLabel =
    selectionTime != null
      ? formatActivePointLabel(selectionTime, viewRange)
      : "";

  const activeDots = useMemo(() => {
    if (selectionTime == null) return [];
    return activeDeviceValues
      .map((entry) => {
        const plotPosition = computePlotPosition(
          currentDomain,
          visibleYDomain,
          selectionTime,
          entry.value
        );
        return plotPosition?.yRatio != null ? { ...entry, plotPosition } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  }, [activeDeviceValues, currentDomain, selectionTime, visibleYDomain]);

  const unit = METRIC_UNITS[chartMetric];

  const handleViewRangeChange = (range: ChartViewRange) => {
    const nextOffset = getMaxPositiveDomainOffset(range);
    dragDomainRef.current = nextOffset;
    setDomainOffset(nextOffset);
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

  const selectionXRatio = useMemo(
    () => computeSelectionXRatio(currentDomain, selectionTime),
    [currentDomain, selectionTime]
  );

  const plotWidthExpr = `(100% - ${PLOT_INSET.left + PLOT_INSET.right}px)`;
  const lineLeft =
    selectionXRatio != null
      ? `calc(${PLOT_INSET.left}px + ${plotWidthExpr} * ${selectionXRatio})`
      : undefined;

  const showSelectionOverlay =
    lineLeft != null &&
    chartPlotData.length > 0 &&
    (visibleDeviceIds.length > 0 || (showOutdoorLine && activeOutdoor != null));

  return (
    <div className="climate-card flex flex-col gap-0 overflow-hidden p-0">
      <div className="px-2 pt-4">
        <Tabs
          value={chartMetric}
          onValueChange={(v) => onChartMetricChange(v as ChartMetric)}
        >
          <TabsList className="h-10 w-full bg-[#f0f0f0]">
            {availableMetrics.map((metric) => {
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

      {selectionTime != null && showSelectionOverlay && (
        <div className="px-2 pt-3 text-center">
          <p className="text-xs whitespace-nowrap text-muted-foreground">{selectionLabel}</p>
          {activeDeviceValues.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {activeDeviceValues.map((entry) => (
                <p key={entry.deviceId} className="text-lg font-bold" style={{ color: entry.color }}>
                  {entry.name}: {formatMetricValue(entry.value, chartMetric)}
                  {unit}
                </p>
              ))}
            </div>
          )}
          {showOutdoorLine && activeOutdoor != null && (
            <p className="text-xs text-muted-foreground">
              屋外: {formatMetricValue(activeOutdoor, chartMetric)}
              {unit}
            </p>
          )}
        </div>
      )}

      {(visibleDeviceIds.length > 0 || canShowOutdoor) && (
        <div className="flex flex-wrap items-center justify-center gap-3 px-2 pt-2">
          {visibleDeviceIds.map((deviceId) => (
            <div key={deviceId} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: getDeviceLineColor(deviceId) }}
              />
              {deviceNames[deviceId] ?? `デバイス ${deviceId}`}
            </div>
          ))}
          {canShowOutdoor && (
            <button
              type="button"
              onClick={() => setOutdoorVisible((visible) => !visible)}
              aria-pressed={outdoorVisible}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors",
                outdoorVisible
                  ? "bg-[#f0f0f0] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "inline-block h-0 w-4 border-t-2 border-dashed",
                  outdoorVisible ? "border-[#adb5bd]" : "border-muted-foreground/40"
                )}
              />
              屋外
            </button>
          )}
        </div>
      )}

      <div
        ref={chartRef}
        className="relative h-[240px] w-full select-none px-0 pt-1"
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
        ) : !chartPlotData.length || (!visibleDeviceIds.length && !showOutdoorLine) ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            表示範囲内にデータがありません
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" className="pointer-events-none">
            <ComposedChart
              key={`${chartMetric}-${viewRange}-${visibleDeviceIds.join("-")}-${outdoorVisible}`}
              data={chartPlotData}
              margin={{ top: PLOT_INSET.top, right: PLOT_INSET.right, left: 0, bottom: 0 }}
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
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={Y_AXIS_WIDTH}
                tickFormatter={(val) =>
                  chartMetric === "pressure" || chartMetric === "co2"
                    ? String(Math.round(val))
                    : val.toFixed(1)
                }
              />
              {showOutdoorLine && (
                <Line
                  type="linear"
                  dataKey={outdoorKey as string}
                  stroke="#adb5bd"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  name="屋外"
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              {referenceLines}
              {visibleDeviceIds.map((deviceId) => (
                <Line
                  key={deviceId}
                  type="linear"
                  dataKey={deviceMetricKey(deviceId, chartMetric)}
                  stroke={getDeviceLineColor(deviceId)}
                  strokeWidth={3}
                  dot={false}
                  name={deviceNames[deviceId] ?? `デバイス ${deviceId}`}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {showSelectionOverlay && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <p
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-[#888888]"
              style={{ left: lineLeft, top: 4 }}
            >
              {selectionLabel}
            </p>
            <div
              className="absolute w-0 -translate-x-1/2 border-l border-dashed border-[#888888]"
              style={{
                left: lineLeft,
                top: PLOT_INSET.top,
                bottom: PLOT_INSET.bottom,
              }}
            />
            {activeDots.map((entry) => {
              const dotTop =
                entry.plotPosition?.yRatio != null
                  ? `calc(${PLOT_INSET.top}px + ${plotHeightExpr()} * ${entry.plotPosition.yRatio})`
                  : undefined;
              if (!dotTop) return null;
              return (
                <div
                  key={entry.deviceId}
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                  style={{ left: lineLeft, top: dotTop, backgroundColor: entry.color }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="px-2 pb-4 pt-2">
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
