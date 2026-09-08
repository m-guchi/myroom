"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CleaningTask } from "@/lib/cleaning";
import {
  findUnassignedCleaningTaskIds,
  getRoomZoneBinding,
  normalizeRoomLayout,
  ROOM_ZONE_DEFS,
  setRoomZoneBinding,
  type RoomLayout,
} from "@/lib/room-layout";
import type { AirconUnitInfo, DeviceInfo } from "@/lib/types";

/**
 * 部屋の3Dビューの「どの場所が何か」を決めるシート（#399）。
 *
 * センサー・エアコン・掃除タスクは、どれも自分がどの部屋にあるかを持っていない。
 * その対応をここで人が決めて `app_settings` の `room_layout` へ保存する。
 * **1回のPUTで対応表をまるごと送る**ので、複数キーを続けて投げたときの
 * 上書き（#377）は起きない。
 *
 * **押した時点で保存する。** `/devices` の表示・非表示や「暮らし」の設定シートと
 * 同じ即時保存で、`useUnsavedEdits()` は呼ばない（閉じるまで書かない形にすると、
 * 触っている途中で別アプリへ行って戻っただけで自動リロードに変更を流される）。
 * 「完了」は閉じるだけのボタンで、保存ボタンではない。
 */

interface RoomLayoutSheetProps {
  open: boolean;
  layout: RoomLayout;
  devices: readonly DeviceInfo[];
  airconUnits: readonly AirconUnitInfo[];
  cleaningTasks: readonly CleaningTask[];
  onClose: () => void;
  onChange: (layout: RoomLayout) => void;
}

const SELECT_CLASS =
  "w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground";

export function RoomLayoutSheet({
  open,
  layout,
  devices,
  airconUnits,
  cleaningTasks,
  onClose,
  onChange,
}: RoomLayoutSheetProps) {
  if (!open) return null;

  const normalized = normalizeRoomLayout(layout);
  const unassigned = findUnassignedCleaningTaskIds(normalized, cleaningTasks);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="部屋の配置の設定"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[20px] bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 className="text-[17px] font-bold text-foreground">部屋の配置</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              3Dの場所と、センサー・エアコン・掃除を結び付けます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {ROOM_ZONE_DEFS.map((zone) => {
            const binding = getRoomZoneBinding(normalized, zone.key);
            return (
              <section key={zone.key} className="rounded-2xl border p-4">
                <h3 className="text-[14px] font-bold text-foreground">{zone.name}</h3>

                <label className="mt-3 block">
                  <span className="text-[11.5px] text-muted-foreground">
                    室温・湿度・照明を読むセンサー
                  </span>
                  <select
                    className={`mt-1 ${SELECT_CLASS}`}
                    value={binding.device_id ?? ""}
                    onChange={(event) =>
                      onChange(
                        setRoomZoneBinding(normalized, zone.key, {
                          device_id: event.target.value === "" ? null : Number(event.target.value),
                        })
                      )
                    }
                  >
                    <option value="">なし</option>
                    {devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block">
                  <span className="text-[11.5px] text-muted-foreground">この場所のエアコン</span>
                  <select
                    className={`mt-1 ${SELECT_CLASS}`}
                    value={binding.ac_id ?? ""}
                    onChange={(event) =>
                      onChange(
                        setRoomZoneBinding(normalized, zone.key, {
                          ac_id: event.target.value === "" ? null : Number(event.target.value),
                        })
                      )
                    }
                  >
                    <option value="">なし</option>
                    {airconUnits.map((unit) => (
                      <option key={unit.ac_id} value={unit.ac_id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3">
                  <span className="text-[11.5px] text-muted-foreground">この場所でやる掃除</span>
                  {cleaningTasks.length === 0 ? (
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      掃除の予定がまだ登録されていません
                    </p>
                  ) : (
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      {cleaningTasks.map((task) => {
                        const checked = binding.cleaning_task_ids.includes(task.id);
                        return (
                          <label
                            key={task.id}
                            className="flex items-center gap-2.5 text-[13px] text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                onChange(
                                  setRoomZoneBinding(normalized, zone.key, {
                                    cleaning_task_ids: checked
                                      ? binding.cleaning_task_ids.filter((id) => id !== task.id)
                                      : [...binding.cleaning_task_ids, task.id],
                                  })
                                )
                              }
                              className="size-4 shrink-0 accent-[var(--temp-color)]"
                            />
                            <span className="truncate">{task.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {unassigned.length > 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-3 text-[11.5px] text-muted-foreground">
              まだどの場所にも入れていない掃除が{unassigned.length}件あります。入れていない掃除は3Dに出ません。
            </p>
          ) : null}
        </div>

        <div className="border-t px-5 py-3">
          <Button type="button" className="w-full" onClick={onClose}>
            完了
          </Button>
        </div>
      </div>
    </div>
  );
}
