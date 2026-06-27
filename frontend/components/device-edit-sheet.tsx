"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { DeviceSettingsCard } from "@/components/device-settings-card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface InheritsFromOption {
  value: number | null;
  label: string;
}

interface DeviceEditSheetProps {
  open: boolean;
  onClose: () => void;
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
  inheritsFromOptions?: InheritsFromOption[];
  inheritsFrom?: number | null;
  onInheritsFromChange?: (value: number | null) => void;
}

export function DeviceEditSheet({
  open,
  onClose,
  icon,
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
}: DeviceEditSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-[20px] bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{title}</h2>
            {subtitle ? (
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {inheritsFromOptions && onInheritsFromChange ? (
            <div className="mb-4 space-y-2">
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
                同じ設置場所でデバイスを交換した場合、グラフで過去データを連続表示します。
              </p>
            </div>
          ) : null}

          <DeviceSettingsCard
            icon={icon}
            accentColor={accentColor}
            title={title}
            subtitle={subtitle}
            nameLabel={nameLabel}
            name={name}
            onNameChange={onNameChange}
            namePlaceholder={namePlaceholder}
            chartColors={chartColors}
            visible={visible}
            onVisibleChange={onVisibleChange}
            visibilityToggles={visibilityToggles}
            visibilityId={visibilityId}
            onSave={onSave}
            saving={saving}
            saveDisabled={saveDisabled}
            error={error}
            footer={footer}
            compact
          />
        </div>
      </div>
    </div>
  );
}
