"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { ChartColorPicker } from "@/components/chart-color-picker";
import { ChartLineVisibilityToggle } from "@/components/chart-line-visibility-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchOutdoorLocation,
  searchOutdoorLocations,
  updateOutdoorLocation,
} from "@/lib/api";
import { OutdoorLocation, OutdoorLocationSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface OutdoorLocationSettingsProps {
  open: boolean;
  chartColor: string;
  onChartColorChange: (color: string) => void;
  chartLineVisible: boolean;
  onChartLineVisibleChange: (visible: boolean) => void;
  onClose: () => void;
  onSaved: (location: OutdoorLocation) => void;
}

export function OutdoorLocationSettings({
  open,
  chartColor,
  onChartColorChange,
  chartLineVisible,
  onChartLineVisibleChange,
  onClose,
  onSaved,
}: OutdoorLocationSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OutdoorLocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loc = await fetchOutdoorLocation();
      setName(loc.name);
      setLatitude(String(loc.latitude));
      setLongitude(String(loc.longitude));
    } catch {
      setError("現在の設定を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadCurrent();
      setSearchQuery("");
      setSearchResults([]);
      setError("");
    }
  }, [open, loadCurrent]);

  useEffect(() => {
    if (!open) return;

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchOutdoorLocations(q);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, open]);

  const selectResult = (result: OutdoorLocationSearchResult) => {
    setName(result.name);
    setLatitude(String(result.latitude));
    setLongitude(String(result.longitude));
    setSearchResults([]);
    setSearchQuery(result.label);
  };

  const handleSave = async () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!name.trim()) {
      setError("地点名を入力してください");
      return;
    }
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setError("緯度が正しくありません");
      return;
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
      setError("経度が正しくありません");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const saved = await updateOutdoorLocation({
        name: name.trim(),
        latitude: lat,
        longitude: lon,
      });
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
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[20px] bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">屋外の地点</h2>
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
          地点、グラフの色、表示有無を設定します。
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location-search">地名で検索</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="location-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="例: 大阪, 渋谷, 札幌"
                  className="rounded-xl pl-9"
                />
              </div>
              {searching && (
                <p className="text-xs text-muted-foreground">検索中...</p>
              )}
              {searchResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-xl border bg-muted">
                  {searchResults.map((result) => (
                    <li key={`${result.latitude}-${result.longitude}-${result.label}`}>
                      <button
                        type="button"
                        onClick={() => selectResult(result)}
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent"
                      >
                        <span className="font-medium">{result.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-name">地点名</Label>
              <Input
                id="location-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="location-lat">緯度</Label>
                <Input
                  id="location-lat"
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location-lon">経度</Label>
                <Input
                  id="location-lon"
                  inputMode="decimal"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <ChartColorPicker
              id="outdoor-chart-color"
              label="グラフの色"
              color={chartColor}
              onChange={onChartColorChange}
            />

            <ChartLineVisibilityToggle
              id="outdoor-chart-visible"
              visible={chartLineVisible}
              onChange={onChartLineVisibleChange}
            />

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
