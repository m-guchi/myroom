"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchPushVapidPublicKey,
  sendTestPushNotification,
  subscribePushNotifications,
  unsubscribePushNotifications,
} from "@/lib/api";
import {
  isPushEnabledLocally,
  isPushNotificationsSupported,
  setPushEnabledLocally,
  subscribeToPushNotifications,
  subscriptionToJson,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";
import { cn } from "@/lib/utils";

interface NotificationSettingsProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationSettings({ open, onClose }: NotificationSettingsProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vapidReady, setVapidReady] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const refreshState = useCallback(async () => {
    setSupported(isPushNotificationsSupported());
    setEnabled(isPushEnabledLocally());
    setInfo("");
    setError("");

    if (!isPushNotificationsSupported()) {
      setInfo("このブラウザまたは環境ではプッシュ通知に対応していません。");
      return;
    }

    setLoading(true);
    try {
      await fetchPushVapidPublicKey();
      setVapidReady(true);
    } catch {
      setVapidReady(false);
      setInfo("サーバー側の Web Push 設定が未完了です（VAPID 鍵）。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refreshState();
      setPassword("");
      setShowPassword(false);
    }
  }, [open, refreshState]);

  const handleEnable = async () => {
    if (!password.trim()) {
      setError("アプリのパスワードを入力してください");
      return;
    }

    setSaving(true);
    setError("");
    setInfo("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("通知の許可が必要です。ブラウザの設定を確認してください。");
        return;
      }

      const { publicKey } = await fetchPushVapidPublicKey();
      const subscription = await subscribeToPushNotifications(publicKey);
      await subscribePushNotifications(password.trim(), subscriptionToJson(subscription));
      setPushEnabledLocally(true);
      setEnabled(true);
      setInfo("プッシュ通知を有効にしました。センサーデータが届かない場合に通知します。");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "有効化に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!password.trim()) {
      setError("アプリのパスワードを入力してください");
      return;
    }

    setSaving(true);
    setError("");
    setInfo("");
    try {
      const subscription = await unsubscribeFromPushNotifications();
      if (subscription) {
        await unsubscribePushNotifications(password.trim(), subscription.endpoint);
      }
      setPushEnabledLocally(false);
      setEnabled(false);
      setInfo("プッシュ通知を無効にしました。");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無効化に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!password.trim()) {
      setError("アプリのパスワードを入力してください");
      return;
    }

    setSaving(true);
    setError("");
    setInfo("");
    try {
      const result = await sendTestPushNotification(password.trim());
      setInfo(
        `テスト通知を送信しました（${result.sent}/${result.total} 件）。数秒以内に届かない場合は端末の通知設定を確認してください。`
      );
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "テスト送信に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-lg"
        role="dialog"
        aria-labelledby="notification-settings-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-primary" strokeWidth={1.75} />
            <h2 id="notification-settings-title" className="text-lg font-semibold">
              通知設定
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
          API 側でセンサーの最終受信を監視し、データが届かない場合に PWA
          へプッシュ通知します。ホーム画面に追加したアプリでも受け取れます。
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <>
            <div className="mb-4 rounded-xl bg-muted/50 px-3 py-2 text-sm">
              状態:{" "}
              <span className={cn(enabled ? "text-emerald-600" : "text-muted-foreground")}>
                {enabled ? "有効" : "無効"}
              </span>
            </div>

            {info && <p className="mb-3 text-sm text-muted-foreground">{info}</p>}
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            {supported && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="notification-password">アプリのパスワード</Label>
                  <div className="relative">
                    <Input
                      id="notification-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="通知の登録・解除に使用"
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" strokeWidth={1.75} />
                      ) : (
                        <Eye className="size-4" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => void handleEnable()}
                    disabled={saving || enabled || !vapidReady}
                  >
                    有効にする
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => void handleDisable()}
                    disabled={saving || !enabled}
                  >
                    無効にする
                  </Button>
                </div>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void handleTest()}
                  disabled={saving || !enabled || !vapidReady}
                >
                  テスト通知を送る
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
