import { isRoadTile } from './rules';
import { TileData } from './types';

export const ROAD_TILE_WORLD_SIZE = 3.2;
export const ROAD_GRID_SIZE = 18;
export const VEHICLE_LANE_OFFSET = 0.48;

export interface DirVec2 {
  dx: number;
  dz: number;
}

export interface VehicleWaypoint {
  x: number;
  y: number;
  z: number;
  tileX: number;
  tileZ: number;
  isCurve: boolean;
}

export interface VehicleSplineRoute {
  id: string;
  kind: 'motorbike' | 'bus' | 'truck';
  speed: number;
  points: VehicleWaypoint[];
  cumulativeLengths: number[];
  totalLength: number;
  hasCurvedSegments: boolean;
}

export interface SampledVehicleTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tangentX: number;
  tangentZ: number;
  isCurve: boolean;
}

const CARDINAL_DIRS: DirVec2[] = [
  { dx: 0, dz: -1 }, // North (-Z)
  { dx: 1, dz: 0 },  // East (+X)
  { dx: 0, dz: 1 },  // South (+Z)
  { dx: -1, dz: 0 }, // West (-X)
];

/**
 * Vector pháp tuyến bên phải (Right-hand traffic lane normal) trong mặt phẳng (X, Z):
 * - Đi hướng Đông (+1, 0) -> Làn bên phải nằm ở phía Nam (0, +1)
 * - Đi hướng Tây (-1, 0) -> Làn bên phải nằm ở phía Bắc (0, -1)
 * - Đi hướng Nam (0, +1) -> Làn bên phải nằm ở phía Tây (-1, 0)
 * - Đi hướng Bắc (0, -1) -> Làn bên phải nằm ở phía Đông (+1, 0)
 */
export function getRightHandNormal(dir: DirVec2): DirVec2 {
  return {
    dx: -dir.dz,
    dz: dir.dx,
  };
}

export function isSameDir(a: DirVec2, b: DirVec2): boolean {
  return a.dx === b.dx && a.dz === b.dz;
}

export function isReverseDir(a: DirVec2, b: DirVec2): boolean {
  return a.dx === -b.dx && a.dz === -b.dz;
}

/**
 * Tính vector hướng đơn vị (Cardinal Direction) từ ô `from` sang ô `to` liền kề.
 * Tuyệt đối không dùng `Math.sign(dx) || 1` vì sẽ làm lệch hướng Bắc-Nam (dx = 0) thành đường chéo!
 */
export function getCardinalDirBetweenTiles(
  from: { x: number; z: number },
  to: { x: number; z: number }
): DirVec2 {
  const rawDx = to.x - from.x;
  const rawDz = to.z - from.z;
  if (Math.abs(rawDx) >= Math.abs(rawDz)) {
    const sx = Math.sign(rawDx);
    return sx !== 0 ? { dx: sx, dz: 0 } : { dx: 1, dz: 0 };
  }
  const sz = Math.sign(rawDz);
  return sz !== 0 ? { dx: 0, dz: sz } : { dx: 0, dz: 1 };
}

/**
 * Nội suy góc ngắn nhất (Shortest-arc angle lerp) để xe ôm cua mượt không bị giật góc -PI <-> +PI
 */
export function lerpAngle(currentYaw: number, targetYaw: number, alpha: number): number {
  let diff = targetYaw - currentYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return currentYaw + diff * Math.max(0, Math.min(1, alpha));
}

function tileCenterWorld(tileX: number, tileZ: number): { cx: number; cz: number } {
  const halfBoard = (ROAD_GRID_SIZE * ROAD_TILE_WORLD_SIZE) / 2;
  return {
    cx: tileX * ROAD_TILE_WORLD_SIZE - halfBoard + ROAD_TILE_WORLD_SIZE / 2,
    cz: tileZ * ROAD_TILE_WORLD_SIZE - halfBoard + ROAD_TILE_WORLD_SIZE / 2,
  };
}

function getRoadSurfaceY(tile: TileData): number {
  return tile.type === 'road_highway' ? 0.92 : 0.1;
}

/**
 * Tạo các điểm nội suy (Spline / Bezier waypoints) cho một phương tiện đi qua ô đường (tileX, tileZ)
 * từ hướng `inDir` sang hướng `outDir`:
 * - Nếu đi thẳng (`inDir === outDir`): Nội suy tuyến tính (Linear Lerp) dọc theo làn bên phải.
 * - Nếu rẽ 90 độ tại góc cua chữ L, Ngã Ba (T-junction) hoặc Ngã Tư (Crossroad):
 *   Nội suy đường cong Quadratic Bézier qua giao điểm của làn vào và làn ra (C1 tangent-continuous).
 * - Nếu quay đầu tại điểm đầu/cuối (`outDir === reverse(inDir)`):
 *   Nội suy đường cong Cubic Bézier 180 độ mượt từ làn đi sang làn về.
 */
export function buildTileLaneCurvePoints(
  tile: TileData,
  inDir: DirVec2,
  outDir: DirVec2,
  nextTile?: TileData
): VehicleWaypoint[] {
  const { cx, cz } = tileCenterWorld(tile.x, tile.z);
  const halfTile = ROAD_TILE_WORLD_SIZE / 2;
  const rIn = getRightHandNormal(inDir);
  const rOut = getRightHandNormal(outDir);

  const yStart = getRoadSurfaceY(tile);
  const yEnd = nextTile ? (yStart + getRoadSurfaceY(nextTile)) * 0.5 : yStart;

  const entryX = cx - inDir.dx * halfTile + rIn.dx * VEHICLE_LANE_OFFSET;
  const entryZ = cz - inDir.dz * halfTile + rIn.dz * VEHICLE_LANE_OFFSET;

  const exitX = cx + outDir.dx * halfTile + rOut.dx * VEHICLE_LANE_OFFSET;
  const exitZ = cz + outDir.dz * halfTile + rOut.dz * VEHICLE_LANE_OFFSET;

  const points: VehicleWaypoint[] = [];

  if (isSameDir(inDir, outDir)) {
    // Đoạn đường thẳng: lấy 4 điểm chia đều theo Linear Lerp
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      points.push({
        x: entryX + (exitX - entryX) * t,
        y: yStart + (yEnd - yStart) * t,
        z: entryZ + (exitZ - entryZ) * t,
        tileX: tile.x,
        tileZ: tile.z,
        isCurve: false,
      });
    }
    return points;
  }

  if (isReverseDir(inDir, outDir)) {
    // Quay đầu (U-turn) mượt tại đầu mút bằng đường cong Cubic Bézier
    const turnDepth = 0.52;
    const p1x = cx + inDir.dx * turnDepth + rIn.dx * VEHICLE_LANE_OFFSET;
    const p1z = cz + inDir.dz * turnDepth + rIn.dz * VEHICLE_LANE_OFFSET;
    const p2x = cx + inDir.dx * turnDepth + rOut.dx * VEHICLE_LANE_OFFSET;
    const p2z = cz + inDir.dz * turnDepth + rOut.dx * VEHICLE_LANE_OFFSET;

    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const bx =
        u * u * u * entryX +
        3 * u * u * t * p1x +
        3 * u * t * t * p2x +
        t * t * t * exitX;
      const bz =
        u * u * u * entryZ +
        3 * u * u * t * p1z +
        3 * u * t * t * p2z +
        t * t * t * exitZ;
      points.push({
        x: bx,
        y: yStart + (yEnd - yStart) * t,
        z: bz,
        tileX: tile.x,
        tileZ: tile.z,
        isCurve: true,
      });
    }
    return points;
  }

  // Khúc cua 90 độ (Góc chữ L, Ngã Ba T-Junction, Ngã Tư Cross-Intersection):
  // Điểm điều khiển P_ctrl là giao điểm chính xác của tâm làn vào và tâm làn ra!
  const ctrlX = cx + (rIn.dx + rOut.dx) * VEHICLE_LANE_OFFSET;
  const ctrlZ = cz + (rIn.dz + rOut.dz) * VEHICLE_LANE_OFFSET;

  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const bx = u * u * entryX + 2 * u * t * ctrlX + t * t * exitX;
    const bz = u * u * entryZ + 2 * u * t * ctrlZ + t * t * exitZ;
    points.push({
      x: bx,
      y: yStart + (yEnd - yStart) * t,
      z: bz,
      tileX: tile.x,
      tileZ: tile.z,
      isCurve: true,
    });
  }

  return points;
}

function getConnectedRoadNeighbors(
  grid: TileData[][],
  x: number,
  z: number
): { dir: DirVec2; nx: number; nz: number; tile: TileData }[] {
  const res: { dir: DirVec2; nx: number; nz: number; tile: TileData }[] = [];
  for (const dir of CARDINAL_DIRS) {
    const nx = x + dir.dx;
    const nz = z + dir.dz;
    if (
      nz >= 0 &&
      nz < grid.length &&
      nx >= 0 &&
      nx < grid[0].length &&
      isRoadTile(grid[nz][nx].type)
    ) {
      res.push({ dir, nx, nz, tile: grid[nz][nx] });
    }
  }
  return res;
}

function finalizeSplineRoute(
  id: string,
  kind: 'motorbike' | 'bus' | 'truck',
  rawPoints: VehicleWaypoint[]
): VehicleSplineRoute | null {
  if (rawPoints.length < 4) return null;

  // Lọc bỏ các điểm trùng lặp quá sát nhau (< 0.02) để tránh đạo hàm tangent = 0 gây giật góc yaw
  const cleanedPoints: VehicleWaypoint[] = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const curr = rawPoints[i];
    const prev =
      cleanedPoints.length > 0 ? cleanedPoints[cleanedPoints.length - 1] : null;
    if (
      !prev ||
      Math.hypot(curr.x - prev.x, curr.y - prev.y, curr.z - prev.z) >= 0.02
    ) {
      cleanedPoints.push(curr);
    }
  }
  if (cleanedPoints.length < 4) return null;

  const cumulativeLengths: number[] = [0];
  let totalLength = 0;
  let hasCurvedSegments = false;

  for (let i = 0; i < cleanedPoints.length; i++) {
    if (cleanedPoints[i].isCurve) hasCurvedSegments = true;
    const curr = cleanedPoints[i];
    const next = cleanedPoints[(i + 1) % cleanedPoints.length];
    const segLen = Math.hypot(next.x - curr.x, next.y - curr.y, next.z - curr.z);
    totalLength += segLen;
    cumulativeLengths.push(totalLength);
  }

  if (totalLength < 1.0) return null;

  const speed = kind === 'truck' ? 5.6 : kind === 'bus' ? 4.2 : 4.9;
  return {
    id,
    kind,
    speed,
    points: cleanedPoints,
    cumulativeLengths,
    totalLength,
    hasCurvedSegments,
  };
}

export interface RoadNodeCoord {
  x: number;
  z: number;
}

export type NodeOccupancyMap = Map<string, string>;

export interface VehicleNavAgentState {
  id: string;
  kind: 'motorbike' | 'bus' | 'truck';
  route: VehicleSplineRoute;
  distance: number;
  currentYaw: number;
  currentTile: RoadNodeCoord;
  targetTile: RoadNodeCoord;
  destinationTile: RoadNodeCoord;
  stuckTimerSeconds: number;
  repathCount: number;
  despawnedSafely: boolean;
  statusReason: 'moving' | 'waiting_node' | 'repathing' | 'despawned';
}

// Lưu hướng di chuyển tức thời của các phương tiện đang hoạt động để cho phép 2 xe ngược chiều
// đi trên 2 làn đường đối diện nhau không khóa lẫn nhau (tránh Head-On Deadlock).
const activeVehicleHeadingMap = new Map<string, DirVec2>();

export function nodeKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function releaseVehicleNodeOccupancy(
  occupancyMap: NodeOccupancyMap,
  vehicleId: string
): void {
  for (const [k, owner] of occupancyMap.entries()) {
    if (owner === vehicleId) {
      occupancyMap.delete(k);
    }
  }
  activeVehicleHeadingMap.delete(vehicleId);
}

export function isNodeOccupiedByOther(
  occupancyMap: NodeOccupancyMap,
  x: number,
  z: number,
  vehicleId: string
): boolean {
  const owner = occupancyMap.get(nodeKey(x, z));
  return Boolean(owner && owner !== vehicleId);
}

function getRoadTileStepCost(tile: TileData): number {
  if (tile.type === 'road_highway') return 0.88;
  if (tile.type === 'road_urban') return 0.96;
  return 1.08;
}

/**
 * Thuật toán A* Pathfinding tìm đường đi ngắn nhất trên mạng lưới ô đường (Road Grid),
 * tự động né các node đang bị chiếm chỗ (blockedNodes) hoặc đã bị xóa, đồng thời ưu tiên
 * đi thẳng trên đường trục chính thay vì rẽ zíc-zắc liên tục.
 */
export function findAStarRoadPath(
  grid: TileData[][],
  start: RoadNodeCoord,
  goal: RoadNodeCoord,
  blockedNodes: Set<string> = new Set()
): RoadNodeCoord[] | null {
  if (
    start.z < 0 ||
    start.z >= grid.length ||
    start.x < 0 ||
    start.x >= grid[0].length ||
    goal.z < 0 ||
    goal.z >= grid.length ||
    goal.x < 0 ||
    goal.x >= grid[0].length
  ) {
    return null;
  }

  if (
    !isRoadTile(grid[start.z][start.x].type) ||
    !isRoadTile(grid[goal.z][goal.x].type)
  ) {
    return null;
  }

  const startK = nodeKey(start.x, start.z);
  const goalK = nodeKey(goal.x, goal.z);
  if (blockedNodes.has(goalK) && goalK !== startK) {
    return null;
  }
  if (startK === goalK) {
    return null;
  }

  const openSet = new Set<string>([startK]);
  const coordByKey = new Map<string, RoadNodeCoord>([[startK, start]]);
  const cameFrom = new Map<string, string>();
  const dirFromParent = new Map<string, DirVec2>();
  const gScore = new Map<string, number>([[startK, 0]]);
  const fScore = new Map<string, number>([
    [startK, (Math.abs(goal.x - start.x) + Math.abs(goal.z - start.z)) * 0.85],
  ]);

  let iterations = 0;
  const maxIterations = grid.length * grid[0].length * 3;

  while (openSet.size > 0 && iterations < maxIterations) {
    iterations++;
    let currentKey = '';
    let lowestF = Infinity;
    for (const k of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentKey = k;
      }
    }

    if (!currentKey) break;
    if (currentKey === goalK) {
      const path: RoadNodeCoord[] = [];
      let curr: string | undefined = currentKey;
      while (curr) {
        const c = coordByKey.get(curr);
        if (c) path.unshift(c);
        curr = cameFrom.get(curr);
      }
      return path.length >= 2 ? path : null;
    }

    openSet.delete(currentKey);
    const currentCoord = coordByKey.get(currentKey)!;
    const prevDir = dirFromParent.get(currentKey);
    const neighbors = getConnectedRoadNeighbors(
      grid,
      currentCoord.x,
      currentCoord.z
    );

    for (const nb of neighbors) {
      const nbKey = nodeKey(nb.nx, nb.nz);
      if (blockedNodes.has(nbKey) && nbKey !== startK) continue;

      const stepCost = getRoadTileStepCost(nb.tile);
      const turnPenalty =
        prevDir && !isSameDir(prevDir, nb.dir) ? 0.08 : 0;
      const tentativeG =
        (gScore.get(currentKey) ?? Infinity) + stepCost + turnPenalty;

      if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
        cameFrom.set(nbKey, currentKey);
        dirFromParent.set(nbKey, nb.dir);
        coordByKey.set(nbKey, { x: nb.nx, z: nb.nz });
        gScore.set(nbKey, tentativeG);
        const h =
          (Math.abs(goal.x - nb.nx) + Math.abs(goal.z - nb.nz)) * 0.85;
        fScore.set(nbKey, tentativeG + h);
        openSet.add(nbKey);
      }
    }
  }

  return null;
}

/**
 * Chuyển đổi danh sách các ô đường liên tiếp từ A* Path (`[T_0, T_1, ..., T_{k-1}]`)
 * thành quỹ đạo khép kín C1-continuous (`VehicleSplineRoute`) bám chuẩn làn bên phải:
 * - Điểm bắt đầu (`distance = 0`) nằm ngay tại tâm/đầu ra của `T_0` hướng thẳng sang `T_1`.
 * - Đi dọc theo làn phải từ `T_0 -> T_1 -> ... -> T_{k-1}`.
 * - Tại `T_{k-1}` (`destinationTile`), thực hiện vòng quay đầu Cubic Bézier 180° mượt sang làn đối diện.
 * - Đi ngược về `T_{k-2} -> ... -> T_1 -> T_0` và quay đầu mượt tại `T_0` nối khít tuyệt đối vào điểm xuất phát (`distance = 0`),
 *   cam kết KHÔNG bao giờ nhảy cóc (teleport) qua các ô không liền kề hay đi lệch đường chéo!
 */
export function buildSplineRouteFromTilePath(
  id: string,
  kind: 'motorbike' | 'bus' | 'truck',
  grid: TileData[][],
  tilePath: RoadNodeCoord[]
): VehicleSplineRoute | null {
  if (tilePath.length < 2) return null;

  // Kiểm tra tất cả các ô trong tilePath đều là ô đường hợp lệ và liền kề nhau
  const cleanPath: RoadNodeCoord[] = [tilePath[0]];
  for (let i = 1; i < tilePath.length; i++) {
    const prev = cleanPath[cleanPath.length - 1];
    const curr = tilePath[i];
    if (curr.x === prev.x && curr.z === prev.z) continue;
    const manhattan = Math.abs(curr.x - prev.x) + Math.abs(curr.z - prev.z);
    if (manhattan !== 1) return null;
    const tile = grid[curr.z]?.[curr.x];
    if (!tile || !isRoadTile(tile.type)) return null;
    cleanPath.push(curr);
  }

  const startTile = grid[cleanPath[0].z]?.[cleanPath[0].x];
  if (!startTile || !isRoadTile(startTile.type)) return null;
  if (cleanPath.length < 2) return null;

  const k = cleanPath.length;

  // Trường hợp 1: Chu trình khép kín tự nhiên (Closed Ring >= 4 ô đường, ô cuối kề với ô đầu và không trùng ô thứ 2)
  const first = cleanPath[0];
  const second = cleanPath[1];
  const last = cleanPath[k - 1];
  const isNaturalClosedLoop =
    k >= 4 &&
    Math.abs(last.x - first.x) + Math.abs(last.z - first.z) === 1 &&
    (last.x !== second.x || last.z !== second.z);

  if (isNaturalClosedLoop) {
    const loopWaypoints: VehicleWaypoint[] = [];
    for (let i = 0; i < k; i++) {
      const prevCoord = cleanPath[(i - 1 + k) % k];
      const currCoord = cleanPath[i];
      const nextCoord = cleanPath[(i + 1) % k];
      const currTile = grid[currCoord.z][currCoord.x];
      const nextTile = grid[nextCoord.z][nextCoord.x];
      const inDir = getCardinalDirBetweenTiles(prevCoord, currCoord);
      const outDir = getCardinalDirBetweenTiles(currCoord, nextCoord);
      loopWaypoints.push(
        ...buildTileLaneCurvePoints(currTile, inDir, outDir, nextTile)
      );
    }
    return finalizeSplineRoute(id, kind, loopWaypoints);
  }

  // Trường hợp 2: Tuyến A* Point-to-Point từ T_0 -> T_{k-1} kèm hành trình khứ hồi T_{k-1} -> T_0
  const t0 = cleanPath[0];
  const t1 = cleanPath[1];
  const tile0 = grid[t0.z][t0.x];
  const tile1 = grid[t1.z][t1.x];

  const dir0to1 = getCardinalDirBetweenTiles(t0, t1);
  const dir1to0 = { dx: -dir0to1.dx, dz: -dir0to1.dz };

  // Khúc cua quay đầu tại T_0 (nối từ chiều về T_1->T_0 sang chiều đi T_0->T_1)
  const startUTurnPts = buildTileLaneCurvePoints(
    tile0,
    dir1to0,
    dir0to1,
    tile1
  );
  const splitIdx = Math.floor(startUTurnPts.length / 2);
  // Nửa sau của U-turn tại T_0 đi từ đỉnh T_0 thẳng ra biên T_1 (đặt làm điểm xuất phát distance = 0)
  const startExitHalf = startUTurnPts.slice(splitIdx);
  // Nửa đầu của U-turn tại T_0 đi từ biên T_1 vào đỉnh T_0 (đặt ở cuối chu trình để khép kín hoàn hảo)
  const startEntryHalf = startUTurnPts.slice(0, splitIdx);

  const waypoints: VehicleWaypoint[] = [...startExitHalf];

  // Lượt đi (Forward pass): T_1 .. T_{k-2}
  for (let i = 1; i <= k - 2; i++) {
    const prevCoord = cleanPath[i - 1];
    const currCoord = cleanPath[i];
    const nextCoord = cleanPath[i + 1];
    const currTile = grid[currCoord.z][currCoord.x];
    const nextTile = grid[nextCoord.z][nextCoord.x];
    const inDir = getCardinalDirBetweenTiles(prevCoord, currCoord);
    const outDir = getCardinalDirBetweenTiles(currCoord, nextCoord);
    waypoints.push(
      ...buildTileLaneCurvePoints(currTile, inDir, outDir, nextTile)
    );
  }

  // Khúc cua quay đầu tại điểm đích T_{k-1} (Goal U-turn)
  const tkMinus2 = cleanPath[k - 2];
  const tkMinus1 = cleanPath[k - 1];
  const goalTile = grid[tkMinus1.z][tkMinus1.x];
  const beforeGoalTile = grid[tkMinus2.z][tkMinus2.x];
  const dirIntoGoal = getCardinalDirBetweenTiles(tkMinus2, tkMinus1);
  const dirOutFromGoal = { dx: -dirIntoGoal.dx, dz: -dirIntoGoal.dz };
  waypoints.push(
    ...buildTileLaneCurvePoints(
      goalTile,
      dirIntoGoal,
      dirOutFromGoal,
      beforeGoalTile
    )
  );

  // Lượt về (Return pass): T_{k-2} .. T_1
  for (let i = k - 2; i >= 1; i--) {
    const prevCoord = cleanPath[i + 1];
    const currCoord = cleanPath[i];
    const nextCoord = cleanPath[i - 1];
    const currTile = grid[currCoord.z][currCoord.x];
    const nextTile = grid[nextCoord.z][nextCoord.x];
    const inDir = getCardinalDirBetweenTiles(prevCoord, currCoord);
    const outDir = getCardinalDirBetweenTiles(currCoord, nextCoord);
    waypoints.push(
      ...buildTileLaneCurvePoints(currTile, inDir, outDir, nextTile)
    );
  }

  // Khép vòng êm ái về lại đỉnh T_0
  waypoints.push(...startEntryHalf);

  return finalizeSplineRoute(id, kind, waypoints);
}

/**
 * Tự động dò tìm mạng lưới đường bộ trên bản đồ và sinh các tuyến đường A* (`findAStarRoadPath`)
 * bám sát làn đường bên phải qua cả đoạn thẳng, góc cua chữ L, Ngã Ba (T-junction) và Ngã Tư (Crossroad).
 */
export function generateVehicleRoutesFromGrid(
  grid: TileData[][]
): VehicleSplineRoute[] {
  const visitedTiles = new Set<string>();
  const routes: VehicleSplineRoute[] = [];

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      if (!isRoadTile(grid[z][x].type)) continue;
      const key = nodeKey(x, z);
      if (visitedTiles.has(key)) continue;

      // Gom nhóm liên thông (Connected Component) các ô đường nối liền nhau
      const component: TileData[] = [];
      const queue: RoadNodeCoord[] = [{ x, z }];
      visitedTiles.add(key);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        component.push(grid[curr.z][curr.x]);
        const neighbors = getConnectedRoadNeighbors(grid, curr.x, curr.z);
        for (const nb of neighbors) {
          const nKey = nodeKey(nb.nx, nb.nz);
          if (!visitedTiles.has(nKey)) {
            visitedTiles.add(nKey);
            queue.push({ x: nb.nx, z: nb.nz });
          }
        }
      }

      if (component.length < 2) continue;

      // Phân loại các nút đầu mút (degree === 1) và nút giao/góc cua để chọn cặp (Start, Goal) tối ưu cho A*
      const endpoints: TileData[] = [];
      const cornersOrJunctions: TileData[] = [];

      for (const t of component) {
        const nbs = getConnectedRoadNeighbors(grid, t.x, t.z);
        if (nbs.length === 1) {
          endpoints.push(t);
        } else if (nbs.length >= 3) {
          cornersOrJunctions.push(t);
        } else if (
          nbs.length === 2 &&
          !isReverseDir(nbs[0].dir, nbs[1].dir)
        ) {
          cornersOrJunctions.push(t);
        }
      }

      const candidateAnchors =
        endpoints.length > 0
          ? [...endpoints, ...cornersOrJunctions]
          : cornersOrJunctions.length > 0
          ? cornersOrJunctions
          : component;

      const hasHighway = component.some((t) => t.type === 'road_highway');
      const maxRoutesForComponent =
        component.length >= 10 ? 3 : component.length >= 5 ? 2 : 1;

      const usedPairKeys = new Set<string>();
      const primaryInteriorPenalty = new Set<string>();

      for (let rIdx = 0; rIdx < maxRoutesForComponent; rIdx++) {
        const startAnchor =
          candidateAnchors[rIdx % candidateAnchors.length] ?? component[0];

        // Chọn điểm đích (goal) trong cùng component có khoảng cách xa nhất từ startAnchor
        let bestPath: RoadNodeCoord[] | null = null;
        let bestScore = -1;

        for (const goalCandidate of component) {
          if (
            goalCandidate.x === startAnchor.x &&
            goalCandidate.z === startAnchor.z
          ) {
            continue;
          }
          const pairK1 = `${startAnchor.x},${startAnchor.z}->${goalCandidate.x},${goalCandidate.z}`;
          const pairK2 = `${goalCandidate.x},${goalCandidate.z}->${startAnchor.x},${startAnchor.z}`;
          if (usedPairKeys.has(pairK1) || usedPairKeys.has(pairK2)) continue;

          // Với tuyến thứ 2 trở đi, thử tìm nhánh đường thay thế trước (nếu có) để phủ đều các nhánh Ngã Ba / Ngã Tư
          let path =
            rIdx > 0 && primaryInteriorPenalty.size > 0
              ? findAStarRoadPath(
                  grid,
                  { x: startAnchor.x, z: startAnchor.z },
                  { x: goalCandidate.x, z: goalCandidate.z },
                  primaryInteriorPenalty
                )
              : null;

          if (!path) {
            path = findAStarRoadPath(
              grid,
              { x: startAnchor.x, z: startAnchor.z },
              { x: goalCandidate.x, z: goalCandidate.z }
            );
          }

          if (path && path.length >= 2) {
            const isEndpointGoal = endpoints.some(
              (e) => e.x === goalCandidate.x && e.z === goalCandidate.z
            );
            const score = path.length + (isEndpointGoal ? 1.5 : 0);
            if (score > bestScore) {
              bestScore = score;
              bestPath = path;
            }
          }
        }

        if (!bestPath || bestPath.length < 2) continue;

        const goalNode = bestPath[bestPath.length - 1];
        usedPairKeys.add(
          `${startAnchor.x},${startAnchor.z}->${goalNode.x},${goalNode.z}`
        );

        // Đánh dấu1 ô giữa của tuyến đầu tiên để tuyến thứ 2 ưu tiên rẽ qua nhánh khác nếu mạng lưới có vòng lặp
        if (rIdx === 0 && bestPath.length >= 4) {
          const midNode = bestPath[Math.floor(bestPath.length / 2)];
          primaryInteriorPenalty.add(nodeKey(midNode.x, midNode.z));
        }

        const kind: 'motorbike' | 'bus' | 'truck' = hasHighway
          ? rIdx === 0
            ? 'truck'
            : 'bus'
          : component.length >= 5 && rIdx === 1
          ? 'bus'
          : 'motorbike';

        const route = buildSplineRouteFromTilePath(
          `route_${startAnchor.x}_${startAnchor.z}_${rIdx}`,
          kind,
          grid,
          bestPath
        );
        if (route) {
          routes.push(route);
        }
      }
    }
  }

  return routes;
}

/**
 * Lấy vị trí nội suy (Position Lerp) và góc hướng mũi xe (Tangent Yaw) tại quãng đường `distance` trên Spline.
 */
export function sampleRouteAtDistance(
  route: VehicleSplineRoute,
  distance: number
): SampledVehicleTransform {
  const total = route.totalLength;
  const pts = route.points;
  const lengths = route.cumulativeLengths;

  if (pts.length === 0 || total <= 0) {
    return {
      x: 0,
      y: 0.1,
      z: 0,
      yaw: 0,
      tangentX: 1,
      tangentZ: 0,
      isCurve: false,
    };
  }

  const wrappedDist = ((distance % total) + total) % total;

  // Tìm đoạn (segment) chứa wrappedDist bằng tìm kiếm nhị phân
  let low = 0;
  let high = pts.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (lengths[mid + 1] < wrappedDist) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const idx = low;
  const nextIdx = (idx + 1) % pts.length;
  const p0 = pts[idx];
  const p1 = pts[nextIdx];

  const segStart = lengths[idx];
  const segLen = Math.max(0.0001, lengths[idx + 1] - segStart);
  const t = Math.max(0, Math.min(1, (wrappedDist - segStart) / segLen));

  // Nội suy vị trí (Position Lerp)
  const x = p0.x + (p1.x - p0.x) * t;
  const y = p0.y + (p1.y - p0.y) * t;
  const z = p0.z + (p1.z - p0.z) * t;

  // Tính vector tiếp tuyến (Tangent vector) và góc quay Yaw theo chiều mũi xe (+X local)
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const norm = Math.hypot(dx, dz) || 1;
  const tangentX = dx / norm;
  const tangentZ = dz / norm;
  const yaw = Math.atan2(-tangentZ, tangentX);

  return {
    x,
    y,
    z,
    yaw,
    tangentX,
    tangentZ,
    isCurve: p0.isCurve || p1.isCurve,
  };
}

export function getWaypointAtDistance(
  route: VehicleSplineRoute,
  distance: number
): VehicleWaypoint {
  const pts = route.points;
  const lengths = route.cumulativeLengths;
  const total = route.totalLength;
  if (pts.length === 0 || total <= 0) {
    return { x: 0, y: 0.1, z: 0, tileX: 0, tileZ: 0, isCurve: false };
  }
  const wrappedDist = ((distance % total) + total) % total;
  let low = 0;
  let high = pts.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (lengths[mid + 1] < wrappedDist) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return pts[low];
}

export function createVehicleNavAgent(
  route: VehicleSplineRoute,
  initialDistance = 0,
  occupancyMap?: NodeOccupancyMap
): VehicleNavAgentState {
  const startWp = getWaypointAtDistance(route, initialDistance);
  const sampled = sampleRouteAtDistance(route, initialDistance);
  const midWp = getWaypointAtDistance(
    route,
    initialDistance + route.totalLength * 0.5
  );

  const currentTile = { x: startWp.tileX, z: startWp.tileZ };
  const destinationTile = { x: midWp.tileX, z: midWp.tileZ };

  if (occupancyMap && !occupancyMap.has(nodeKey(currentTile.x, currentTile.z))) {
    occupancyMap.set(nodeKey(currentTile.x, currentTile.z), route.id);
  }
  activeVehicleHeadingMap.set(route.id, {
    dx: sampled.tangentX,
    dz: sampled.tangentZ,
  });

  return {
    id: route.id,
    kind: route.kind,
    route,
    distance: initialDistance,
    currentYaw: sampled.yaw,
    currentTile,
    targetTile: currentTile,
    destinationTile,
    stuckTimerSeconds: 0,
    repathCount: 0,
    despawnedSafely: false,
    statusReason: 'moving',
  };
}

/**
 * Tự động tính toán lại lộ trình A* (Re-pathfinding) cho phương tiện khi node đích hoặc node phía trước
 * bị kẹt / bị chiếm chỗ / bị xóa đột ngột.
 */
export function recalculateVehiclePath(
  agent: VehicleNavAgentState,
  grid: TileData[][],
  occupancyMap: NodeOccupancyMap,
  extraBlockedNode?: RoadNodeCoord
): boolean {
  const blocked = new Set<string>();
  for (const [k, owner] of occupancyMap.entries()) {
    if (owner !== agent.id) {
      blocked.add(k);
    }
  }
  if (extraBlockedNode) {
    blocked.add(nodeKey(extraBlockedNode.x, extraBlockedNode.z));
  }

  // Tìm tất cả các ô đường hợp lệ và đang rảnh trên bản đồ để chọn điểm đích mới
  const candidateGoals: RoadNodeCoord[] = [];
  if (
    agent.destinationTile &&
    isRoadTile(
      grid[agent.destinationTile.z]?.[agent.destinationTile.x]?.type ?? 'empty_land'
    ) &&
    !blocked.has(nodeKey(agent.destinationTile.x, agent.destinationTile.z)) &&
    (agent.destinationTile.x !== agent.currentTile.x ||
      agent.destinationTile.z !== agent.currentTile.z)
  ) {
    candidateGoals.push(agent.destinationTile);
  }

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      if (!isRoadTile(grid[z][x].type)) continue;
      const k = nodeKey(x, z);
      if (blocked.has(k)) continue;
      if (x === agent.currentTile.x && z === agent.currentTile.z) continue;
      candidateGoals.push({ x, z });
    }
  }

  // Sắp xếp ưu tiên các điểm đích cách xa vị trí hiện tại để tạo tuyến đường có ý nghĩa
  candidateGoals.sort((a, b) => {
    const distA =
      Math.abs(a.x - agent.currentTile.x) + Math.abs(a.z - agent.currentTile.z);
    const distB =
      Math.abs(b.x - agent.currentTile.x) + Math.abs(b.z - agent.currentTile.z);
    return distB - distA;
  });

  const maxCandidates = Math.min(8, candidateGoals.length);
  for (let i = 0; i < maxCandidates; i++) {
    const goal = candidateGoals[i];
    const path = findAStarRoadPath(grid, agent.currentTile, goal, blocked);
    if (path && path.length >= 2) {
      const newRoute = buildSplineRouteFromTilePath(
        agent.id,
        agent.kind,
        grid,
        path
      );
      if (newRoute) {
        agent.route = newRoute;
        agent.distance = 0;
        agent.destinationTile = goal;
        agent.targetTile = path[1];
        agent.stuckTimerSeconds = 0;
        agent.repathCount += 1;
        agent.statusReason = 'repathing';
        return true;
      }
    }
  }

  return false;
}

/**
 * Cập nhật bước di chuyển của phương tiện với:
 * 1. Kiểm tra va chạm node (Node Occupancy Check): Kiểm tra trạng thái bận/rảnh của node trước khi tiến vào
 *    (cho phép 2 xe đi ngược chiều trên 2 làn đối diện lướt qua nhau mượt mà, chỉ chặn khi xe cùng làn hoặc
 *    giao cắt ngã tư hoặc node đích bị khóa).
 * 2. Cơ chế Hủy lộ trình (Path Re-calculation & Fallback 3 giây): Nếu phát hiện node đích/node kế tiếp bị kẹt
 *    hoặc không hợp lệ trong vòng >= 3 giây, tự động tính toán lại đường đi (A* re-pathfinding) hoặc hủy lệnh,
 *    biến mất an toàn (`despawnedSafely = true`) thay vì đứng ì một chỗ lặp đi lặp lại.
 */
export function stepVehicleNavigationAgent(
  agent: VehicleNavAgentState,
  dt: number,
  speedFactor: number,
  grid: TileData[][],
  occupancyMap: NodeOccupancyMap
): SampledVehicleTransform {
  if (agent.despawnedSafely) {
    releaseVehicleNodeOccupancy(occupancyMap, agent.id);
    return sampleRouteAtDistance(agent.route, agent.distance);
  }

  // Kiểm tra ô hiện tại có bị giải tỏa / xóa đột ngột hay không
  const currentTileData = grid[agent.currentTile.z]?.[agent.currentTile.x];
  if (!currentTileData || !isRoadTile(currentTileData.type)) {
    agent.despawnedSafely = true;
    agent.statusReason = 'despawned';
    releaseVehicleNodeOccupancy(occupancyMap, agent.id);
    return sampleRouteAtDistance(agent.route, agent.distance);
  }

  const currentSample = sampleRouteAtDistance(agent.route, agent.distance);
  activeVehicleHeadingMap.set(agent.id, {
    dx: currentSample.tangentX,
    dz: currentSample.tangentZ,
  });

  // Kiểm tra điểm đến (destinationTile):
  // - Nếu ô đích bị phá hủy / không còn là đường -> báo lỗi ngay lập tức.
  // - Nếu ô đích đang bị xe khác chiếm chỗ -> chỉ chặn khi xe đã tiến sát tới gần ô đích (khoảng cách Manhattan <= 1),
  //   tránh việc xe còn cách 10 ô đã tự khóa đứng im vì một xe khác vừa lướt qua ô đích!
  const destTileData = grid[agent.destinationTile.z]?.[agent.destinationTile.x];
  const distToDest =
    Math.abs(agent.currentTile.x - agent.destinationTile.x) +
    Math.abs(agent.currentTile.z - agent.destinationTile.z);
  const isDestRoadDeleted = !destTileData || !isRoadTile(destTileData.type);
  const isDestBlockedNearby =
    distToDest <= 1 &&
    isNodeOccupiedByOther(
      occupancyMap,
      agent.destinationTile.x,
      agent.destinationTile.z,
      agent.id
    );
  const isDestInvalid = isDestRoadDeleted || isDestBlockedNearby;

  const advanceDist = agent.route.speed * speedFactor * dt;
  const checkSpan = Math.max(advanceDist, 0.75);
  const sampleSteps = Math.max(1, Math.ceil(checkSpan / 0.75));

  let nextTile: RoadNodeCoord = agent.currentTile;
  let isNextTileValidRoad = true;
  let isNextNodeOccupied = false;

  for (let s = 1; s <= sampleSteps; s++) {
    const d = agent.distance + (checkSpan * s) / sampleSteps;
    const wp = getWaypointAtDistance(agent.route, d);
    const candidateTile: RoadNodeCoord = { x: wp.tileX, z: wp.tileZ };
    nextTile = candidateTile;

    const tileData = grid[candidateTile.z]?.[candidateTile.x];
    if (!tileData || !isRoadTile(tileData.type)) {
      isNextTileValidRoad = false;
      break;
    }

    const entering =
      candidateTile.x !== agent.currentTile.x ||
      candidateTile.z !== agent.currentTile.z;
    if (
      entering &&
      isNodeOccupiedByOther(
        occupancyMap,
        candidateTile.x,
        candidateTile.z,
        agent.id
      )
    ) {
      const occupantId = occupancyMap.get(
        nodeKey(candidateTile.x, candidateTile.z)
      );
      const occupantHeading = occupantId
        ? activeVehicleHeadingMap.get(occupantId)
        : undefined;
      const isCandidateDestination =
        candidateTile.x === agent.destinationTile.x &&
        candidateTile.z === agent.destinationTile.z;

      // Nếu xe kia đang đi ngược chiều trên làn đối diện (dot < -0.45) và ô đó không phải là điểm dừng cuối cùng,
      // hai xe nằm ở 2 làn bên phải tách biệt (cách nhau 0.96m) nên cho phép đi qua nhau không gây kẹt!
      const dotHeading = occupantHeading
        ? currentSample.tangentX * occupantHeading.dx +
          currentSample.tangentZ * occupantHeading.dz
        : 1;
      const isOppositeLanePassThrough =
        Boolean(occupantHeading) &&
        dotHeading < -0.45 &&
        !isCandidateDestination;

      if (!isOppositeLanePassThrough) {
        isNextNodeOccupied = true;
        break;
      }
    }
  }

  agent.targetTile = nextTile;
  const enteringNewNode =
    nextTile.x !== agent.currentTile.x || nextTile.z !== agent.currentTile.z;

  // Nếu node tiếp theo bị chiếm chỗ, hoặc không còn là đường hợp lệ, hoặc node đích bị xóa/chiếm chỗ
  if (!isNextTileValidRoad || isNextNodeOccupied || isDestInvalid) {
    agent.stuckTimerSeconds += dt;
    agent.statusReason = 'waiting_node';

    // Giữ quyền chiếm chỗ tại ô hiện tại trong lúc chờ
    occupancyMap.set(
      nodeKey(agent.currentTile.x, agent.currentTile.z),
      agent.id
    );

    // Sau 3 giây bị kẹt hoặc node đích không hợp lệ: Bắt buộc Re-pathfinding hoặc Biến mất an toàn!
    if (agent.stuckTimerSeconds >= 3.0) {
      const blockedNodeHint = isDestBlockedNearby
        ? agent.destinationTile
        : nextTile;
      if (agent.repathCount < 2) {
        const repathed = recalculateVehiclePath(
          agent,
          grid,
          occupancyMap,
          blockedNodeHint
        );
        if (repathed) {
          const sampledRepath = sampleRouteAtDistance(
            agent.route,
            agent.distance
          );
          agent.currentYaw = lerpAngle(
            agent.currentYaw,
            sampledRepath.yaw,
            Math.min(1, dt * 10)
          );
          activeVehicleHeadingMap.set(agent.id, {
            dx: sampledRepath.tangentX,
            dz: sampledRepath.tangentZ,
          });
          return {
            ...sampledRepath,
            yaw: agent.currentYaw,
          };
        }
      }

      // Hủy lệnh điều hướng và biến mất an toàn (Safe Despawn) thay vì kẹt trong vòng lặp vô tận
      agent.despawnedSafely = true;
      agent.statusReason = 'despawned';
      releaseVehicleNodeOccupancy(occupancyMap, agent.id);
    }

    return {
      ...currentSample,
      yaw: agent.currentYaw,
    };
  }

  // Node tiếp theo hoàn toàn rảnh và hợp lệ -> Cập nhật Node Occupancy và tiến lên mượt mà
  if (enteringNewNode) {
    releaseVehicleNodeOccupancy(occupancyMap, agent.id);
    occupancyMap.set(nodeKey(nextTile.x, nextTile.z), agent.id);
    agent.currentTile = nextTile;
  } else {
    occupancyMap.set(
      nodeKey(agent.currentTile.x, agent.currentTile.z),
      agent.id
    );
  }

  agent.stuckTimerSeconds = 0;
  agent.statusReason = 'moving';
  agent.distance = (agent.distance + advanceDist) % agent.route.totalLength;

  // Khi xe đã chạm tới destinationTile, tự động chuyển destinationTile sang đầu mút bên kia của hành trình khứ hồi
  // để xe luôn có mục tiêu phía trước hợp lệ trên tuyến tuần hoàn
  if (
    agent.currentTile.x === agent.destinationTile.x &&
    agent.currentTile.z === agent.destinationTile.z
  ) {
    const nextGoalWp = getWaypointAtDistance(
      agent.route,
      agent.distance + agent.route.totalLength * 0.5
    );
    if (
      nextGoalWp.tileX !== agent.currentTile.x ||
      nextGoalWp.tileZ !== agent.currentTile.z
    ) {
      agent.destinationTile = { x: nextGoalWp.tileX, z: nextGoalWp.tileZ };
    }
  }

  const sampled = sampleRouteAtDistance(agent.route, agent.distance);
  const yawBlend = Math.min(1, dt * (sampled.isCurve ? 14 : 10));
  agent.currentYaw = lerpAngle(agent.currentYaw, sampled.yaw, yawBlend);
  activeVehicleHeadingMap.set(agent.id, {
    dx: sampled.tangentX,
    dz: sampled.tangentZ,
  });

  return {
    ...sampled,
    yaw: agent.currentYaw,
  };
}
