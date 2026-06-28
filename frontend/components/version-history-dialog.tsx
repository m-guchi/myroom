"use client";

import { X } from "lucide-react";
import { APP_CHANGELOG, formatChangelogDate } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/app-version";
import { cn } from "@/lib/utils";

interface VersionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function VersionHistoryDialog({ open, onClose }: VersionHistoryDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-[20px] bg-card shadow-lg sm:rounded-[20px]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">更新履歴</h2>
            <p className="text-xs text-muted-foreground">現在: v{APP_VERSION}</p>
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
          <div className="space-y-5">
            {APP_CHANGELOG.map((entry) => {
              const isCurrent = entry.version === APP_VERSION;
              return (
                <div key={entry.version}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3
                      className={cn(
                        "text-sm font-bold",
                        isCurrent ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      v{entry.version}
                    </h3>
                    {entry.date && (
                      <span className="text-xs text-muted-foreground">
                        {formatChangelogDate(entry.date)}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                        現在
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {entry.changes.map((change) => (
                      <li
                        key={change}
                        className="flex gap-2 text-sm text-muted-foreground before:mt-2 before:size-1 before:shrink-0 before:rounded-full before:bg-muted-foreground/50 before:content-['']"
                      >
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
