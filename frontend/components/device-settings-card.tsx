"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChartColorPicker } from "@/components/chart-color-picker";
import { ChartLineVisibilityToggle } from "@/components/chart-line-visibility-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DeviceSettingsCardProps {
  icon: LucideIcon;
  accentColor: string;
  title: string;
  subtitle?: string;
  nameLabel: string;
  name: string;
  onNameChange: (value: string) => void;
  namePlaceholder?: string;
  chartColors: Array<{
    id: string;
    label: string;
    color: string;
    onChange: (color: string) => void;
  }>;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  visibilityId: string;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  error?: string;
  footer?: ReactNode;
}

export function DeviceSettingsCard({
  icon: Icon,
  accentColor,
  title,
  subtitle,
  nameLabel,
  name,
  onNameChange,
  namePlaceholder,
  chartColors,
  visible,
  onVisibleChange,
  visibilityId,
  onSave,
  saving = false,
  saveDisabled = false,
  error,
  footer,
}: DeviceSettingsCardProps) {
  return (
    <div className="rounded-[18px] border bg-card px-4 py-4">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`${visibilityId}-name`}>{nameLabel}</Label>
          <Input
            id={`${visibilityId}-name`}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={namePlaceholder}
            className="rounded-xl"
          />
        </div>

        {chartColors.map((item) => (
          <ChartColorPicker
            key={item.id}
            id={item.id}
            label={item.label}
            color={item.color}
            onChange={item.onChange}
          />
        ))}

        <ChartLineVisibilityToggle
          id={visibilityId}
          label="ダッシュボードに表示"
          description="オフにするとセンサーカード・グラフ・日次記録から非表示になります"
          visible={visible}
          onChange={onVisibleChange}
        />

        {footer}

        {error ? (
          <p className={cn("rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive")}>
            {error}
          </p>
        ) : null}

        <Button
          className="h-10 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90"
          onClick={onSave}
          disabled={saving || saveDisabled}
        >
          {saving ? "保存中..." : "保存する"}
        </Button>
      </div>
    </div>
  );
}
