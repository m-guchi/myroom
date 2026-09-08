import type { CleaningStatus, CleaningTask } from "@/lib/cleaning";
import { getLightThreshold, resolveLightStatus, type LightStatusResult } from "@/lib/light-status";
import type { AirconData, LatestData } from "@/lib/types";

/**
 * 部屋の3Dビュー（`/room`・#399）の間取りと、場所ごとの紐付け。
 *
 * センサー・エアコン・掃除タスクは、どれも「部屋のどこにあるか」を持っていない
 * （持っているのは `id` と表示名だけ）。そこで**場所（ゾーン）を軸にした対応表**を
 * ここで定義し、保存は `app_settings` の `room_layout` キー1つで済ませる。
 * テーブルを増やさないので本番DBのマイグレーションは要らない。
 *
 * **どのゾーンが存在するかの正はこのファイル**（`ROOM_ZONE_DEFS`）で、
 * バックエンドは形だけを整えて素通しする。`lib/dashboard-sections.ts` の `LIFE_CARDS` と
 * `backend/ui_settings.py` の `_normalize_life_card_order()` の分担と同じ考え方で、
 * 両側に一覧を持たせるとゾーンを増やしたときに片方だけ古くなる。
 *
 * **実物の部屋のモデルはまだ受け取っていないため、いまは仮の1LDKをここで組んでいる。**
 * glTF/GLB を受け取ったら、差し替えるのはこのファイルの寸法データと
 * `components/room-scene.tsx` の描画だけで済むようにしてある（紐付け・画面・保存の形は
 * ゾーンのキーだけに依存する）。
 */

/** 3D上の区画。床は XZ 平面で、Y が高さ（単位はメートル相当） */
export interface RoomZoneRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface RoomZoneDefinition {
  /** 保存に使うキー。名前を変えても紐付けが切れないよう、日本語にはしない */
  key: string;
  /** 画面に出す名前 */
  name: string;
  rect: RoomZoneRect;
}

/** 仮の1LDK。玄関から入って右手に水回り、奥に寝室、左が広いLDK */
export const ROOM_ZONE_DEFS: readonly RoomZoneDefinition[] = [
  { key: "ldk", name: "リビング", rect: { x0: -5, x1: 0.5, z0: -3.5, z1: 3.5 } },
  { key: "bedroom", name: "寝室", rect: { x0: 0.5, x1: 5, z0: -3.5, z1: 0.2 } },
  { key: "bath", name: "洗面・浴室", rect: { x0: 0.5, x1: 2.8, z0: 0.2, z1: 3.5 } },
  { key: "entrance", name: "玄関", rect: { x0: 2.8, x1: 5, z0: 0.2, z1: 3.5 } },
];

export function getRoomZoneDef(key: string): RoomZoneDefinition | null {
  return ROOM_ZONE_DEFS.find((zone) => zone.key === key) ?? null;
}

export function roomZoneCenter(rect: RoomZoneRect): [number, number] {
  return [(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2];
}

/* ────────── 仮モデルの寸法（GLBを受け取ったら置き換わる部分） ────────── */

/** 面の質感。実際の色は明暗テーマごとに `room-scene.tsx` が持つ */
export type RoomSurfaceTone = "wall" | "partition" | "wood" | "woodDark" | "metal" | "screen";

export interface RoomBoxPart {
  size: [number, number, number];
  position: [number, number, number];
  tone: RoomSurfaceTone;
}

export interface RoomWallDefinition {
  /** 壁が伸びる向き。"x" は X 方向へ走る（＝Z が一定）壁 */
  runs: "x" | "z";
  /** 走らないほうの座標 */
  at: number;
  from: number;
  to: number;
  height: number;
  thickness: number;
  tone: RoomSurfaceTone;
  /** 開口（ドア）。`[中心, 幅]` */
  gaps?: [number, number][];
}

const ROOM_WALLS: readonly RoomWallDefinition[] = [
  // 外壁は奥と左の2面だけ立てる。手前と右を開けて中を見せる（切り欠き）
  { runs: "x", at: -3.56, from: -5.06, to: 5, height: 2.1, thickness: 0.12, tone: "wall" },
  { runs: "z", at: -5.06, from: -3.56, to: 3.5, height: 2.1, thickness: 0.12, tone: "partition" },
  // 間仕切りは腰より高いが天井までは届かせない。上から覗き込む視点で中が見えなくなるため
  {
    runs: "z",
    at: 0.5,
    from: -3.5,
    to: 3.5,
    height: 1.35,
    thickness: 0.1,
    tone: "partition",
    gaps: [
      [-0.7, 0.95],
      [2.1, 0.9],
    ],
  },
  { runs: "x", at: 0.2, from: 0.5, to: 2.8, height: 1.35, thickness: 0.1, tone: "partition", gaps: [[1.9, 0.85]] },
  { runs: "z", at: 2.8, from: 0.2, to: 3.5, height: 1.35, thickness: 0.1, tone: "partition", gaps: [[1.0, 0.9]] },
];

/** 開口で分割した壁を、そのまま置ける箱の一覧にする */
export function buildRoomWallParts(walls: readonly RoomWallDefinition[] = ROOM_WALLS): RoomBoxPart[] {
  const parts: RoomBoxPart[] = [];
  for (const wall of walls) {
    const cuts: number[] = [wall.from];
    for (const [center, width] of wall.gaps ?? []) {
      cuts.push(center - width / 2, center + width / 2);
    }
    cuts.push(wall.to);

    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const start = cuts[i];
      const end = cuts[i + 1];
      const length = end - start;
      if (length <= 0.02) continue;
      const middle = (start + end) / 2;
      parts.push({
        size:
          wall.runs === "x"
            ? [length, wall.height, wall.thickness]
            : [wall.thickness, wall.height, length],
        position:
          wall.runs === "x"
            ? [middle, wall.height / 2, wall.at]
            : [wall.at, wall.height / 2, middle],
        tone: wall.tone,
      });
    }
  }
  return parts;
}

export const ROOM_WALL_PARTS: readonly RoomBoxPart[] = buildRoomWallParts();

/** 置き家具。どの部屋の何かが分かる程度の箱で、形そのものに意味は持たせていない */
export const ROOM_FURNITURE: readonly RoomBoxPart[] = [
  // リビング
  { size: [2.4, 0.55, 0.95], position: [-3.2, 0.28, -1.0], tone: "wood" },
  { size: [2.4, 0.28, 0.28], position: [-3.2, 0.68, -1.38], tone: "woodDark" },
  { size: [1.3, 0.32, 0.7], position: [-3.0, 0.16, 0.5], tone: "woodDark" },
  { size: [0.32, 0.45, 1.7], position: [-4.7, 0.22, -1.0], tone: "woodDark" },
  { size: [0.06, 0.62, 1.5], position: [-4.62, 0.78, -1.0], tone: "screen" },
  { size: [0.65, 0.88, 2.6], position: [-0.05, 0.44, 1.9], tone: "wood" },
  { size: [0.7, 1.65, 0.72], position: [-1.35, 0.82, 3.05], tone: "metal" },
  { size: [1.5, 0.7, 0.9], position: [-2.7, 0.35, 2.3], tone: "woodDark" },
  // 寝室
  { size: [2.0, 0.42, 1.45], position: [3.6, 0.21, -2.4], tone: "wood" },
  { size: [1.7, 0.16, 0.36], position: [3.6, 0.5, -2.98], tone: "wall" },
  { size: [1.3, 0.7, 0.55], position: [1.5, 0.35, -0.35], tone: "woodDark" },
  { size: [0.45, 0.9, 1.1], position: [4.72, 0.45, -0.5], tone: "wood" },
  // 洗面・浴室
  { size: [1.5, 0.5, 0.85], position: [1.4, 0.25, 2.85], tone: "metal" },
  { size: [0.55, 0.82, 0.9], position: [2.42, 0.41, 1.05], tone: "wood" },
  { size: [0.62, 0.85, 0.62], position: [0.95, 0.42, 1.0], tone: "metal" },
  // 玄関
  { size: [0.42, 1.25, 1.3], position: [4.74, 0.62, 1.5], tone: "wood" },
  { size: [1.7, 0.04, 1.2], position: [3.7, 0.02, 2.85], tone: "woodDark" },
];

/** エアコン本体の位置。ゾーンごとに1台までを前提にしている */
export const ROOM_AIRCON_MOUNTS: Readonly<Record<string, [number, number, number]>> = {
  ldk: [-2.6, 1.62, -3.34],
  bedroom: [2.6, 1.62, -3.34],
};

/** シーリングライトの位置。センサーを紐付けたゾーンだけ点灯・消灯を描く */
export const ROOM_CEILING_LIGHTS: Readonly<Record<string, [number, number, number]>> = {
  ldk: [-2.4, 1.98, 0.2],
  bedroom: [3.2, 1.98, -1.9],
  bath: [1.65, 1.9, 1.85],
  entrance: [3.9, 1.9, 1.85],
};

/* ────────── 保存する紐付け ────────── */

/**
 * ゾーン1つぶんの紐付け。**寸法はここに入れない**——寸法は上の定義が正で、
 * 保存するのは「その場所が何と結び付いているか」だけ。
 */
export interface RoomZoneBinding {
  key: string;
  /** 室温・湿度・照明を読むセンサーの device_id。null = センサーなし */
  device_id: number | null;
  /** その場所にあるエアコンの ac_id。null = 無し */
  ac_id: number | null;
  /** その場所でやる掃除タスクのID（`GET /api/cleaning` の `tasks[].id`） */
  cleaning_task_ids: string[];
}

export interface RoomLayout {
  zones: RoomZoneBinding[];
}

/**
 * 初期の紐付け。`display_order` の既定（`["device:1", "device:2", …]`）と同じく、
 * このアプリの標準構成（リビング=1・寝室=2・エアコンはリビング）を置いている。
 * 掃除タスクのIDは名前から作られるスラッグで推測できないため、空で始める。
 */
export const DEFAULT_ROOM_BINDINGS: Readonly<Record<string, Omit<RoomZoneBinding, "key">>> = {
  ldk: { device_id: 1, ac_id: 1, cleaning_task_ids: [] },
  bedroom: { device_id: 2, ac_id: null, cleaning_task_ids: [] },
  bath: { device_id: null, ac_id: null, cleaning_task_ids: [] },
  entrance: { device_id: null, ac_id: null, cleaning_task_ids: [] },
};

export function buildDefaultRoomLayout(): RoomLayout {
  return {
    zones: ROOM_ZONE_DEFS.map((zone) => ({
      key: zone.key,
      ...(DEFAULT_ROOM_BINDINGS[zone.key] ?? { device_id: null, ac_id: null, cleaning_task_ids: [] }),
      cleaning_task_ids: [...(DEFAULT_ROOM_BINDINGS[zone.key]?.cleaning_task_ids ?? [])],
    })),
  };
}

function toNullableId(raw: unknown): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function toTaskIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * 保存値を画面で使える形へ整える。
 *
 * **知らないキーを落とし、足りないキーを既定で補うのはこちら側の仕事**
 * （`lib/life-card-order.ts` と同じ分担）。間取りを変えてゾーンを増減しても、
 * 「保存済みの人にだけ出ない／消えたゾーンの設定が残り続ける」が起きない。
 *
 * 保存が一度も無い（`zones` が空）ときだけ既定の紐付けへ倒す。1つでも保存されていれば、
 * 全部の紐付けを外した状態もそのまま尊重する（外したのに既定へ戻ると設定できない）。
 */
export function normalizeRoomLayout(raw: unknown): RoomLayout {
  const rawZones =
    raw && typeof raw === "object" && Array.isArray((raw as { zones?: unknown }).zones)
      ? ((raw as { zones: unknown[] }).zones)
      : [];

  const saved = new Map<string, RoomZoneBinding>();
  for (const entry of rawZones) {
    if (!entry || typeof entry !== "object") continue;
    const key = String((entry as { key?: unknown }).key ?? "").trim();
    if (!key || saved.has(key) || !getRoomZoneDef(key)) continue;
    saved.set(key, {
      key,
      device_id: toNullableId((entry as { device_id?: unknown }).device_id),
      ac_id: toNullableId((entry as { ac_id?: unknown }).ac_id),
      cleaning_task_ids: toTaskIds((entry as { cleaning_task_ids?: unknown }).cleaning_task_ids),
    });
  }

  if (saved.size === 0) return buildDefaultRoomLayout();

  return {
    zones: ROOM_ZONE_DEFS.map(
      (zone) =>
        saved.get(zone.key) ?? {
          key: zone.key,
          device_id: null,
          ac_id: null,
          cleaning_task_ids: [],
        }
    ),
  };
}

export function getRoomZoneBinding(layout: RoomLayout, key: string): RoomZoneBinding {
  return (
    layout.zones.find((zone) => zone.key === key) ?? {
      key,
      device_id: null,
      ac_id: null,
      cleaning_task_ids: [],
    }
  );
}

/** 1つのゾーンの紐付けだけを差し替えた新しい設定を返す（保存は呼び出し側） */
export function setRoomZoneBinding(
  layout: RoomLayout,
  key: string,
  patch: Partial<Omit<RoomZoneBinding, "key">>
): RoomLayout {
  const normalized = normalizeRoomLayout(layout);
  return {
    zones: normalized.zones.map((zone) =>
      zone.key === key ? { ...zone, ...patch, key } : zone
    ),
  };
}

/* ────────── 表示に使う色 ────────── */

const TEMPERATURE_RAMP: readonly [number, [number, number, number]][] = [
  [18, [74, 144, 217]],
  [22, [95, 191, 168]],
  [25, [232, 195, 90]],
  [28, [224, 138, 74]],
  [31, [217, 85, 63]],
];

/**
 * 室温 -> 床に敷く色。**数字を読まずに暑い部屋・寒い部屋が分かる**ことが
 * 3Dにする一番の理由なので、凡例（18〜31℃）と同じ並びをここで持つ。
 */
export function roomTemperatureColor(temperature: number): string {
  const clamped = Math.min(
    TEMPERATURE_RAMP[TEMPERATURE_RAMP.length - 1][0],
    Math.max(TEMPERATURE_RAMP[0][0], temperature)
  );
  let rgb = TEMPERATURE_RAMP[0][1];
  for (let i = 1; i < TEMPERATURE_RAMP.length; i += 1) {
    const [lowStop, lowColor] = TEMPERATURE_RAMP[i - 1];
    const [highStop, highColor] = TEMPERATURE_RAMP[i];
    if (clamped <= highStop) {
      const k = (clamped - lowStop) / (highStop - lowStop);
      rgb = [0, 1, 2].map((j) =>
        Math.round(lowColor[j] + (highColor[j] - lowColor[j]) * k)
      ) as [number, number, number];
      break;
    }
    rgb = highColor;
  }
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 掃除の状態を表す色。3Dの床の縁と一覧のバッジで同じ色を使う。
 * `app/globals.css` のトークンではなく hex で持つのは、three のマテリアルが
 * CSS変数を解釈できないため（画面側もここから引いて、2か所で色がずれないようにする）。
 */
export const ROOM_CLEANING_STATUS_COLORS: Record<CleaningStatus, string> = {
  overdue: "#d9534f",
  today: "#e2973b",
  upcoming: "#93999f",
};

export const ROOM_TEMPERATURE_RAMP_MIN = TEMPERATURE_RAMP[0][0];
export const ROOM_TEMPERATURE_RAMP_MAX = TEMPERATURE_RAMP[TEMPERATURE_RAMP.length - 1][0];

/* ────────── 重ねる情報のレイヤ ────────── */

export type RoomLayerKey = "temperature" | "aircon" | "light" | "cleaning";

export interface RoomLayerDefinition {
  key: RoomLayerKey;
  label: string;
  /** チップの色見本に使う CSS 変数（`app/globals.css`） */
  colorVar: string;
}

export const ROOM_LAYERS: readonly RoomLayerDefinition[] = [
  { key: "temperature", label: "温度", colorVar: "--temp-color" },
  { key: "aircon", label: "エアコン", colorVar: "--temp-color" },
  { key: "light", label: "照明", colorVar: "--remote-color" },
  { key: "cleaning", label: "掃除", colorVar: "--energy-color" },
];

export type RoomLayerState = Record<RoomLayerKey, boolean>;

/**
 * 初期状態。4種類すべてを重ねるとピンが混み合うため、狭い画面では温度とエアコンだけで開く。
 * 出す・出さないはチップからいつでも変えられる。
 */
export function buildDefaultRoomLayers(compact: boolean): RoomLayerState {
  return {
    temperature: true,
    aircon: true,
    light: !compact,
    cleaning: !compact,
  };
}

/* ────────── 画面に出す形へまとめる ────────── */

export interface ResolvedRoomZone {
  key: string;
  name: string;
  rect: RoomZoneRect;
  center: [number, number];
  deviceId: number | null;
  temperature: number | null;
  humidity: number | null;
  /** 照度としきい値から出した点灯・消灯。しきい値未設定なら null */
  light: LightStatusResult | null;
  acId: number | null;
  aircon: AirconData | null;
  cleaning: CleaningTask[];
}

export interface RoomZoneSources {
  layout: RoomLayout;
  latestByDevice: Record<number, LatestData | null>;
  lightThresholds: Record<string, number>;
  airconByAcId: Record<number, AirconData | null>;
  cleaningTasks: readonly CleaningTask[];
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

/**
 * 間取りと各APIの最新値を突き合わせて、ゾーンごとの表示内容を作る。
 *
 * 判定そのもの（照明の点灯・掃除の遅れ）は既存の実装をそのまま使う。ここは
 * 「どの場所の値か」を決めるだけで、同じ判定をもう一度書かないこと。
 */
export function resolveRoomZones(sources: RoomZoneSources): ResolvedRoomZone[] {
  const layout = normalizeRoomLayout(sources.layout);

  return ROOM_ZONE_DEFS.map((def) => {
    const binding = getRoomZoneBinding(layout, def.key);
    const latest = binding.device_id != null ? sources.latestByDevice[binding.device_id] : null;
    const aircon = binding.ac_id != null ? sources.airconByAcId[binding.ac_id] ?? null : null;

    return {
      key: def.key,
      name: def.name,
      rect: def.rect,
      center: roomZoneCenter(def.rect),
      deviceId: binding.device_id,
      temperature: finiteOrNull(latest?.temperature),
      humidity: finiteOrNull(latest?.humidity),
      light:
        binding.device_id != null
          ? resolveLightStatus(
              latest?.illuminance,
              getLightThreshold(sources.lightThresholds, binding.device_id)
            )
          : null,
      acId: binding.ac_id,
      aircon,
      cleaning: binding.cleaning_task_ids
        .map((id) => sources.cleaningTasks.find((task) => task.id === id))
        .filter((task): task is CleaningTask => task != null),
    };
  });
}

/** どの掃除タスクがどのゾーンにも紐付いていないか（設定シートの案内に使う） */
export function findUnassignedCleaningTaskIds(
  layout: RoomLayout,
  tasks: readonly CleaningTask[]
): string[] {
  const assigned = new Set(
    normalizeRoomLayout(layout).zones.flatMap((zone) => zone.cleaning_task_ids)
  );
  return tasks.filter((task) => !assigned.has(task.id)).map((task) => task.id);
}
