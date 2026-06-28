"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { DeviceSettingsCard } from "@/components/device-settings-card";

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
          <DeviceSettingsCard
            icon={icon}
            accentColor={accentColor}
            title={title}
            subtitle={subtitle}
            nameLabel={nameLabel}
            name={name}
            onNameChange={onNameChange}
            namePlaceholder={namePlaceholder}
            extraContent={extraContent}
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
            inheritsFromOptions={inheritsFromOptions}
            inheritsFrom={inheritsFrom}
            onInheritsFromChange={onInheritsFromChange}
            compact
          />
        </div>
      </div>
    </div>
  );
}
