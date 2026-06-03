"use client";

import { Palette, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildDefaultChartColors,
  CHART_COLOR_PALETTE,
  getChartColorConfigItems,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

interface ChartColorSettingsProps {
  open: boolean;
  colors: ChartColorSettings;
  deviceNames: Record<number, string>;
  sensorDeviceIds?: readonly number[];
  outdoorName?: string | null;
  airconName?: string | null;
  onClose: () => void;
  onChange: (colors: ChartColorSettings) => void;
}

export function ChartColorSettings({
  open,
  colors,
  deviceNames,
  sensorDeviceIds,
  outdoorName,
  airconName,
  onClose,
  onChange,
}: ChartColorSettingsProps) {
  if (!open) return null;

  const items = getChartColorConfigItems(
    deviceNames,
    outdoorName,
    airconName,
    sensorDeviceIds
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-[20px] bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">グラフの色</h2>
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
            24色のパレットからグラフとカードの色を選べます。
          </p>

          <div className="space-y-5">
            {items.map((item) => {
              const currentColor = colors[item.key] ?? buildDefaultChartColors()[item.key];

              return (
                <div key={item.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-4 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: currentColor }}
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
                    {CHART_COLOR_PALETTE.map((color) => {
                      const selected = currentColor === color;
                      return (
                        <button
                          key={`${item.key}-${color}`}
                          type="button"
                          onClick={() => onChange({ ...colors, [item.key]: color })}
                          className={cn(
                            "aspect-square rounded-full border transition-transform hover:scale-110",
                            selected
                              ? "border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-card"
                              : "border-black/10"
                          )}
                          style={{ backgroundColor: color }}
                          aria-label={`${item.label}を${color}に設定`}
                          aria-pressed={selected}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl"
            onClick={() => onChange(buildDefaultChartColors())}
          >
            初期色に戻す
          </Button>
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
