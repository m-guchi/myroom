"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CloudSun,
  LayoutGrid,
  Snowflake,
  Thermometer,
} from "lucide-react";
import { LoginScreen } from "@/components/login-screen";
import { DeviceSettingsCard } from "@/components/device-settings-card";
import {
  fetchAirconUnits,
  fetchDevices,
  fetchOutdoorLocation,
  login,
  updateAirconUnitName,
  updateDeviceName,
  updateOutdoorLocation,
} from "@/lib/api";
import {
  AIRCON_TARGET_COLOR_KEY,
  buildDefaultChartColors,
  CHART_COLORS_CHANGED_EVENT,
  deviceColorKey,
  getAirconTargetChartColor,
  getDeviceChartColor,
  getOutdoorChartColor,
  loadChartColors,
  saveChartColors,
  setChartColor,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import {
  getDisplayOrderLabel,
  type DisplayOrderItem,
} from "@/lib/display-order";
import {
  AIRCON_CHART_DEVICE_ID,
  getSensorDeviceIds,
  type AirconUnitInfo,
  type DeviceInfo,
  type OutdoorLocation,
} from "@/lib/types";
import {
  isTargetVisible,
  loadHiddenDeviceKeys,
  saveHiddenDeviceKeys,
  setTargetVisible,
  VISIBLE_DEVICES_CHANGED_EVENT,
} from "@/lib/visible-devices";

const AUTH_KEY = "app_auth";

function draftKeyForItem(item: DisplayOrderItem, acId = 1): string {
  if (item.type === "device") return `device:${item.deviceId}`;
  if (item.type === "aircon") return `aircon:${acId}`;
  return "outdoor";
}

export function DeviceVisibilityPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [airconUnits, setAirconUnits] = useState<AirconUnitInfo[]>([]);
  const [outdoorLocation, setOutdoorLocation] = useState<OutdoorLocation | null>(null);
  const [chartColors, setChartColors] = useState<ChartColorSettings>(() =>
    buildDefaultChartColors()
  );
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const sensorDeviceIds = useMemo(() => getSensorDeviceIds(devices), [devices]);
  const sensorDeviceIdsKey = sensorDeviceIds.join(",");
  const primaryAirconId = airconUnits[0]?.ac_id ?? 1;

  const deviceNames = useMemo(() => {
    const names: Record<number, string> = {};
    for (const device of devices) {
      names[device.id] = device.name;
    }
    return names;
  }, [devices]);

  const airconName =
    airconUnits.find((unit) => unit.ac_id === primaryAirconId)?.name ?? "エアコン";

  const sensorTargets = useMemo(
    () => sensorDeviceIds.map((deviceId) => ({ type: "device" as const, deviceId })),
    [sensorDeviceIds]
  );

  const reloadVisibility = useCallback(() => {
    setHiddenKeys(loadHiddenDeviceKeys(sensorDeviceIds));
  }, [sensorDeviceIds]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [deviceList, units, outdoor] = await Promise.all([
        fetchDevices(),
        fetchAirconUnits(),
        fetchOutdoorLocation().catch(() => null),
      ]);
      setDevices(deviceList);
      setAirconUnits(units);
      setOutdoorLocation(outdoor);
    } catch {
      setDevices([]);
      setAirconUnits([]);
      setOutdoorLocation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem(AUTH_KEY) === "true") {
      setIsAuthenticated(true);
    }
    setChartColors(loadChartColors());
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadData();
  }, [isAuthenticated, loadData]);

  useEffect(() => {
    reloadVisibility();
  }, [reloadVisibility, sensorDeviceIdsKey]);

  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const device of devices) {
      drafts[`device:${device.id}`] = device.name;
    }
    for (const unit of airconUnits) {
      drafts[`aircon:${unit.ac_id}`] = unit.name;
    }
    if (outdoorLocation) {
      drafts.outdoor = outdoorLocation.name;
    }
    setNameDrafts(drafts);
  }, [devices, airconUnits, outdoorLocation]);

  const handleLogin = async (password: string) => {
    const ok = await login(password);
    if (ok) {
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_KEY, "true");
      return true;
    }
    return false;
  };

  const handleVisibilityChange = (item: DisplayOrderItem, visible: boolean) => {
    const next = setTargetVisible(hiddenKeys, item, visible);
    setHiddenKeys(next);
    saveHiddenDeviceKeys(next);
    window.dispatchEvent(new Event(VISIBLE_DEVICES_CHANGED_EVENT));
  };

  const handleColorChange = (key: string, color: string) => {
    setChartColors((prev) => {
      const next = setChartColor(prev, key, color);
      saveChartColors(next);
      return next;
    });
    window.dispatchEvent(new Event(CHART_COLORS_CHANGED_EVENT));
  };

  const setDraft = (key: string, value: string) => {
    setNameDrafts((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveDeviceName = async (deviceId: number) => {
    const key = `device:${deviceId}`;
    const name = nameDrafts[key]?.trim();
    if (!name) {
      setErrors((prev) => ({ ...prev, [key]: "表示名を入力してください" }));
      return;
    }

    setSavingKey(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const saved = await updateDeviceName(deviceId, name);
      setDevices((prev) =>
        prev.map((device) => (device.id === deviceId ? saved : device))
      );
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "保存に失敗しました",
      }));
    } finally {
      setSavingKey(null);
    }
  };

  const saveAirconName = async (acId: number) => {
    const key = `aircon:${acId}`;
    const name = nameDrafts[key]?.trim();
    if (!name) {
      setErrors((prev) => ({ ...prev, [key]: "表示名を入力してください" }));
      return;
    }

    setSavingKey(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const saved = await updateAirconUnitName(acId, name);
      setAirconUnits((prev) =>
        prev.map((unit) => (unit.ac_id === acId ? saved : unit))
      );
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "保存に失敗しました",
      }));
    } finally {
      setSavingKey(null);
    }
  };

  const saveOutdoorName = async () => {
    const key = "outdoor";
    const name = nameDrafts[key]?.trim();
    if (!outdoorLocation) {
      setErrors((prev) => ({ ...prev, [key]: "屋外地点が読み込めていません" }));
      return;
    }
    if (!name) {
      setErrors((prev) => ({ ...prev, [key]: "表示名を入力してください" }));
      return;
    }

    setSavingKey(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const saved = await updateOutdoorLocation({
        ...outdoorLocation,
        name,
      });
      setOutdoorLocation(saved);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "保存に失敗しました",
      }));
    } finally {
      setSavingKey(null);
    }
  };

  const getAccentColor = (item: DisplayOrderItem) => {
    if (item.type === "device") return getDeviceChartColor(chartColors, item.deviceId);
    if (item.type === "aircon") {
      return getDeviceChartColor(chartColors, AIRCON_CHART_DEVICE_ID);
    }
    return getOutdoorChartColor(chartColors);
  };

  const renderSensorCard = (item: Extract<DisplayOrderItem, { type: "device" }>) => {
    const key = draftKeyForItem(item);
    const label = getDisplayOrderLabel(item, deviceNames, "屋外", airconName);

    return (
      <DeviceSettingsCard
        key={key}
        icon={Thermometer}
        accentColor={getAccentColor(item)}
        title={label}
        subtitle={`デバイス ID: ${item.deviceId}`}
        nameLabel="表示名"
        name={nameDrafts[key] ?? label}
        onNameChange={(value) => setDraft(key, value)}
        namePlaceholder="例: リビング"
        chartColors={[
          {
            id: `${key}-color`,
            label: "グラフの色",
            color: getDeviceChartColor(chartColors, item.deviceId),
            onChange: (color) => handleColorChange(deviceColorKey(item.deviceId), color),
          },
        ]}
        visible={isTargetVisible(hiddenKeys, item)}
        onVisibleChange={(visible) => handleVisibilityChange(item, visible)}
        visibilityId={`visible-${key}`}
        onSave={() => void saveDeviceName(item.deviceId)}
        saving={savingKey === key}
        error={errors[key]}
      />
    );
  };

  const renderOutdoorCard = () => {
    const item: DisplayOrderItem = { type: "outdoor" };
    const key = "outdoor";
    const label = outdoorLocation?.name ?? "屋外";

    return (
      <DeviceSettingsCard
        key={key}
        icon={CloudSun}
        accentColor={getAccentColor(item)}
        title="屋外"
        subtitle="地点名をダッシュボードに表示します"
        nameLabel="表示名"
        name={nameDrafts[key] ?? label}
        onNameChange={(value) => setDraft(key, value)}
        namePlaceholder="例: 茨木市"
        chartColors={[
          {
            id: `${key}-color`,
            label: "グラフの色",
            color: getOutdoorChartColor(chartColors),
            onChange: (color) => handleColorChange("outdoor", color),
          },
        ]}
        visible={isTargetVisible(hiddenKeys, item)}
        onVisibleChange={(visible) => handleVisibilityChange(item, visible)}
        visibilityId={`visible-${key}`}
        onSave={() => void saveOutdoorName()}
        saving={savingKey === key}
        saveDisabled={!outdoorLocation}
        error={errors[key]}
        footer={
          <p className="text-xs text-muted-foreground">
            緯度・経度の変更は
            <Link href="/" className="mx-1 underline underline-offset-2">
              ダッシュボード
            </Link>
            の屋外カードから行えます
          </p>
        }
      />
    );
  };

  const renderAirconCard = () => {
    const item: DisplayOrderItem = { type: "aircon" };
    const key = `aircon:${primaryAirconId}`;
    const label = airconName;

    return (
      <DeviceSettingsCard
        key={key}
        icon={Snowflake}
        accentColor={getAccentColor(item)}
        title={label}
        subtitle={`エアコン ID: ${primaryAirconId}`}
        nameLabel="表示名"
        name={nameDrafts[key] ?? label}
        onNameChange={(value) => setDraft(key, value)}
        namePlaceholder="例: リビング"
        chartColors={[
          {
            id: `${key}-room-color`,
            label: "グラフの色（室温）",
            color: getDeviceChartColor(chartColors, AIRCON_CHART_DEVICE_ID),
            onChange: (color) =>
              handleColorChange(deviceColorKey(AIRCON_CHART_DEVICE_ID), color),
          },
          {
            id: `${key}-target-color`,
            label: "グラフの色（設定温度）",
            color: getAirconTargetChartColor(chartColors),
            onChange: (color) => handleColorChange(AIRCON_TARGET_COLOR_KEY, color),
          },
        ]}
        visible={isTargetVisible(hiddenKeys, item)}
        onVisibleChange={(visible) => handleVisibilityChange(item, visible)}
        visibilityId={`visible-${key}`}
        onSave={() => void saveAirconName(primaryAirconId)}
        saving={savingKey === key}
        error={errors[key]}
      />
    );
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="pb-10">
      <div className="space-y-6 px-5 pt-12">
        <header className="flex items-center gap-3">
          <Link
            href="/"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="ダッシュボードへ戻る"
          >
            <ArrowLeft className="size-5" strokeWidth={1.75} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-5 text-muted-foreground" />
              <h1 className="text-lg font-bold">デバイス</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              表示名・色・ダッシュボードへの表示を管理します
            </p>
          </div>
        </header>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="section-title px-0.5">屋内センサー</h2>
              {sensorTargets.length > 0 ? (
                sensorTargets.map((item) => renderSensorCard(item))
              ) : (
                <p className="rounded-[18px] border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                  登録済みのセンサーがありません
                </p>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="section-title px-0.5">その他</h2>
              <div className="space-y-3">
                {renderOutdoorCard()}
                {renderAirconCard()}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
