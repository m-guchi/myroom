"use client";

import { useCallback, useEffect, useState } from "react";
import { Snowflake, X } from "lucide-react";
import { ChartLineVisibilityToggle } from "@/components/chart-line-visibility-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAirconUnits, updateAirconUnitName } from "@/lib/api";
import { AirconUnitInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AirconNameSettingsProps {
  open: boolean;
  acId: number;
  roomChartLineVisible: boolean;
  targetChartLineVisible: boolean;
  onRoomChartLineVisibleChange: (visible: boolean) => void;
  onTargetChartLineVisibleChange: (visible: boolean) => void;
  onClose: () => void;
  onSaved: (unit: AirconUnitInfo) => void;
}

export function AirconNameSettings({
  open,
  acId,
  roomChartLineVisible,
  targetChartLineVisible,
  onRoomChartLineVisibleChange,
  onTargetChartLineVisibleChange,
  onClose,
  onSaved,
}: AirconNameSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const units = await fetchAirconUnits();
      const unit = units.find((item) => item.ac_id === acId);
      setName(unit?.name ?? `エアコン ${acId}`);
    } catch {
      setError("現在の設定を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, [acId]);

  useEffect(() => {
    if (open) {
      loadCurrent();
      setError("");
    }
  }, [open, loadCurrent]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("表示名を入力してください");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const saved = await updateAirconUnitName(acId, name.trim());
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[20px] bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Snowflake className="size-5 text-[#1abc9c]" />
            <h2 className="text-lg font-bold">エアコンの設定</h2>
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

        <p className="mb-4 text-sm text-muted-foreground">
          表示名と環境グラフでの表示有無を設定します。
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aircon-id">エアコン ID</Label>
              <Input
                id="aircon-id"
                value={String(acId)}
                readOnly
                className="rounded-xl bg-muted text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aircon-name">表示名</Label>
              <Input
                id="aircon-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: リビング, 寝室"
                className="rounded-xl"
              />
            </div>

            <ChartLineVisibilityToggle
              id={`aircon-${acId}-room-chart-visible`}
              label="現在値（室温）"
              description=""
              visible={roomChartLineVisible}
              onChange={onRoomChartLineVisibleChange}
            />

            <ChartLineVisibilityToggle
              id={`aircon-${acId}-target-chart-visible`}
              label="設定温度"
              description=""
              visible={targetChartLineVisible}
              onChange={onTargetChartLineVisibleChange}
            />

            <p className="text-xs text-muted-foreground">
              画面を開いたときのグラフ表示（凡例での切り替えは次回起動まで保持されません）
            </p>

            {error && (
              <p className={cn("rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive")}>
                {error}
              </p>
            )}

            <Button
              className="h-11 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存する"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
