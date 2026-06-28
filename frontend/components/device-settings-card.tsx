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
  extraContent?: ReactNode;
  chartColors: Array<{
    id: string;
    label: string;
    color: string;
    onChange: (color: string) => void;
  }>;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  visibilityToggles?: Array<{
    id: string;
    label: string;
    description?: string;
    visible: boolean;
    onChange: (visible: boolean) => void;
  }>;
  visibilityId: string;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  error?: string;
  footer?: ReactNode;
  inheritsFromOptions?: Array<{
    value: number | null;
    label: string;
  }>;
  inheritsFrom?: number | null;
  onInheritsFromChange?: (value: number | null) => void;
  /** 編集シート内など、ヘッダーを省略する */
  compact?: boolean;
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
  extraContent,
  chartColors,
  visible,
  onVisibleChange,
  visibilityToggles,
  visibilityId,
  onSave,
  saving = false,
  saveDisabled = false,
  error,
  footer,
  inheritsFromOptions,
  inheritsFrom,
  onInheritsFromChange,
  compact = false,
}: DeviceSettingsCardProps) {
  return (
    <div className={cn(!compact && "rounded-[18px] border bg-card px-4 py-4")}>
      {!compact ? (
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
      ) : null}

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

        {extraContent}

        {chartColors.map((item) => (
          <ChartColorPicker
            key={item.id}
            id={item.id}
            label={item.label}
            color={item.color}
            onChange={item.onChange}
          />
        ))}

        {(visibilityToggles ?? []).map((toggle) => (
          <ChartLineVisibilityToggle
            key={toggle.id}
            id={toggle.id}
            label={toggle.label}
            description={
              toggle.description ??
              "オフにするとセンサーカード・グラフ・日次記録から非表示になります"
            }
            visible={toggle.visible}
            onChange={toggle.onChange}
          />
        ))}

        {!visibilityToggles?.length && visible != null && onVisibleChange ? (
          <ChartLineVisibilityToggle
            id={visibilityId}
            label="ダッシュボードに表示"
            description="オフにするとセンサーカード・グラフ・日次記録から非表示になります"
            visible={visible}
            onChange={onVisibleChange}
          />
        ) : null}

        {footer}

        {inheritsFromOptions && onInheritsFromChange ? (
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor={`${visibilityId}-inherits`}>継承元デバイス</Label>
            <select
              id={`${visibilityId}-inherits`}
              value={inheritsFrom ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                onInheritsFromChange(value === "" ? null : Number(value));
              }}
              className={cn(
                "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              {inheritsFromOptions.map((option) => (
                <option key={option.value ?? "none"} value={option.value ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              同じ設置場所でデバイスを交換した場合、グラフで過去データを連続表示します。場所名は継承チェーン最古のデバイス名が使われます。
            </p>
          </div>
        ) : null}

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
