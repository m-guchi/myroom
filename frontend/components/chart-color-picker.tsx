"use client";

import { CHART_COLOR_PALETTE } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

interface ChartColorPickerProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
  id?: string;
}

export function ChartColorPicker({
  label,
  color,
  onChange,
  id,
}: ChartColorPickerProps) {
  return (
    <div className="space-y-2 rounded-xl border bg-background/60 px-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className="size-4 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
        {CHART_COLOR_PALETTE.map((paletteColor) => {
          const selected = color === paletteColor;
          return (
            <button
              key={paletteColor}
              type="button"
              onClick={() => onChange(paletteColor)}
              className={cn(
                "aspect-square rounded-full border transition-transform hover:scale-110",
                selected
                  ? "border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-card"
                  : "border-black/10"
              )}
              style={{ backgroundColor: paletteColor }}
              aria-label={`${label}を${paletteColor}に設定`}
              aria-pressed={selected}
            />
          );
        })}
      </div>
    </div>
  );
}
