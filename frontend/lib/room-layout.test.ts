import { describe, expect, it } from "vitest";
import type { CleaningTask } from "@/lib/cleaning";
import {
  buildDefaultRoomLayers,
  buildDefaultRoomLayout,
  buildRoomWallParts,
  findUnassignedCleaningTaskIds,
  getRoomZoneBinding,
  normalizeRoomLayout,
  resolveRoomZones,
  ROOM_WALL_PARTS,
  ROOM_ZONE_DEFS,
  roomTemperatureColor,
  setRoomZoneBinding,
  type RoomWallDefinition,
} from "@/lib/room-layout";

function task(id: string, overrides: Partial<CleaningTask> = {}): CleaningTask {
  return {
    id,
    name: id,
    interval_days: 7,
    steps: [],
    history: [],
    last_done: null,
    next_due: "2026-09-08",
    days_until: 0,
    status: "today",
    ...overrides,
  };
}

describe("normalizeRoomLayout", () => {
  it("保存が無ければ既定の紐付けで始める", () => {
    const layout = normalizeRoomLayout(null);
    expect(layout.zones.map((zone) => zone.key)).toEqual(
      ROOM_ZONE_DEFS.map((zone) => zone.key)
    );
    expect(getRoomZoneBinding(layout, "ldk").device_id).toBe(1);
    expect(getRoomZoneBinding(layout, "bedroom").device_id).toBe(2);
  });

  it("知らないゾーンのキーを落とし、足りないゾーンを空で補う", () => {
    const layout = normalizeRoomLayout({
      zones: [
        { key: "ldk", device_id: 5, ac_id: 2, cleaning_task_ids: ["a"] },
        { key: "kitchen-that-does-not-exist", device_id: 9 },
      ],
    });

    expect(layout.zones.map((zone) => zone.key)).toEqual(
      ROOM_ZONE_DEFS.map((zone) => zone.key)
    );
    expect(getRoomZoneBinding(layout, "ldk")).toEqual({
      key: "ldk",
      device_id: 5,
      ac_id: 2,
      cleaning_task_ids: ["a"],
    });
    // 保存に無かったゾーンは既定へ戻さず空にする。1つでも保存されていれば人の意思なので
    expect(getRoomZoneBinding(layout, "bedroom").device_id).toBeNull();
  });

  it("読めないIDと重複した掃除タスクIDを落とす", () => {
    const layout = normalizeRoomLayout({
      zones: [
        {
          key: "ldk",
          device_id: "abc",
          ac_id: -1,
          cleaning_task_ids: ["a", "a", "", 3, " b "],
        },
      ],
    });
    expect(getRoomZoneBinding(layout, "ldk")).toEqual({
      key: "ldk",
      device_id: null,
      ac_id: null,
      cleaning_task_ids: ["a", "b"],
    });
  });

  it("全部の紐付けを外した状態を既定へ戻さない", () => {
    const cleared = buildDefaultRoomLayout().zones.map((zone) => ({
      ...zone,
      device_id: null,
      ac_id: null,
      cleaning_task_ids: [],
    }));
    const layout = normalizeRoomLayout({ zones: cleared });
    expect(getRoomZoneBinding(layout, "ldk").device_id).toBeNull();
  });
});

describe("setRoomZoneBinding", () => {
  it("指定したゾーンだけを差し替える", () => {
    const before = buildDefaultRoomLayout();
    const after = setRoomZoneBinding(before, "bath", { device_id: 3 });

    expect(getRoomZoneBinding(after, "bath").device_id).toBe(3);
    expect(getRoomZoneBinding(after, "ldk").device_id).toBe(1);
    // 元の設定は書き換えない
    expect(getRoomZoneBinding(before, "bath").device_id).toBeNull();
  });
});

describe("resolveRoomZones", () => {
  const sources = {
    layout: normalizeRoomLayout({
      zones: [
        { key: "ldk", device_id: 1, ac_id: 1, cleaning_task_ids: ["yuka"] },
        { key: "bedroom", device_id: 2, ac_id: null, cleaning_task_ids: [] },
      ],
    }),
    latestByDevice: {
      1: { device_id: 1, temperature: 26.4, humidity: 58, illuminance: 320 },
      2: { device_id: 2, temperature: 25.1, humidity: 61, illuminance: 4 },
    },
    lightThresholds: { "1": 80, "2": 80 },
    airconByAcId: { 1: { ac_id: 1, mode: "COOLING", power: "ON", target_temperature: 26 } },
    cleaningTasks: [task("yuka"), task("furo")],
  };

  it("場所ごとに室温・照明・エアコン・掃除をまとめる", () => {
    const zones = resolveRoomZones(sources);
    const ldk = zones.find((zone) => zone.key === "ldk");

    expect(ldk?.temperature).toBe(26.4);
    expect(ldk?.light?.status).toBe("on");
    expect(ldk?.aircon?.target_temperature).toBe(26);
    expect(ldk?.cleaning.map((entry) => entry.id)).toEqual(["yuka"]);
  });

  it("しきい値を下回れば消灯として返す", () => {
    const zones = resolveRoomZones(sources);
    expect(zones.find((zone) => zone.key === "bedroom")?.light?.status).toBe("off");
  });

  it("センサーを紐付けていない場所は値を持たない", () => {
    const zones = resolveRoomZones(sources);
    const bath = zones.find((zone) => zone.key === "bath");

    expect(bath?.deviceId).toBeNull();
    expect(bath?.temperature).toBeNull();
    expect(bath?.light).toBeNull();
    expect(bath?.aircon).toBeNull();
  });

  it("存在しない掃除タスクIDが残っていても落ちない", () => {
    const zones = resolveRoomZones({
      ...sources,
      layout: normalizeRoomLayout({
        zones: [{ key: "ldk", device_id: 1, ac_id: null, cleaning_task_ids: ["消えたタスク"] }],
      }),
    });
    expect(zones.find((zone) => zone.key === "ldk")?.cleaning).toEqual([]);
  });

  it("全ゾーンを必ず返す（3Dの床は紐付けの有無に関わらず描くため）", () => {
    expect(resolveRoomZones(sources)).toHaveLength(ROOM_ZONE_DEFS.length);
  });
});

describe("findUnassignedCleaningTaskIds", () => {
  it("どの場所にも入れていない掃除だけを返す", () => {
    const layout = normalizeRoomLayout({
      zones: [{ key: "ldk", device_id: 1, ac_id: null, cleaning_task_ids: ["yuka"] }],
    });
    expect(findUnassignedCleaningTaskIds(layout, [task("yuka"), task("furo")])).toEqual([
      "furo",
    ]);
  });
});

describe("roomTemperatureColor", () => {
  it("凡例の両端を外れた値でも色を返す", () => {
    expect(roomTemperatureColor(-40)).toMatch(/^#[0-9a-f]{6}$/);
    expect(roomTemperatureColor(99)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("寒いほうが青く、暑いほうが赤い", () => {
    const cold = roomTemperatureColor(18);
    const hot = roomTemperatureColor(31);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);

    expect(blue(cold)).toBeGreaterThan(blue(hot));
    expect(red(hot)).toBeGreaterThan(red(cold));
  });
});

describe("buildRoomWallParts", () => {
  it("開口の数だけ壁を分割する", () => {
    const wall: RoomWallDefinition = {
      runs: "x",
      at: 0,
      from: -2,
      to: 2,
      height: 1,
      thickness: 0.1,
      tone: "partition",
      gaps: [[0, 1]],
    };
    const parts = buildRoomWallParts([wall]);
    expect(parts).toHaveLength(2);
    expect(parts[0].size[0]).toBeCloseTo(1.5);
    expect(parts[1].size[0]).toBeCloseTo(1.5);
  });

  it("仮の間取りの壁がすべて正の大きさになる", () => {
    for (const part of ROOM_WALL_PARTS) {
      for (const value of part.size) expect(value).toBeGreaterThan(0);
    }
  });
});

describe("buildDefaultRoomLayers", () => {
  it("狭い画面では温度とエアコンだけを出す", () => {
    expect(buildDefaultRoomLayers(true)).toEqual({
      temperature: true,
      aircon: true,
      light: false,
      cleaning: false,
    });
    expect(buildDefaultRoomLayers(false).cleaning).toBe(true);
  });
});
