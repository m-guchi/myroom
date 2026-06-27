"use client";

import type { LucideIcon } from "lucide-react";
import { GripVertical, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DeviceListItemTrack {
  label: string;
  color: string;
  visible: boolean;
}

interface DeviceListItemProps {
  icon: LucideIcon;
  accentColor: string;
  title: string;
  subtitle?: string;
  visible: boolean;
  /** エアコンなど、色・表示が複数ある項目向け */
  tracks?: DeviceListItemTrack[];
  onEdit: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragOver?: boolean;
}

export function DeviceListItem({
  icon: Icon,
  accentColor,
  title,
  subtitle,
  visible,
  tracks,
  onEdit,
  draggable = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver = false,
}: DeviceListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[18px] border bg-card px-3 py-3 transition-colors",
        !visible && "opacity-50",
        isDragOver && "border-foreground/30 bg-accent/40"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className={cn(
          "flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing",
          !draggable && "invisible"
        )}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-label="順番を変更"
      >
        <GripVertical className="size-4" strokeWidth={1.75} />
      </button>

      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", !visible && "text-muted-foreground")}>
          {title}
        </p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
        {tracks && tracks.length > 0 ? (
          <div className="mt-1.5 flex flex-col gap-1">
            {tracks.map((track) => (
              <div key={track.label} className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/15"
                  style={{ backgroundColor: track.color }}
                  aria-hidden
                />
                <span className="truncate text-xs text-muted-foreground">{track.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    track.visible
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {track.visible ? "表示" : "非表示"}
                </span>
              </div>
            ))}
          </div>
        ) : !visible ? (
          <p className="text-xs text-muted-foreground">非表示</p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 shrink-0 rounded-xl px-3"
        onClick={onEdit}
        aria-label={`${title}を編集`}
      >
        <Pencil className="size-4" strokeWidth={1.75} />
        編集
      </Button>
    </div>
  );
}
