import { GRID_SIZE } from '../constants';
import { TileData } from '../types';

export type WaterShipKind = 'cargo' | 'commercial';

export interface WaterWaypoint {
  x: number;
  y: number;
  z: number;
}

export interface WaterSplineSegment {
  p0: WaterWaypoint;
  p1: WaterWaypoint;
  p2: WaterWaypoint;
  p3: WaterWaypoint;
  length: number;
  cumulativeStart: number;
}

export interface WaterShipRoute {
  id: string;
  kind: WaterShipKind;
  waypoints: WaterWaypoint[];
  segments: WaterSplineSegment[];
  totalLength: number;
  baseSpeed: number;
  bobFrequency: number;
  bobAmplitude: number;
  rollFrequency: number;
  rollAmplitude: number;
  phaseOffset: number;
}

export interface WaterShipSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  pitch: number;
  sternX: number;
  sternZ: number;
}

export interface WaterShipAgent {
  id: string;
  route: WaterShipRoute;
  distance: number;
  direction: 1 | -1;
  elapsedTime: number;
  currentX: number;
  currentY: number;
  currentZ: number;
  currentYaw: number;
  currentRoll: number;
}

const TILE_WORLD_SIZE_WATER = 3.2;
const WATER_SURFACE_Y = -0.24;

function gridToWorldCenter(gx: number, gz: number): { wx: number; wz: number } {
  const halfBoard = (GRID_SIZE * TILE_WORLD_SIZE_WATER) / 2;
  return {
    wx: gx * TILE_WORLD_SIZE_WATER - halfBoard + TILE_WORLD_SIZE_WATER / 2,
    wz: gz * TILE_WORLD_SIZE_WATER - halfBoard + TILE_WORLD_SIZE_WATER / 2,
  };
}

function catmullRomPoint(
  p0: WaterWaypoint,
  p1: WaterWaypoint,
  p2: WaterWaypoint,
  p3: WaterWaypoint,
  t: number
): WaterWaypoint {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  const z =
    0.5 *
    (2 * p1.z +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);

  return { x, y, z };
}

function buildSplineSegments(waypoints: WaterWaypoint[]): {
  segments: WaterSplineSegment[];
  totalLength: number;
} {
  const segments: WaterSplineSegment[] = [];
  let totalLength = 0;

  if (waypoints.length < 2) {
    return { segments, totalLength: 0 };
  }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, i + 2)];

    let segLen = 0;
    let prev = p1;
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const cur = catmullRomPoint(p0, p1, p2, p3, s / steps);
      segLen += Math.hypot(cur.x - prev.x, cur.z - prev.z);
      prev = cur;
    }
    segLen = Math.max(0.1, segLen);
    segments.push({
      p0,
      p1,
      p2,
      p3,
      length: segLen,
      cumulativeStart: totalLength,
    });
    totalLength += segLen;
  }

  return { segments, totalLength };
}

/**
 * Tìm chuỗi các ô `river_water` liên thông trên bản đồ để tạo từ 2–4 tuyến tàu thủy
 * (`Cargo Ship` chở container và `Commercial Ship` chở khách) di chuyển mượt theo spline.
 */
export function generateWaterShipRoutesFromGrid(
  grid: TileData[][],
  desiredCount = 3
): WaterShipRoute[] {
  const targetCount = Math.max(2, Math.min(4, desiredCount));
  const riverCoords: { x: number; z: number }[] = [];
  const riverSet = new Set<string>();

  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[z]?.[x]?.type === 'river_water') {
        riverCoords.push({ x, z });
        riverSet.add(`${x},${z}`);
      }
    }
  }

  if (riverCoords.length < 2) {
    return [];
  }

  // Gom các ô sông theo từng hàng Z (hoặc cột X) để tạo đường tim sông mượt mà
  const rowBuckets = new Map<number, number[]>();
  const colBuckets = new Map<number, number[]>();
  for (const rc of riverCoords) {
    const rList = rowBuckets.get(rc.z) ?? [];
    rList.push(rc.x);
    rowBuckets.set(rc.z, rList);

    const cList = colBuckets.get(rc.x) ?? [];
    cList.push(rc.z);
    colBuckets.set(rc.x, cList);
  }

  const centerSpine: { x: number; z: number }[] = [];

  if (rowBuckets.size >= colBuckets.size) {
    const sortedRows = Array.from(rowBuckets.keys()).sort((a, b) => a - b);
    for (const z of sortedRows) {
      const xs = rowBuckets.get(z)!.sort((a, b) => a - b);
      const midX = (xs[0] + xs[xs.length - 1]) / 2;
      centerSpine.push({ x: midX, z });
    }
  } else {
    const sortedCols = Array.from(colBuckets.keys()).sort((a, b) => a - b);
    for (const x of sortedCols) {
      const zs = colBuckets.get(x)!.sort((a, b) => a - b);
      const midZ = (zs[0] + zs[zs.length - 1]) / 2;
      centerSpine.push({ x, z: midZ });
    }
  }

  if (centerSpine.length < 2) {
    return [];
  }

  const routes: WaterShipRoute[] = [];
  const laneOffsets = [-0.55, 0.55, -0.22, 0.22];

  for (let idx = 0; idx < targetCount; idx++) {
    const kind: WaterShipKind = idx % 2 === 0 ? 'cargo' : 'commercial';
    const laneOffset = laneOffsets[idx % laneOffsets.length];
    const waypoints: WaterWaypoint[] = [];

    for (let i = 0; i < centerSpine.length; i++) {
      const pt = centerSpine[i];
      const nextPt = centerSpine[Math.min(centerSpine.length - 1, i + 1)];
      const prevPt = centerSpine[Math.max(0, i - 1)];
      const dx = nextPt.x - prevPt.x;
      const dz = nextPt.z - prevPt.z;
      const len = Math.max(0.001, Math.hypot(dx, dz));
      // Pháp tuyến ngang lòng sông để phân làn 2 chiều không va nhau
      const nx = -dz / len;
      const nz = dx / len;

      const centerWorld = gridToWorldCenter(pt.x, pt.z);
      waypoints.push({
        x: centerWorld.wx + nx * laneOffset,
        y: WATER_SURFACE_Y,
        z: centerWorld.wz + nz * laneOffset,
      });
    }

    if (idx % 2 === 1) {
      waypoints.reverse();
    }

    const { segments, totalLength } = buildSplineSegments(waypoints);
    if (totalLength <= 0.5) continue;

    routes.push({
      id: `water_ship_route_${idx}`,
      kind,
      waypoints,
      segments,
      totalLength,
      baseSpeed: kind === 'cargo' ? 1.55 : 2.15,
      bobFrequency: kind === 'cargo' ? 1.8 : 2.4,
      bobAmplitude: kind === 'cargo' ? 0.032 : 0.042,
      rollFrequency: kind === 'cargo' ? 1.35 : 1.9,
      rollAmplitude: kind === 'cargo' ? 0.045 : 0.065,
      phaseOffset: idx * 1.7,
    });
  }

  return routes;
}

export function sampleWaterRouteAtDistance(
  route: WaterShipRoute,
  distance: number,
  elapsedTime = 0
): WaterShipSample {
  if (route.segments.length === 0 || route.totalLength <= 0) {
    return {
      x: 0,
      y: WATER_SURFACE_Y,
      z: 0,
      yaw: 0,
      roll: 0,
      pitch: 0,
      sternX: 0,
      sternZ: 0,
    };
  }

  const clampedDist =
    ((distance % route.totalLength) + route.totalLength) % route.totalLength;

  let seg = route.segments[route.segments.length - 1];
  for (let i = 0; i < route.segments.length; i++) {
    const candidate = route.segments[i];
    if (clampedDist <= candidate.cumulativeStart + candidate.length) {
      seg = candidate;
      break;
    }
  }

  const localT = Math.max(
    0,
    Math.min(1, (clampedDist - seg.cumulativeStart) / Math.max(0.001, seg.length))
  );
  const aheadT = Math.min(1, localT + 0.04);
  const behindT = Math.max(0, localT - 0.04);

  const pos = catmullRomPoint(seg.p0, seg.p1, seg.p2, seg.p3, localT);
  const ahead = catmullRomPoint(seg.p0, seg.p1, seg.p2, seg.p3, aheadT);
  const behind = catmullRomPoint(seg.p0, seg.p1, seg.p2, seg.p3, behindT);

  const tx = ahead.x - behind.x;
  const tz = ahead.z - behind.z;
  const yaw = Math.atan2(tx, tz);

  // Chuyển động nhấp nhô nhẹ theo sóng (bobbing trục Y và roll nhẹ)
  const wavePhase = elapsedTime * route.bobFrequency + route.phaseOffset;
  const bobY = Math.sin(wavePhase) * route.bobAmplitude;
  const roll =
    Math.cos(elapsedTime * route.rollFrequency + route.phaseOffset) *
    route.rollAmplitude;
  const pitch = Math.cos(wavePhase * 0.85) * (route.bobAmplitude * 0.45);

  const sternOffset = route.kind === 'cargo' ? 1.05 : 0.78;
  const sternX = pos.x - Math.sin(yaw) * sternOffset;
  const sternZ = pos.z - Math.cos(yaw) * sternOffset;

  return {
    x: pos.x,
    y: pos.y + bobY,
    z: pos.z,
    yaw,
    roll,
    pitch,
    sternX,
    sternZ,
  };
}

export function createWaterShipAgent(
  route: WaterShipRoute,
  initialFraction = 0
): WaterShipAgent {
  const initialDist =
    ((initialFraction % 1) + 1) * route.totalLength * 0.5;
  const initSample = sampleWaterRouteAtDistance(route, initialDist, 0);
  return {
    id: route.id,
    route,
    distance: initialDist % route.totalLength,
    direction: 1,
    elapsedTime: 0,
    currentX: initSample.x,
    currentY: initSample.y,
    currentZ: initSample.z,
    currentYaw: initSample.yaw,
    currentRoll: initSample.roll,
  };
}

export function stepWaterShipAgent(
  agent: WaterShipAgent,
  dt: number
): WaterShipSample {
  agent.elapsedTime += dt;
  agent.distance =
    (agent.distance + agent.route.baseSpeed * dt) %
    Math.max(0.1, agent.route.totalLength);

  const sample = sampleWaterRouteAtDistance(
    agent.route,
    agent.distance,
    agent.elapsedTime
  );
  agent.currentX = sample.x;
  agent.currentY = sample.y;
  agent.currentZ = sample.z;
  agent.currentYaw = sample.yaw;
  agent.currentRoll = sample.roll;
  return sample;
}
