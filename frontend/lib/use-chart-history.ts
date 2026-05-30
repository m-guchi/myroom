"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getViewRangeMs } from "@/lib/chart-utils";
import { fetchHistoryWindow } from "@/lib/api";
import {
  getHistoryChunkMs,
  getHistoryInitialSpanMs,
  getLoadedRange,
  mergeHistoryPoints,
  mergeMultiDeviceHistory,
  toApiDateTime,
} from "@/lib/history-loader";
import type { ChartViewRange, HistoryPoint } from "@/lib/types";

export function useChartHistory(
  deviceIds: readonly number[],
  viewRange: ChartViewRange
) {
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [noMoreOlderData, setNoMoreOlderData] = useState(false);

  const loadedRangeRef = useRef<{ min: number; max: number } | null>(null);
  const loadingOlderRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const deviceIdsKey = deviceIds.join(",");

  const fetchMergedWindow = useCallback(
    async (start: Date, end: Date) => {
      const chunks = await Promise.all(
        deviceIds.map((deviceId) =>
          fetchHistoryWindow(start, end, viewRange, deviceId)
        )
      );
      const byDevice = Object.fromEntries(
        deviceIds.map((deviceId, index) => [deviceId, chunks[index]])
      ) as Record<number, HistoryPoint[]>;
      return mergeMultiDeviceHistory(byDevice);
    },
    [deviceIds, viewRange]
  );

  const resetAndLoad = useCallback(async () => {
    setHistoryLoading(true);
    setNoMoreOlderData(false);
    loadedRangeRef.current = null;

    const end = new Date();
    const start = new Date(end.getTime() - getHistoryInitialSpanMs(viewRange));

    try {
      const chunk = await fetchMergedWindow(start, end);
      setHistoryData(chunk);
      loadedRangeRef.current = getLoadedRange(chunk);
      setHistoryEpoch((epoch) => epoch + 1);
    } catch (err) {
      console.error(err);
      setHistoryData([]);
      loadedRangeRef.current = null;
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchMergedWindow, viewRange]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad, deviceIdsKey]);

  const ensureVisibleRangeLoaded = useCallback(
    async (visibleMin: number, visibleMax: number) => {
      const loaded = loadedRangeRef.current;
      if (!loaded) return;

      const buffer = getViewRangeMs(viewRange) * 0.3;
      const chunkMs = getHistoryChunkMs(viewRange);

      if (
        !noMoreOlderData &&
        visibleMin < loaded.min + buffer &&
        !loadingOlderRef.current
      ) {
        loadingOlderRef.current = true;
        const chunkEnd = new Date(loaded.min - 1000);
        const chunkStart = new Date(chunkEnd.getTime() - chunkMs);

        try {
          const chunk = await fetchMergedWindow(chunkStart, chunkEnd);
          if (!chunk.length) {
            setNoMoreOlderData(true);
          } else {
            setHistoryData((prev) => {
              const merged = mergeHistoryPoints(prev, chunk);
              loadedRangeRef.current = getLoadedRange(merged);
              return merged;
            });
          }
        } catch (err) {
          console.error(err);
        } finally {
          loadingOlderRef.current = false;
        }
      }

      if (visibleMax > loaded.max - buffer && !loadingNewerRef.current) {
        const now = Date.now();
        if (loaded.max >= now - 60000) return;

        loadingNewerRef.current = true;
        const chunkStart = new Date(loaded.max + 1000);
        const chunkEnd = new Date(Math.min(chunkStart.getTime() + chunkMs, now));

        if (chunkEnd.getTime() <= chunkStart.getTime()) {
          loadingNewerRef.current = false;
          return;
        }

        try {
          const chunk = await fetchMergedWindow(chunkStart, chunkEnd);
          if (chunk.length) {
            setHistoryData((prev) => {
              const merged = mergeHistoryPoints(prev, chunk);
              loadedRangeRef.current = getLoadedRange(merged);
              return merged;
            });
          }
        } catch (err) {
          console.error(err);
        } finally {
          loadingNewerRef.current = false;
        }
      }
    },
    [fetchMergedWindow, viewRange, noMoreOlderData]
  );

  return {
    historyData,
    historyLoading,
    historyEpoch,
    noMoreOlderData,
    resetAndLoad,
    ensureVisibleRangeLoaded,
  };
}
