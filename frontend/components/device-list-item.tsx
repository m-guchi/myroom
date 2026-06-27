"use client";

import type { LucideIcon } from "lucide-react";
import { GripVertical, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DeviceListItemProps {
  icon: LucideIcon;
  accentColor: string;
  title: string;
  subtitle?: string;
  visible: boolean;
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
        {!visible ? (
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
