"use client";

import { ArrowDown, ArrowUp, ListOrdered, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDisplayOrderLabel,
  type DisplayOrderItem,
} from "@/lib/display-order";
import {
  getDeviceChartColor,
  getOutdoorChartColor,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import { AIRCON_CHART_DEVICE_ID } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DisplayOrderSettingsProps {
  open: boolean;
  order: DisplayOrderItem[];
  deviceNames: Record<number, string>;
  outdoorName?: string | null;
  airconName?: string | null;
  chartColors: ChartColorSettings;
  onClose: () => void;
  onChange: (order: DisplayOrderItem[]) => void;
}

function getItemAccentColor(
  item: DisplayOrderItem,
  chartColors: ChartColorSettings
): string | undefined {
  if (item.type === "device") return getDeviceChartColor(chartColors, item.deviceId);
  if (item.type === "aircon") return getDeviceChartColor(chartColors, AIRCON_CHART_DEVICE_ID);
  return getOutdoorChartColor(chartColors);
}

export function DisplayOrderSettings({
  open,
  order,
  deviceNames,
  outdoorName,
  airconName,
  chartColors,
  onClose,
  onChange,
}: DisplayOrderSettingsProps) {
  if (!open) return null;

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-[20px] bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <ListOrdered className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">表示順</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full hover:bg-accent"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-muted-foreground">
            センサーカードとグラフ凡例の表示順を変更できます。
          </p>
          <div className="space-y-2">
            {order.map((item, index) => {
              const label = getDisplayOrderLabel(
                item,
                deviceNames,
                outdoorName,
                airconName
              );
              const accentColor = getItemAccentColor(item, chartColors);

              return (
                <div
                  key={`${item.type}-${item.type === "device" ? item.deviceId : item.type}`}
                  className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-colors",
                        index === 0
                          ? "text-muted-foreground/30"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                      aria-label={`${label}を上へ`}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === order.length - 1}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-colors",
                        index === order.length - 1
                          ? "text-muted-foreground/30"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                      aria-label={`${label}を下へ`}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t px-5 py-4">
          <Button
            className="h-11 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90"
            onClick={onClose}
          >
            完了
          </Button>
        </div>
      </div>
    </div>
  );
}
