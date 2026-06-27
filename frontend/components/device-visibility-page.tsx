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
import type { LucideIcon } from "lucide-react";
import { LoginScreen } from "@/components/login-screen";
import { DeviceEditSheet } from "@/components/device-edit-sheet";
import { DeviceListItem } from "@/components/device-list-item";
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
  setChartColor,
  type ChartColorSettings,
} from "@/lib/chart-colors";
import {
  DISPLAY_ORDER_CHANGED_EVENT,
  getDisplayOrderLabel,
  normalizeDisplayOrder,
  orderItemKey,
  type DisplayOrderItem,
} from "@/lib/display-order";
import {
  AIRCON_CHART_DEVICE_ID,
  formatOutdoorApiLabel,
  getSensorDeviceIds,
  type AirconUnitInfo,
  type DeviceInfo,
  type OutdoorLocation,
} from "@/lib/types";
import {
  isTargetVisible,
  isAirconRoomVisible,
  isAirconTargetVisible,
  isDeviceDht11Visible,
  setHiddenKeyVisible,
  setTargetVisible,
  sortDisplayOrderHiddenLast,
  AIRCON_ROOM_HIDDEN_KEY,
  AIRCON_TARGET_VISIBILITY_KEY,
  VISIBLE_DEVICES_CHANGED_EVENT,
} from "@/lib/visible-devices";
import { deviceDht11VisibilityKey } from "@/lib/chart-line-visibility";
import {
  loadUiSettingsFromServer,
  saveChartColorsToServer,
  saveDisplayOrderToServer,
  saveHiddenDevicesToServer,
} from "@/lib/ui-settings-client";
import { AuthError, clearAuthToken, isAuthenticated as hasStoredAuthToken } from "@/lib/auth";

type EditableTarget =
  | { kind: "device"; item: Extract<DisplayOrderItem, { type: "device" }> }
  | { kind: "outdoor"; item: Extract<DisplayOrderItem, { type: "outdoor" }> }
  | { kind: "aircon"; item: Extract<DisplayOrderItem, { type: "aircon" }> };

function draftKeyForItem(item: DisplayOrderItem, acId = 1): string {
  if (item.type === "device") return `device:${item.deviceId}`;
  if (item.type === "aircon") return `aircon:${acId}`;
  return "outdoor";
}

function getItemIcon(item: DisplayOrderItem): LucideIcon {
  if (item.type === "outdoor") return CloudSun;
  if (item.type === "aircon") return Snowflake;
  return Thermometer;
}

function getItemSubtitle(item: DisplayOrderItem, primaryAirconId: number): string {
  if (item.type === "device") return `デバイス ID: ${item.deviceId}`;
  if (item.type === "aircon") return `エアコン ID: ${primaryAirconId}`;
  return "Open-Meteo API";
}

export function DeviceVisibilityPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [airconUnits, setAirconUnits] = useState<AirconUnitInfo[]>([]);
  const [outdoorLocation, setOutdoorLocation] = useState<OutdoorLocation | null>(null);
  const [displayOrder, setDisplayOrder] = useState<DisplayOrderItem[]>([]);
  const [chartColors, setChartColors] = useState<ChartColorSettings>(() =>
    buildDefaultChartColors()
  );
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [inheritsDrafts, setInheritsDrafts] = useState<Record<number, number | null>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editingTarget, setEditingTarget] = useState<EditableTarget | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

  const orderedTargets = useMemo(
    () => normalizeDisplayOrder(displayOrder, sensorDeviceIds),
    [displayOrder, sensorDeviceIds]
  );

  const displayedTargets = useMemo(
    () => sortDisplayOrderHiddenLast(orderedTargets, hiddenKeys),
    [orderedTargets, hiddenKeys]
  );

  const reloadSettings = useCallback(async () => {
    try {
      const settings = await loadUiSettingsFromServer(sensorDeviceIds);
      setDisplayOrder(settings.displayOrder);
      setHiddenKeys(settings.hiddenDeviceKeys);
      setChartColors(settings.chartColors);
    } catch (err) {
      if (err instanceof AuthError) {
        setIsAuthenticated(false);
      }
    }
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
    if (hasStoredAuthToken()) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void reloadSettings();
  }, [isAuthenticated, reloadSettings, sensorDeviceIdsKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadData();
  }, [isAuthenticated, loadData]);

  useEffect(() => {
    const drafts: Record<string, string> = {};
    const inheritDrafts: Record<number, number | null> = {};
    for (const device of devices) {
      drafts[`device:${device.id}`] = device.name;
      inheritDrafts[device.id] = device.inherits_from ?? null;
    }
    for (const unit of airconUnits) {
      drafts[`aircon:${unit.ac_id}`] = unit.name;
    }
    if (outdoorLocation) {
      drafts.outdoor = outdoorLocation.name;
    }
    setNameDrafts(drafts);
    setInheritsDrafts(inheritDrafts);
  }, [devices, airconUnits, outdoorLocation]);

  const persistDisplayOrder = useCallback((order: DisplayOrderItem[]) => {
    setDisplayOrder(order);
    void saveDisplayOrderToServer(order)
      .then(() => {
        window.dispatchEvent(new Event(DISPLAY_ORDER_CHANGED_EVENT));
      })
      .catch((err) => {
        if (err instanceof AuthError) setIsAuthenticated(false);
      });
  }, []);

  const handleLogin = async (password: string) => {
    const ok = await login(password);
    if (ok) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const handleHiddenKeyVisibilityChange = (
    key: string,
    visible: boolean,
    item?: DisplayOrderItem
  ) => {
    const next = setHiddenKeyVisible(hiddenKeys, key, visible);
    setHiddenKeys(next);

    if (!visible && item && !isTargetVisible(next, item)) {
      const normalized = normalizeDisplayOrder(displayOrder, sensorDeviceIds);
      const itemKey = orderItemKey(item);
      const target = normalized.find((entry) => orderItemKey(entry) === itemKey);
      const rest = normalized.filter((entry) => orderItemKey(entry) !== itemKey);
      if (target) {
        persistDisplayOrder([...rest, target]);
      }
    }

    void saveHiddenDevicesToServer(next)
      .then(() => {
        window.dispatchEvent(new Event(VISIBLE_DEVICES_CHANGED_EVENT));
      })
      .catch((err) => {
        if (err instanceof AuthError) setIsAuthenticated(false);
      });
  };

  const handleVisibilityChange = (item: DisplayOrderItem, visible: boolean) => {
    const next = setTargetVisible(hiddenKeys, item, visible);
    setHiddenKeys(next);

    if (!visible) {
      const normalized = normalizeDisplayOrder(displayOrder, sensorDeviceIds);
      const key = orderItemKey(item);
      const target = normalized.find((entry) => orderItemKey(entry) === key);
      const rest = normalized.filter((entry) => orderItemKey(entry) !== key);
      if (target) {
        persistDisplayOrder([...rest, target]);
      }
    }

    void saveHiddenDevicesToServer(next)
      .then(() => {
        window.dispatchEvent(new Event(VISIBLE_DEVICES_CHANGED_EVENT));
      })
      .catch((err) => {
        if (err instanceof AuthError) setIsAuthenticated(false);
      });
  };

  const handleColorChange = (key: string, color: string) => {
    setChartColors((prev) => {
      const next = setChartColor(prev, key, color);
      void saveChartColorsToServer(next)
        .then(() => {
          window.dispatchEvent(new Event(CHART_COLORS_CHANGED_EVENT));
        })
        .catch((err) => {
          if (err instanceof AuthError) setIsAuthenticated(false);
        });
      return next;
    });
  };

  const handleDragStart = (index: number) => (event: React.DragEvent) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (index: number) => (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (event: React.DragEvent) => {
    event.preventDefault();
    const fromIndex = dragIndex ?? Number(event.dataTransfer.getData("text/plain"));
    setDragIndex(null);
    setDragOverIndex(null);
    if (!Number.isFinite(fromIndex) || fromIndex === index) return;

    const next = [...displayedTargets];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(index, 0, moved);
    persistDisplayOrder(sortDisplayOrderHiddenLast(next, hiddenKeys));
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
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
      const saved = await updateDeviceName(
        deviceId,
        name,
        inheritsDrafts[deviceId] ?? null
      );
      setDevices((prev) =>
        prev.map((device) => (device.id === deviceId ? saved : device))
      );
      setEditingTarget(null);
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
      setEditingTarget(null);
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
      setErrors((prev) => ({ ...prev, [key]: "地点データが読み込めていません" }));
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
      setEditingTarget(null);
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

  const getListTitle = (item: DisplayOrderItem) => {
    if (item.type === "outdoor") {
      return formatOutdoorApiLabel(outdoorLocation?.name);
    }
    return getDisplayOrderLabel(
      item,
      deviceNames,
      outdoorLocation?.name,
      airconName
    );
  };

  const buildInheritsFromOptions = (deviceId: number) => {
    const options: Array<{ value: number | null; label: string }> = [
      { value: null, label: "なし（継承しない）" },
    ];
    for (const device of devices) {
      if (device.id === deviceId || device.id === AIRCON_CHART_DEVICE_ID) continue;
      options.push({
        value: device.id,
        label: `${device.name || `デバイス ${device.id}`} (ID: ${device.id})`,
      });
    }
    return options;
  };

  const renderEditSheet = () => {
    if (!editingTarget) return null;

    const item = editingTarget.item;
    const key = draftKeyForItem(item, primaryAirconId);
    const label = getListTitle(item);
    const Icon = getItemIcon(item);

    if (editingTarget.kind === "device") {
      const deviceId = editingTarget.item.deviceId;
      return (
        <DeviceEditSheet
          open
          onClose={() => setEditingTarget(null)}
          icon={Icon}
          accentColor={getAccentColor(item)}
          title={label}
          subtitle={getItemSubtitle(item, primaryAirconId)}
          nameLabel="表示名"
          name={nameDrafts[key] ?? label}
          onNameChange={(value) => setDraft(key, value)}
          namePlaceholder="例: リビング"
          chartColors={[
            {
              id: `${key}-color`,
              label: "グラフの色",
              color: getDeviceChartColor(chartColors, deviceId),
              onChange: (color) => handleColorChange(deviceColorKey(deviceId), color),
            },
          ]}
          visibilityToggles={[
            {
              id: `${key}-dashboard-visible`,
              label: "ダッシュボードに表示",
              visible: isTargetVisible(hiddenKeys, item),
              onChange: (visible) => handleVisibilityChange(item, visible),
            },
            {
              id: `${key}-dht11-visible`,
              label: "DHT11温度を表示",
              description: "オフにするとグラフから DHT11 の温度系列を非表示にします",
              visible: isDeviceDht11Visible(hiddenKeys, deviceId),
              onChange: (visible) =>
                handleHiddenKeyVisibilityChange(
                  deviceDht11VisibilityKey(deviceId),
                  visible
                ),
            },
          ]}
          visibilityId={`visible-${key}`}
          onSave={() => void saveDeviceName(deviceId)}
          saving={savingKey === key}
          error={errors[key]}
          inheritsFromOptions={buildInheritsFromOptions(deviceId)}
          inheritsFrom={inheritsDrafts[deviceId] ?? null}
          onInheritsFromChange={(value) =>
            setInheritsDrafts((prev) => ({ ...prev, [deviceId]: value }))
          }
        />
      );
    }

    if (editingTarget.kind === "outdoor") {
      return (
        <DeviceEditSheet
          open
          onClose={() => setEditingTarget(null)}
          icon={Icon}
          accentColor={getAccentColor(item)}
          title={formatOutdoorApiLabel(outdoorLocation?.name)}
          subtitle="地点名をダッシュボードに表示します"
          nameLabel="表示名"
          name={nameDrafts[key] ?? outdoorLocation?.name ?? ""}
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
              の地点カードから行えます
            </p>
          }
        />
      );
    }

    return (
      <DeviceEditSheet
        open
        onClose={() => setEditingTarget(null)}
        icon={Icon}
        accentColor={getAccentColor(item)}
        title={label}
        subtitle={getItemSubtitle(item, primaryAirconId)}
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
        visibilityToggles={[
          {
            id: `${key}-room-visible`,
            label: "ダッシュボードに表示（室温）",
            visible: isAirconRoomVisible(hiddenKeys),
            onChange: (visible) =>
              handleHiddenKeyVisibilityChange(AIRCON_ROOM_HIDDEN_KEY, visible, item),
          },
          {
            id: `${key}-target-visible`,
            label: "ダッシュボードに表示（設定温度）",
            visible: isAirconTargetVisible(hiddenKeys),
            onChange: (visible) =>
              handleHiddenKeyVisibilityChange(AIRCON_TARGET_VISIBILITY_KEY, visible, item),
          },
        ]}
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
              表示名・色・表示順・ダッシュボードへの表示を管理します
            </p>
          </div>
        </header>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">読み込み中...</p>
        ) : (
          <section className="space-y-3">
            <p className="px-0.5 text-xs text-muted-foreground">
              左のグリップをドラッグして順番を変更できます
            </p>
            {displayedTargets.length > 0 ? (
              displayedTargets.map((item, index) => {
                const key = draftKeyForItem(item, primaryAirconId);
                return (
                  <DeviceListItem
                    key={key}
                    icon={getItemIcon(item)}
                    accentColor={getAccentColor(item)}
                    title={getListTitle(item)}
                    subtitle={getItemSubtitle(item, primaryAirconId)}
                    visible={isTargetVisible(hiddenKeys, item)}
                    onEdit={() => {
                      if (item.type === "device") {
                        setEditingTarget({ kind: "device", item });
                      } else if (item.type === "outdoor") {
                        setEditingTarget({ kind: "outdoor", item });
                      } else {
                        setEditingTarget({ kind: "aircon", item });
                      }
                    }}
                    onDragStart={handleDragStart(index)}
                    onDragOver={handleDragOver(index)}
                    onDrop={handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    isDragOver={dragOverIndex === index && dragIndex !== index}
                  />
                );
              })
            ) : (
              <p className="rounded-[18px] border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                登録済みのデバイスがありません
              </p>
            )}
          </section>
        )}
      </div>

      {renderEditSheet()}
    </div>
  );
}
