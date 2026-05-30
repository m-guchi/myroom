"use client";

import { cn } from "@/lib/utils";

interface ComfortGaugeProps {
  value: number;
}

export function ComfortGauge({ value }: ComfortGaugeProps) {
  const min = 40;
  const max = 90;
  const clampedValue = Math.min(Math.max(value, min), max);
  const pos = ((clampedValue - min) / (max - min)) * 100;

  return (
    <div className="mx-auto mb-3 mt-10 w-full">
      <div className="relative mb-1.5 h-5 overflow-visible rounded-full bg-black/5 dark:bg-white/10">
        <div className="absolute left-0 h-full w-[40%] rounded-l-full bg-[#3498db]/20" />
        <div className="absolute left-[40%] h-full w-[30%] bg-[#2ecc71]/20" />
        <div className="absolute left-[70%] h-full w-[30%] rounded-r-full bg-[#e74c3c]/20" />

        <div
          className="absolute top-0 z-10 flex h-full flex-col items-center justify-center transition-[left] duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
        >
          <div className="absolute bottom-full mb-0.5 flex flex-col items-center">
            <span className="mb-[-2px] whitespace-nowrap text-base font-extrabold">
              {value.toFixed(1)}
            </span>
            <div className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-foreground" />
          </div>
          <div className="h-8 w-1 rounded-sm bg-foreground shadow-sm" />
        </div>
      </div>
      <div className="flex justify-between px-1">
        {["寒", "快適", "暑"].map((label) => (
          <span
            key={label}
            className="text-xs font-semibold text-muted-foreground opacity-50"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
