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
import { Droplets, Eye, EyeOff, Gauge, Thermometer, Wind } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AIRCON_CHART_DEVICE_ID,
  AIRCON_TARGET_CHART_KEY,
  ChartMetric,
  CHART_VIEW_RANGE_LABELS,
  ChartViewRange,
  deviceMetricKey,
  deviceTargetMetricKey,
  formatAirconTargetTemperature,
  HistoryPoint,
  isAirconAutoTarget,
  METRIC_COLORS,
  METRIC_LABELS,
  METRIC_UNITS,
} from "@/lib/types";
import {
  clampDomainOffset,
  computeChartDomain,
  computeDomainOffsetForSelectionTime,
  computeVisibleYDomain,
  buildAirconTargetChartSegments,
  type AirconTargetChartSegment,
  downsampleMultiDeviceHistoryForChart,
  filterHistoryForDomain,
  formatActivePointLabel,
  formatChartAxisDate,
  getAvailableChartMetrics,
  getChartTicksForDomain,
  getDeviceMetricValueAtTime,
  getDeviceTargetMetricStateAtTime,
  getDeviceTargetMetricValueAtTime,
  getDevicesWithMetricData,
  getMaxPositiveDomainOffset,
  getOutdoorMetricValueAtTime,
  getSelectionTime,
  hasDeviceMetricData,
  hasDeviceTargetChartData,
  hasDeviceTargetStateData,
  hasOutdoorMetricData,
  isAirconOffAtTime,
  isAggregatedRange,
  withSelectionEndPoints,
} from "@/lib/chart-utils";
import {
  getAirconTargetChartColor,
  getDeviceChartColor,
  getOutdoorChartColor,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import {
  AIRCON_TARGET_VISIBILITY_KEY,
  deviceVisibilityKey,
  isChartLineVisible,
  OUTDOOR_VISIBILITY_KEY,
  type ChartLineVisibilitySettings,
} from "@/lib/chart-line-visibility";
import { cn } from "@/lib/utils";
import type { DisplayOrderItem } from "@/lib/display-order";
import { buildDefaultDisplayOrder, getChartDeviceSeriesOrder } from "@/lib/display-order";

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
  airconTargetDeviceId?: number;
  outdoorLocationName?: string;
  legendOrder?: readonly DisplayOrderItem[];
  chartColors: ChartColorSettings;
  lineVisibility: ChartLineVisibilitySettings;
  onLineVisibilityChange: (key: string, visible: boolean) => void;
}

interface ChartSeriesRow {
  id: string;
  name: string;
  color: string;
  value: number | undefined;
  visible: boolean;
  visibilityKey: string;
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

function formatSeriesRowValue(
  row: ChartSeriesRow,
  metric: ChartMetric,
  unit: string
): string {
  if (row.id === "aircon-target") {
    return formatAirconTargetTemperature(row.value);
  }
  if (row.value == null) {
    return `--${unit}`;
  }
  return `${formatMetricValue(row.value, metric)}${unit}`;
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
  airconTargetDeviceId,
  outdoorLocationName,
  legendOrder,
  chartColors,
  lineVisibility,
  onLineVisibilityChange,
}: EnvironmentChartProps) {
  const resolvedLegendOrder = legendOrder ?? buildDefaultDisplayOrder(deviceIds.filter(
    (id) => id !== AIRCON_CHART_DEVICE_ID
  ));
  const deviceSeriesOrder = useMemo(
    () => getChartDeviceSeriesOrder([...resolvedLegendOrder]),
    [resolvedLegendOrder]
  );
  const airconTargetColor = getAirconTargetChartColor(chartColors);
  const outdoorLineColor = getOutdoorChartColor(chartColors);
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
  const showAirconTargetLine =
    chartMetric === "temperature" &&
    airconTargetDeviceId != null &&
    hasDeviceTargetStateData(historyData, airconTargetDeviceId);
  const showOutdoorLine =
    canShowOutdoor && isChartLineVisible(lineVisibility, OUTDOOR_VISIBILITY_KEY);
  const showTargetLine =
    showAirconTargetLine &&
    airconTargetDeviceId != null &&
    hasDeviceTargetChartData(historyData, airconTargetDeviceId) &&
    isChartLineVisible(lineVisibility, AIRCON_TARGET_VISIBILITY_KEY);
  const targetDeviceIds =
    showTargetLine && airconTargetDeviceId != null
      ? ([airconTargetDeviceId] as const)
      : undefined;

  const plottedDeviceIds = useMemo(
    () =>
      visibleDeviceIds.filter((deviceId) =>
        isChartLineVisible(lineVisibility, deviceVisibilityKey(deviceId))
      ),
    [visibleDeviceIds, lineVisibility]
  );

  const orderedPlottedDeviceIds = useMemo(() => {
    const preferred = deviceSeriesOrder.filter((deviceId) =>
      plottedDeviceIds.includes(deviceId)
    );
    const rest = plottedDeviceIds.filter((deviceId) => !preferred.includes(deviceId));
    return [...preferred, ...rest];
  }, [deviceSeriesOrder, plottedDeviceIds]);

  const isDeviceLineVisible = useCallback(
    (deviceId: number) =>
      isChartLineVisible(lineVisibility, deviceVisibilityKey(deviceId)),
    [lineVisibility]
  );

  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [domainOffset, setDomainOffset] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const dragDomainRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const preservedSelectionTimeRef = useRef<number | null>(null);

  useEffect(() => {
    dragDomainRef.current = domainOffset;
  }, [domainOffset]);

  useEffect(() => {
    const preserved = preservedSelectionTimeRef.current;
    const nextOffset =
      preserved != null && historyData.length
        ? computeDomainOffsetForSelectionTime(historyData, viewRange, preserved, {
            allowPastExtension: !noMoreOlderData,
            noMoreOlderData,
          })
        : getMaxPositiveDomainOffset(viewRange);
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

  const scheduleDomainOffset = useCallback(
    (nextOffset: number) => {
      dragDomainRef.current = nextOffset;
      if (historyData.length) {
        const domain = computeChartDomain(historyData, viewRange, nextOffset);
        const t = getSelectionTime(historyData, domain);
        if (t != null) preservedSelectionTimeRef.current = t;
      }
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        setDomainOffset(dragDomainRef.current);
        rafRef.current = null;
      });
    },
    [historyData, viewRange]
  );

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
        plottedDeviceIds,
        showOutdoorLine,
        targetDeviceIds
      ),
    [historyData, currentDomain, chartMetric, aggregated, plottedDeviceIds, showOutdoorLine, targetDeviceIds]
  );

  const historySource = useMemo(() => {
    const visible = filterHistoryForDomain(historyData, currentDomain);
    return visible.length > 0 ? visible : historyData;
  }, [historyData, currentDomain]);

  const chartPlotData = useMemo(() => {
    if (!historyData.length) return [];

    const source = historySource;
    const base = aggregated
      ? source
      : downsampleMultiDeviceHistoryForChart(
          source,
          chartMetric,
          320,
          plottedDeviceIds
        );

    return withSelectionEndPoints(
      base,
      selectionTime,
      plottedDeviceIds,
      chartMetric,
      showOutdoorLine,
      targetDeviceIds
    );
  }, [
    historyData,
    historySource,
    chartMetric,
    aggregated,
    plottedDeviceIds,
    selectionTime,
    showOutdoorLine,
    targetDeviceIds,
  ]);

  const airconTargetSegments = useMemo(() => {
    if (!showTargetLine || airconTargetDeviceId == null || chartMetric !== "temperature") {
      return [] as AirconTargetChartSegment[];
    }

    const source = historySource;
    const maxPoints = aggregated ? 0 : 320;
    let segments = buildAirconTargetChartSegments(source, airconTargetDeviceId, maxPoints);

    if (selectionTime != null) {
      const state = getDeviceTargetMetricStateAtTime(
        source,
        airconTargetDeviceId,
        selectionTime
      );
      if (
        state != null &&
        !isAirconOffAtTime(source, airconTargetDeviceId, selectionTime)
      ) {
        const isAuto = isAirconAutoTarget(state);
        const value = isAuto
          ? getDeviceMetricValueAtTime(
              source,
              airconTargetDeviceId,
              "temperature",
              selectionTime
            )
          : getDeviceTargetMetricValueAtTime(
              source,
              airconTargetDeviceId,
              selectionTime
            );

        if (value != null) {
          segments = segments.map((segment) => {
            if (segment.auto !== isAuto) return segment;
            if (segment.points.some((point) => point.datetimeObj === selectionTime)) {
              return segment;
            }
            const first = segment.points[0]?.datetimeObj;
            const last = segment.points[segment.points.length - 1]?.datetimeObj;
            if (first == null || last == null) return segment;
            if (selectionTime < first || selectionTime > last) return segment;
            return {
              ...segment,
              points: [
                ...segment.points,
                { datetimeObj: selectionTime, airconTarget: value },
              ].sort((a, b) => a.datetimeObj - b.datetimeObj),
            };
          });
        }
      }
    }

    return segments;
  }, [
    showTargetLine,
    airconTargetDeviceId,
    chartMetric,
    historySource,
    aggregated,
    selectionTime,
  ]);

  const airconTargetPointCount = airconTargetSegments.reduce(
    (count, segment) => count + segment.points.length,
    0
  );

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
    return orderedPlottedDeviceIds
      .map((deviceId) => ({
        deviceId,
        name: deviceNames[deviceId] ?? `デバイス ${deviceId}`,
        value: getDeviceMetricValueAtTime(
          chartPlotData,
          deviceId,
          chartMetric,
          selectionTime
        ),
        color: getDeviceChartColor(chartColors, deviceId),
      }))
      .filter((entry) => entry.value != null);
  }, [selectionTime, orderedPlottedDeviceIds, deviceNames, chartMetric, chartPlotData, chartColors]);

  const activeOutdoor = useMemo(() => {
    if (selectionTime == null) return undefined;
    return getOutdoorMetricValueAtTime(chartPlotData, chartMetric, selectionTime);
  }, [selectionTime, chartPlotData, chartMetric]);

  const activeTargetState = useMemo(() => {
    if (
      selectionTime == null ||
      !showAirconTargetLine ||
      airconTargetDeviceId == null
    ) {
      return undefined;
    }
    return getDeviceTargetMetricStateAtTime(
      historySource,
      airconTargetDeviceId,
      selectionTime
    );
  }, [selectionTime, showAirconTargetLine, airconTargetDeviceId, historySource]);

  const chartSeriesRows = useMemo((): ChartSeriesRow[] => {
    const rows: ChartSeriesRow[] = [];

    for (const item of resolvedLegendOrder) {
      if (item.type === "device" || item.type === "aircon") {
        const deviceId =
          item.type === "device" ? item.deviceId : AIRCON_CHART_DEVICE_ID;
        if (!deviceIds.includes(deviceId)) continue;
        if (!hasDeviceMetricData(historyData, deviceId, chartMetric)) continue;

        rows.push({
          id: `device-${deviceId}`,
          name: deviceNames[deviceId] ?? `デバイス ${deviceId}`,
          color: getDeviceChartColor(chartColors, deviceId),
          value:
            selectionTime == null
              ? undefined
              : getDeviceMetricValueAtTime(
                  chartPlotData,
                  deviceId,
                  chartMetric,
                  selectionTime
                ),
          visible: isDeviceLineVisible(deviceId),
          visibilityKey: deviceVisibilityKey(deviceId),
        });

        if (
          deviceId === airconTargetDeviceId &&
          showAirconTargetLine &&
          airconTargetDeviceId != null
        ) {
          rows.push({
            id: "aircon-target",
            name: `${deviceNames[airconTargetDeviceId] ?? "エアコン"}（設定温度）`,
            color: airconTargetColor,
            value: activeTargetState,
            visible: isChartLineVisible(lineVisibility, AIRCON_TARGET_VISIBILITY_KEY),
            visibilityKey: AIRCON_TARGET_VISIBILITY_KEY,
          });
        }
        continue;
      }

      if (item.type === "outdoor" && canShowOutdoor) {
        rows.push({
          id: "outdoor",
          name: outdoorLocationName ?? "屋外",
          color: outdoorLineColor,
          value: activeOutdoor,
          visible: isChartLineVisible(lineVisibility, OUTDOOR_VISIBILITY_KEY),
          visibilityKey: OUTDOOR_VISIBILITY_KEY,
        });
      }
    }

    return rows;
  }, [
    resolvedLegendOrder,
    deviceIds,
    historyData,
    chartMetric,
    deviceNames,
    selectionTime,
    chartPlotData,
    isDeviceLineVisible,
    airconTargetDeviceId,
    showAirconTargetLine,
    activeTargetState,
    airconTargetColor,
    canShowOutdoor,
    chartColors,
    outdoorLineColor,
    outdoorLocationName,
    activeOutdoor,
    lineVisibility,
  ]);

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
    if (historyData.length && currentDomain[0] !== "dataMin") {
      const t = getSelectionTime(historyData, currentDomain);
      if (t != null) preservedSelectionTimeRef.current = t;
    }
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
    (plottedDeviceIds.length > 0 ||
      (showOutdoorLine && activeOutdoor != null) ||
      (showAirconTargetLine && activeTargetState != null));

  const hasPlottedLines =
    plottedDeviceIds.length > 0 ||
    showOutdoorLine ||
    airconTargetPointCount > 0;

  return (
    <div className="climate-card flex flex-col gap-0 overflow-hidden p-0">
      <div className="px-2 pt-4">
        <Tabs
          value={chartMetric}
          onValueChange={(v) => onChartMetricChange(v as ChartMetric)}
        >
          <TabsList className="h-10 w-full">
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

      {chartSeriesRows.length > 0 && (
        <div className="px-3 pt-3">
          {selectionTime != null && (
            <p className="mb-2 text-center text-xs whitespace-nowrap text-muted-foreground">
              {selectionLabel}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {chartSeriesRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-1">
                <p
                  className={cn(
                    "min-w-0 flex-1 text-lg font-bold",
                    !row.visible && "opacity-40"
                  )}
                  style={{ color: row.color }}
                >
                  {row.name}: {formatSeriesRowValue(row, chartMetric, unit)}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onLineVisibilityChange(row.visibilityKey, !row.visible)
                  }
                  aria-pressed={row.visible}
                  aria-label={`${row.name}の表示切替`}
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {row.visible ? (
                    <Eye className="size-5" strokeWidth={1.75} />
                  ) : (
                    <EyeOff className="size-5" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            ))}
          </div>
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
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm">
            <div className="size-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
            読み込み中
          </div>
        )}

        {!historyData.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <p>データがありません</p>
            <p className="text-[10px] opacity-70">バックエンドが起動しているか確認してください</p>
          </div>
        ) : !chartPlotData.length || !hasPlottedLines ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            表示する項目を選択してください
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" className="pointer-events-none">
            <ComposedChart
              key={`${chartMetric}-${viewRange}-${plottedDeviceIds.join("-")}-${showOutdoorLine}-${showTargetLine}`}
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
                  stroke={outdoorLineColor}
                  strokeWidth={1.5}
                  dot={false}
                  name="屋外"
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              {referenceLines}
              {orderedPlottedDeviceIds.map((deviceId) => (
                <Line
                  key={deviceId}
                  type="linear"
                  dataKey={deviceMetricKey(deviceId, chartMetric)}
                  stroke={getDeviceChartColor(chartColors, deviceId)}
                  strokeWidth={1.5}
                  dot={false}
                  name={deviceNames[deviceId] ?? `デバイス ${deviceId}`}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              {airconTargetSegments.map((segment, index) =>
                segment.points.length > 0 ? (
                  <Line
                    key={`aircon-target-${segment.auto ? "auto" : "fixed"}-${index}`}
                    data={segment.points}
                    type="linear"
                    dataKey={AIRCON_TARGET_CHART_KEY}
                    stroke={airconTargetColor}
                    strokeWidth={1.5}
                    strokeDasharray={segment.auto ? "6 4" : undefined}
                    dot={false}
                    name={index === 0 ? "設定温度" : undefined}
                    legendType={index === 0 ? "line" : "none"}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ) : null
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {showSelectionOverlay && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <p
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-muted-foreground"
              style={{ left: lineLeft, top: 4 }}
            >
              {selectionLabel}
            </p>
            <div
              className="absolute w-0 -translate-x-1/2 border-l border-dashed border-muted-foreground"
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
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
                  style={{ left: lineLeft, top: dotTop, backgroundColor: entry.color }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="px-2 pb-4 pt-2">
        <div className="flex rounded-lg border bg-muted p-0.5">
          {VIEW_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => handleViewRangeChange(range)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-all",
                viewRange === range
                  ? "bg-background text-foreground shadow-sm"
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
