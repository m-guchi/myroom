"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Color, DoubleSide } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { formatCleaningCountdown } from "@/lib/cleaning";
import {
  ROOM_AIRCON_MOUNTS,
  ROOM_CEILING_LIGHTS,
  ROOM_CLEANING_STATUS_COLORS,
  ROOM_FURNITURE,
  ROOM_WALL_PARTS,
  roomTemperatureColor,
  type ResolvedRoomZone,
  type RoomLayerState,
  type RoomSurfaceTone,
} from "@/lib/room-layout";
import { formatAirconMode, getAirconModeColor, isAirconPowerOff } from "@/lib/types";

/**
 * 部屋の3Dビュー本体（#399）。
 *
 * **いまの中身は仮の1LDK**で、寸法は `lib/room-layout.ts` が持っている。実物の
 * glTF/GLB を受け取ったら、床・壁・家具を描いている部分をモデルの読み込みへ差し替える。
 * 差し替えても壊れないよう、**外から渡すのはゾーンのキーと値だけ**にしてある。
 *
 * 文字は3Dの中に描かず、`<Html>` でDOMとして重ねる。3Dのテキストは視点を回すと
 * 裏返って読めなくなるうえ、テーマごとの色・フォントを画面の他の場所と揃えられない。
 *
 * `output: "export"` の静的書き出しなので、このファイルは必ずクライアント側だけで動く
 * （呼び出し側が `next/dynamic` の `ssr: false` で読む）。
 */

interface RoomScenePalette {
  floor: string;
  wall: string;
  partition: string;
  wood: string;
  woodDark: string;
  metal: string;
  screen: string;
  fixture: string;
}

const PALETTES: Record<"light" | "dark", RoomScenePalette> = {
  light: {
    floor: "#e7e2d8",
    wall: "#f2efe9",
    partition: "#e6e1d7",
    wood: "#cfc7b8",
    woodDark: "#b9afa0",
    metal: "#d9dde2",
    screen: "#5b626c",
    fixture: "#ffffff",
  },
  dark: {
    floor: "#55504a",
    wall: "#6b6660",
    partition: "#5c5751",
    wood: "#7d766c",
    woodDark: "#6a6459",
    metal: "#8a9099",
    screen: "#3b4048",
    fixture: "#f2ede2",
  },
};

function toneColor(palette: RoomScenePalette, tone: RoomSurfaceTone): string {
  return palette[tone];
}

/** 床に敷く色。温度そのままだと彩度が高すぎるので、床の地の色へ寄せる */
function floorColor(palette: RoomScenePalette, temperature: number | null, tinted: boolean): string {
  if (!tinted || temperature == null) return palette.floor;
  return `#${new Color(roomTemperatureColor(temperature))
    .lerp(new Color(palette.floor), 0.42)
    .getHexString()}`;
}

interface RoomSceneProps {
  zones: readonly ResolvedRoomZone[];
  layers: RoomLayerState;
  /** 一覧で選んでいる場所。3D側で床を光らせる */
  focusKey: string | null;
  dark: boolean;
  /** 狭い画面。カメラを少し引いて部屋全体が入るようにする */
  compact: boolean;
  reduceMotion: boolean;
  onSelectZone: (key: string) => void;
}

/** 見下ろす角度（ラジアン）。真上からだと壁で中が隠れ、低すぎると奥の部屋が見えない */
const CAMERA_ELEVATION = 0.78;
const CAMERA_AZIMUTH = 0.62;
const CAMERA_TARGET: [number, number, number] = [0, 0.4, 0];

function cameraPosition(distance: number): [number, number, number] {
  return [
    CAMERA_TARGET[0] + distance * Math.cos(CAMERA_ELEVATION) * Math.sin(CAMERA_AZIMUTH),
    CAMERA_TARGET[1] + distance * Math.sin(CAMERA_ELEVATION),
    CAMERA_TARGET[2] + distance * Math.cos(CAMERA_ELEVATION) * Math.cos(CAMERA_AZIMUTH),
  ];
}

export function RoomScene({
  zones,
  layers,
  focusKey,
  dark,
  compact,
  reduceMotion,
  onSelectZone,
}: RoomSceneProps) {
  const palette = PALETTES[dark ? "dark" : "light"];
  const distance = compact ? 16.4 : 13.6;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: 38, near: 0.1, far: 200, position: cameraPosition(distance) }}
      aria-label="部屋の3D表示"
    >
      <ambientLight intensity={dark ? 0.66 : 0.78} />
      <directionalLight position={[6, 12, 8]} intensity={dark ? 0.5 : 0.62} />
      <directionalLight position={[-8, 5, -6]} intensity={0.24} color="#bcd4e8" />

      {ROOM_WALL_PARTS.map((part, index) => (
        <mesh key={`wall-${index}`} position={part.position}>
          <boxGeometry args={part.size} />
          <meshLambertMaterial color={toneColor(palette, part.tone)} />
        </mesh>
      ))}

      {ROOM_FURNITURE.map((part, index) => (
        <mesh key={`furniture-${index}`} position={part.position}>
          <boxGeometry args={part.size} />
          <meshLambertMaterial color={toneColor(palette, part.tone)} />
        </mesh>
      ))}

      {zones.map((zone) => (
        <RoomZoneParts
          key={zone.key}
          zone={zone}
          layers={layers}
          palette={palette}
          focused={focusKey === zone.key}
          reduceMotion={reduceMotion}
          onSelect={onSelectZone}
        />
      ))}

      <OrbitControls
        target={CAMERA_TARGET}
        enablePan={false}
        minDistance={7}
        maxDistance={26}
        minPolarAngle={0.22}
        maxPolarAngle={1.35}
        makeDefault
      />
    </Canvas>
  );
}

interface RoomZonePartsProps {
  zone: ResolvedRoomZone;
  layers: RoomLayerState;
  palette: RoomScenePalette;
  focused: boolean;
  reduceMotion: boolean;
  onSelect: (key: string) => void;
}

function RoomZoneParts({
  zone,
  layers,
  palette,
  focused,
  reduceMotion,
  onSelect,
}: RoomZonePartsProps) {
  const [centerX, centerZ] = zone.center;
  const width = zone.rect.x1 - zone.rect.x0;
  const depth = zone.rect.z1 - zone.rect.z0;

  const airconMount = zone.acId != null ? ROOM_AIRCON_MOUNTS[zone.key] : undefined;
  const airconOn = zone.aircon != null && !isAirconPowerOff(zone.aircon.power);
  const airconColor = getAirconModeColor(zone.aircon?.mode);

  const ceiling = ROOM_CEILING_LIGHTS[zone.key];
  const lightOn = zone.light?.status === "on";

  // 掃除は「いちばん急ぐ1件」だけを3Dに出す。1つの場所に複数を重ねると帯もピンも読めない
  const urgentCleaning =
    zone.cleaning.length > 0
      ? [...zone.cleaning].sort((a, b) => a.days_until - b.days_until)[0]
      : null;
  const cleaningRadius = Math.max(Math.min(width, depth) / 2 - 0.35, 0.3);

  return (
    <group>
      {/* 床。温度の色を敷き、押すとその場所を選ぶ */}
      <mesh
        position={[centerX, -0.06, centerZ]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(zone.key);
        }}
      >
        <boxGeometry args={[width - 0.04, 0.12, depth - 0.04]} />
        <meshLambertMaterial
          color={floorColor(palette, zone.temperature, layers.temperature)}
          emissive={focused ? "#1b3d55" : "#000000"}
        />
      </mesh>

      {focused ? (
        <mesh rotation-x={-Math.PI / 2} position={[centerX, 0.02, centerZ]}>
          <planeGeometry args={[width - 0.1, depth - 0.1]} />
          <meshBasicMaterial
            color="#3498db"
            transparent
            opacity={0.16}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ) : null}

      {/* エアコン本体。運転中だけ吹き出し口がモードの色で光る */}
      {airconMount ? (
        <group position={airconMount}>
          <mesh>
            <boxGeometry args={[1.05, 0.3, 0.26]} />
            <meshLambertMaterial color={palette.fixture} />
          </mesh>
          <mesh position={[0, -0.12, 0.14]}>
            <boxGeometry args={[0.92, 0.08, 0.06]} />
            <meshLambertMaterial
              color={airconColor}
              emissive={layers.aircon && airconOn ? airconColor : "#000000"}
            />
          </mesh>
        </group>
      ) : null}

      {airconMount && layers.aircon && airconOn && !reduceMotion ? (
        <AirconAirflow origin={airconMount} color={airconColor} />
      ) : null}

      {/* シーリングライト。点灯していれば光の円錐を落とす */}
      {ceiling ? (
        <group>
          <mesh position={ceiling}>
            <cylinderGeometry args={[0.42, 0.42, 0.08, 24]} />
            <meshLambertMaterial
              color={palette.fixture}
              emissive={layers.light && lightOn ? "#e8a13a" : "#000000"}
            />
          </mesh>
          {layers.light && lightOn ? (
            <mesh position={[ceiling[0], ceiling[1] - 0.98, ceiling[2]]}>
              <coneGeometry args={[1.75, 1.94, 28, 1, true]} />
              <meshBasicMaterial
                color="#e8a13a"
                transparent
                opacity={0.13}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ) : null}
        </group>
      ) : null}

      {/* 掃除。その場所の床を状態の色で囲う */}
      {layers.cleaning && urgentCleaning ? (
        <mesh rotation-x={-Math.PI / 2} position={[centerX, 0.015, centerZ]}>
          <ringGeometry args={[cleaningRadius - 0.09, cleaningRadius, 48]} />
          <meshBasicMaterial
            color={ROOM_CLEANING_STATUS_COLORS[urgentCleaning.status]}
            transparent
            opacity={0.55}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ) : null}

      {/* 値のピン。3Dの中ではなくDOMとして重ねる */}
      {layers.temperature && zone.temperature != null ? (
        <RoomPin
          position={[centerX, 1.02, centerZ]}
          color={roomTemperatureColor(zone.temperature)}
          name={zone.name}
          value={`${zone.temperature.toFixed(1)}℃`}
          highlighted={focused}
        />
      ) : null}

      {layers.aircon && airconMount && zone.aircon ? (
        <RoomPin
          position={[airconMount[0], airconMount[1] + 0.44, airconMount[2] + 0.14]}
          color={airconOn ? airconColor : "#93999f"}
          name={airconOn ? formatAirconMode(zone.aircon.mode) : "エアコン"}
          value={
            airconOn && zone.aircon.target_temperature != null
              ? `${zone.aircon.target_temperature}℃`
              : "停止中"
          }
          highlighted={focused}
        />
      ) : null}

      {layers.light && ceiling && zone.light ? (
        <RoomPin
          position={[ceiling[0], ceiling[1] + 0.38, ceiling[2]]}
          color={lightOn ? "#e8a13a" : "#93999f"}
          name="照明"
          value={lightOn ? "点灯" : "消灯"}
          highlighted={focused}
        />
      ) : null}

      {layers.cleaning && urgentCleaning ? (
        <RoomPin
          position={[centerX, 1.55, centerZ + 0.5]}
          color={ROOM_CLEANING_STATUS_COLORS[urgentCleaning.status]}
          name={urgentCleaning.name}
          value={formatCleaningCountdown(urgentCleaning)}
          highlighted={focused}
        />
      ) : null}
    </group>
  );
}

interface RoomPinProps {
  position: [number, number, number];
  color: string;
  name: string;
  value: string;
  highlighted: boolean;
}

/**
 * 3D上の1点に添える小さな札。**押せない**（`pointer-events: none`）。
 * 3Dの上で押せるのは床だけにして、狙いにくい小さな的を作らない。
 */
function RoomPin({ position, color, name, value, highlighted }: RoomPinProps) {
  return (
    <Html position={position} zIndexRange={[30, 10]} style={{ pointerEvents: "none" }}>
      <div
        className={`-translate-x-4 -translate-y-full whitespace-nowrap rounded-full border bg-card/90 py-1 pl-2 pr-2.5 text-[11px] leading-tight shadow-sm backdrop-blur-sm ${
          highlighted ? "ring-2 ring-[var(--temp-color)]" : ""
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{name}</span>
          <span className="font-semibold tabular-nums text-foreground">{value}</span>
        </span>
      </div>
    </Html>
  );
}

/**
 * エアコンの風。運転中であることを、色だけでなく動きでも伝える。
 * `prefers-reduced-motion` のときは呼び出し側がこれ自体を描かない。
 */
function AirconAirflow({
  origin,
  color,
}: {
  origin: [number, number, number];
  color: string;
}) {
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    const node = group.current;
    if (!node) return;
    const elapsed = clock.getElapsedTime();
    node.children.forEach((child, index) => {
      const progress = (elapsed * 0.34 + index / node.children.length) % 1;
      child.position.set(progress * 1.15, -progress * 0.72, progress * 1.5);
      child.scale.setScalar(0.6 + progress * 1.5);
      const material = (child as Mesh).material as MeshBasicMaterial;
      material.opacity = 0.3 * (1 - progress) * Math.min(progress * 5, 1);
    });
  });

  return (
    <group ref={group} position={origin}>
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index} rotation-x={-Math.PI / 2.6}>
          <circleGeometry args={[0.2, 20]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
