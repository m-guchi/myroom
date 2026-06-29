"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendTestSignalyNotification } from "@/lib/api";

interface WebhookTestProps {
  open: boolean;
  onClose: () => void;
}

type NotificationType = "login" | "sensor-stale" | "sensor-recovered";

const NOTIFICATION_TYPES: { type: NotificationType; label: string; description: string }[] = [
  {
    type: "login",
    label: "ログイン通知",
    description: "ログイン時に届く通知のサンプルを送信します。",
  },
  {
    type: "sensor-stale",
    label: "センサー未到達通知",
    description: "センサーデータが届かない場合に届く通知のサンプルを送信します。",
  },
  {
    type: "sensor-recovered",
    label: "センサー復旧通知",
    description: "センサーデータが復旧した際に届く通知のサンプルを送信します。",
  },
];

export function WebhookTest({ open, onClose }: WebhookTestProps) {
  const [sending, setSending] = useState<NotificationType | null>(null);
  const [results, setResults] = useState<Record<NotificationType, "ok" | "error">>({} as Record<NotificationType, "ok" | "error">);

  if (!open) return null;

  const handleSend = async (type: NotificationType) => {
    setSending(type);
    setResults((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
    try {
      await sendTestSignalyNotification(type);
      setResults((prev) => ({ ...prev, [type]: "ok" }));
    } catch {
      setResults((prev) => ({ ...prev, [type]: "error" }));
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-lg"
        role="dialog"
        aria-labelledby="webhook-test-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Send className="size-5 text-primary" strokeWidth={1.75} />
            <h2 id="webhook-test-title" className="text-lg font-semibold">
              通知テスト
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
            aria-label="閉じる"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Signaly webhook へテスト通知を送信します。各ボタンを押すと、実際の通知と同じ内容が届きます。
        </p>

        <div className="space-y-3">
          {NOTIFICATION_TYPES.map(({ type, label, description }) => (
            <div key={type} className="rounded-xl border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {results[type] === "ok" && (
                  <span className="text-xs text-emerald-600">送信完了</span>
                )}
                {results[type] === "error" && (
                  <span className="text-xs text-destructive">送信失敗</span>
                )}
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{description}</p>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => void handleSend(type)}
                disabled={sending !== null}
              >
                {sending === type ? "送信中..." : "テスト送信"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
