import { TILE_WORLD_SIZE } from './models3d';
import { soundEngine } from './audio';
import {
  createVehicleNavAgent,
  generateVehicleRoutesFromGrid,
  NodeOccupancyMap,
  sampleRouteAtDistance,
  stepVehicleNavigationAgent,
  VehicleNavAgentState,
} from './roadVehiclePaths';
import {
  BUILDING_SPECS,
  canPlaceToolAtTile,
  detectRoadProximitySnap,
  getRoadConnections,
  GRID_SIZE,
  isBuiltStructure,
  isRoadTile,
} from './rules';
import { CityGameState, TileData, TileType, ToolId } from './types';

interface FallbackMountParams {
  container: HTMLElement;
  getState: () => CityGameState;
  onTileClick: (x: number, z: number) => void;
  onTileRightClick: (
    x: number,
    z: number,
    clientX: number,
    clientY: number
  ) => void;
  onTileHover: (
    info: { x: number; z: number; clientX: number; clientY: number } | null
  ) => void;
  setSceneRebuild: (fn: (grid: TileData[][], season: string) => void) => void;
  setTriggerJuice: (
    fn: (worldX: number, worldZ: number, colorHex: number) => void
  ) => void;
  setResetCamera: (fn: () => void) => void;
  setSyncToolGhost?: (fn: (tool: ToolId) => void) => void;
  getHeatmapMode?: () => 'none' | 'land_value';
}

const TILE_COLORS: Record<TileType, { base: string; roof: string; height: number }> = {
  empty_land: { base: '#2b543c', roof: '#336146', height: 0 },
  lowland_marsh: { base: '#244736', roof: '#2c5440', height: 0 },
  river_water: { base: '#1e5b88', roof: '#2770a6', height: 0 },
  road_alley: { base: '#6b655c', roof: '#7c756b', height: 2 },
  road_urban: { base: '#333b44', roof: '#424c58', height: 2 },
  road_ring: { base: '#1e293b', roof: '#16a34a', height: 3 },
  road_highway: { base: '#283038', roof: '#37424d', height: 5 },
  res_low: { base: '#d9c39e', roof: '#c85a32', height: 18 },
  res_mid: { base: '#cbd5e1', roof: '#3b82f6', height: 32 },
  res_high: { base: '#94a3b8', roof: '#0ea5e9', height: 54 },
  com_street: { base: '#fde68a', roof: '#d97706', height: 22 },
  com_market: { base: '#fca5a5', roof: '#dc2626', height: 20 },
  com_mall: { base: '#7dd3fc', roof: '#0284c7', height: 42 },
  com_office: { base: '#38bdf8', roof: '#0284c7', height: 64 },
  agr_farm: { base: '#65a30d', roof: '#84cc16', height: 6 },
  ind_factory: { base: '#9ca3af', roof: '#4b5563', height: 26 },
  ind_food: { base: '#bbf7d0', roof: '#16a34a', height: 28 },
  ind_fdi: { base: '#a5f3fc', roof: '#0891b2', height: 38 },
  pub_admin: { base: '#fde047', roof: '#b91c1c', height: 28 },
  pub_edu_med: { base: '#f8fafc', roof: '#ef4444', height: 34 },
  pub_hospital: { base: '#f8fafc', roof: '#ef4444', height: 34 },
  priv_hospital: { base: '#a5f3fc', roof: '#10b981', height: 40 },
  pub_school: { base: '#fef08a', roof: '#dc2626', height: 28 },
  priv_school: { base: '#bae6fd', roof: '#f59e0b', height: 36 },
  pub_security: { base: '#bfdbfe', roof: '#1d4ed8', height: 24 },
  util_power_water: { base: '#bae6fd', roof: '#0369a1', height: 26 },
  showbiz_stadium: { base: '#e9d5ff', roof: '#9333ea', height: 44 },
  gateway_port: { base: '#475569', roof: '#0ea5e9', height: 24 },
  gateway_station: { base: '#64748b', roof: '#f59e0b', height: 24 },
};

export function mountIsometricCanvasFallback({
  container,
  getState,
  onTileClick,
  onTileRightClick,
  onTileHover,
  setSceneRebuild,
  setTriggerJuice,
  setResetCamera,
  setSyncToolGhost,
  getHeatmapMode,
}: FallbackMountParams): () => void {
  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'city-3d-canvas';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = container.clientWidth || window.innerWidth;
  let height = container.clientHeight || window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const getDefaultZoom = (w: number) =>
    w < 640 ? Math.max(0.58, Math.min(0.95, w / 560)) : 1.0;

  let camOffsetX = 0;
  let camOffsetY = 36;
  let zoom = getDefaultZoom(width);
  let hoveredTile: { x: number; z: number } | null = null;
  let pulseEffects: { x: number; z: number; color: string; life: number }[] = [];
  const halfBoard = (GRID_SIZE * TILE_WORLD_SIZE) / 2;
  const nodeOccupancyMap: NodeOccupancyMap = new Map();
  let navAgents: VehicleNavAgentState[] = [];
  let lastRoadSig = '';

  const computeRoadSig = (grid: TileData[][]) => {
    const st = getState();
    const parts: string[] = [
      `tr:${st.policies.transitLevel ?? 0}|bt:${
        st.policies.banTrucksInResidential ? 1 : 0
      }`,
    ];
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = grid[z]?.[x];
        if (
          t &&
          (isRoadTile(t.type) ||
            t.type === 'gateway_port' ||
            t.type === 'gateway_station')
        ) {
          parts.push(`${x},${z}:${t.type}`);
        }
      }
    }
    return parts.join(';');
  };

  const rebuildNavAgents = (grid: TileData[][]) => {
    const sig = computeRoadSig(grid);
    if (sig === lastRoadSig) return;
    lastRoadSig = sig;
    nodeOccupancyMap.clear();
    navAgents = [];
    const st = getState();
    const generatedRoutes = generateVehicleRoutesFromGrid(grid, {
      banTrucksInResidential: st.policies.banTrucksInResidential,
      transitLevel: st.policies.transitLevel,
    });
    for (const route of generatedRoutes) {
      const count = route.totalLength >= 28 ? 2 : 1;
      for (let vIdx = 0; vIdx < count; vIdx++) {
        let initialDist = vIdx === 0 ? 0 : route.totalLength * 0.36;
        const agentRoute = {
          ...route,
          id: `${route.id}_veh_${vIdx}`,
        };
        for (let attempt = 0; attempt < 4; attempt++) {
          const s = sampleRouteAtDistance(agentRoute, initialDist);
          const tx = Math.floor((s.x + halfBoard) / TILE_WORLD_SIZE);
          const tz = Math.floor((s.z + halfBoard) / TILE_WORLD_SIZE);
          if (!nodeOccupancyMap.has(`${tx},${tz}`)) break;
          initialDist = (initialDist + TILE_WORLD_SIZE * 1.15) % route.totalLength;
        }
        navAgents.push(
          createVehicleNavAgent(agentRoute, initialDist, nodeOccupancyMap)
        );
      }
    }
    container.dataset.activeVehicleCount = String(navAgents.length);
  };

  rebuildNavAgents(getState().grid);

  const projectIso = (wx: number, wy: number, wz: number) => {
    const isoX = (wx - wz) * 14 * zoom + width / 2 + camOffsetX;
    const isoY =
      (wx + wz) * 7.2 * zoom - wy * zoom + height * 0.46 + camOffsetY;
    return { x: isoX, y: isoY };
  };

  const getTileCenterWorld = (tx: number, tz: number) => ({
    wx: tx * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2,
    wz: tz * TILE_WORLD_SIZE - halfBoard + TILE_WORLD_SIZE / 2,
  });

  const getTileAtClientCoords = (
    clientX: number,
    clientY: number
  ): { x: number; z: number } | null => {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    let bestTile: { x: number; z: number } | null = null;
    let bestDist = Math.max(22, 28 * zoom);

    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const { wx, wz } = getTileCenterWorld(x, z);
        const pt = projectIso(wx, 0, wz);
        const dist = Math.hypot(px - pt.x, py - pt.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestTile = { x, z };
        }
      }
    }
    return bestTile;
  };

  setSceneRebuild((grid) => {
    rebuildNavAgents(grid);
  });

  setTriggerJuice((worldX, worldZ, colorHex) => {
    const tx = Math.floor((worldX + halfBoard) / TILE_WORLD_SIZE);
    const tz = Math.floor((worldZ + halfBoard) / TILE_WORLD_SIZE);
    pulseEffects.push({
      x: tx,
      z: tz,
      color: `#${colorHex.toString(16).padStart(6, '0')}`,
      life: 1.0,
    });
  });

  setResetCamera(() => {
    camOffsetX = 0;
    camOffsetY = 36;
    zoom = getDefaultZoom(width);
  });

  let ghostPreview: {
    visible: boolean;
    tool: ToolId | null;
    x: number;
    z: number;
    isValid: boolean;
    isColliding: boolean;
  } | null = null;

  const syncGhostDataset = () => {
    const isVis = Boolean(ghostPreview?.visible);
    container.dataset.ghostVisible = isVis ? 'true' : 'false';
    container.dataset.ghostTool = isVis && ghostPreview?.tool ? ghostPreview.tool : 'none';
    container.dataset.ghostValid = isVis && ghostPreview?.isValid ? 'true' : 'false';
    container.dataset.ghostColliding =
      isVis && ghostPreview?.isColliding ? 'true' : 'false';
    container.dataset.ghostColor = !isVis
      ? 'none'
      : ghostPreview?.isColliding
      ? 'vibrant-red'
      : ghostPreview?.isValid
      ? 'green'
      : 'red';
    container.dataset.ghostOpacity = isVis
      ? ghostPreview?.isColliding
        ? '0.68'
        : '0.5'
      : '0';
  };

  const disposeGhostPreview = () => {
    if (ghostPreview) {
      ghostPreview.visible = false;
      ghostPreview = null;
    }
    syncGhostDataset();
  };

  if (setSyncToolGhost) {
    setSyncToolGhost((tool: ToolId) => {
      const state = getState();
      if (
        state.mode !== 'playing' ||
        tool === 'inspect' ||
        tool === 'act_clearance' ||
        tool === 'sub_drainage'
      ) {
        disposeGhostPreview();
        return;
      }
      if (hoveredTile) {
        const check = canPlaceToolAtTile(
          state,
          hoveredTile.x,
          hoveredTile.z,
          tool
        );
        if (check.isGhostBuilding) {
          ghostPreview = {
            visible: true,
            tool,
            x: hoveredTile.x,
            z: hoveredTile.z,
            isValid: check.allowed && !check.isColliding,
            isColliding: check.isColliding,
          };
          syncGhostDataset();
        } else {
          disposeGhostPreview();
        }
      }
    });
  }

  syncGhostDataset();

  const keysPressed = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    if (
      document.activeElement &&
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)
    ) {
      return;
    }
    if (
      e.code === 'Escape' ||
      e.key === 'Shift' ||
      e.code === 'ShiftLeft' ||
      e.code === 'ShiftRight'
    ) {
      disposeGhostPreview();
    }
    keysPressed.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keysPressed.delete(e.code);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let pointerDownPos = { x: 0, y: 0, button: 0, camX: 0, camY: 0 };
  let isDragging = false;
  let lastRightClickAt = 0;
  let touchLongPressTimer: number | null = null;
  let touchLongPressTriggered = false;

  const clearTouchLongPress = () => {
    if (touchLongPressTimer !== null) {
      window.clearTimeout(touchLongPressTimer);
      touchLongPressTimer = null;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerDownPos = {
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      camX: camOffsetX,
      camY: camOffsetY,
    };
    isDragging = true;
    touchLongPressTriggered = false;
    clearTouchLongPress();

    if (e.pointerType === 'touch' && getState().mode === 'playing') {
      const downX = e.clientX;
      const downY = e.clientY;
      touchLongPressTimer = window.setTimeout(() => {
        touchLongPressTimer = null;
        const hit = getTileAtClientCoords(downX, downY);
        if (hit) {
          touchLongPressTriggered = true;
          disposeGhostPreview();
          onTileRightClick(hit.x, hit.z, downX, downY);
        }
      }, 420);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const state = getState();
    if (state.mode !== 'playing') return;

    if (touchLongPressTimer !== null) {
      const moveDist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (moveDist > 8) {
        clearTouchLongPress();
      }
    }

    if (isDragging && e.buttons !== 0) {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 8) {
        camOffsetX = pointerDownPos.camX + dx;
        camOffsetY = pointerDownPos.camY + dy;
        hoveredTile = null;
        disposeGhostPreview();
        onTileHover(null);
        return;
      }
    }

    const hit = getTileAtClientCoords(e.clientX, e.clientY);
    hoveredTile = hit;
    if (hit) {
      const isFreePan = state.selectedTool === 'inspect';
      const tile = state.grid[hit.z]?.[hit.x];
      const hasBuilding = Boolean(tile && isBuiltStructure(tile.type));

      const check = canPlaceToolAtTile(state, hit.x, hit.z, state.selectedTool);
      if (check.isGhostBuilding) {
        ghostPreview = {
          visible: true,
          tool: state.selectedTool,
          x: hit.x,
          z: hit.z,
          isValid: check.allowed && !check.isColliding,
          isColliding: check.isColliding,
        };
        syncGhostDataset();
      } else {
        disposeGhostPreview();
      }

      if (isFreePan && !hasBuilding) {
        onTileHover(null);
      } else {
        onTileHover({
          x: hit.x,
          z: hit.z,
          clientX: e.clientX,
          clientY: e.clientY,
        });
      }
    } else {
      disposeGhostPreview();
      onTileHover(null);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    isDragging = false;
    clearTouchLongPress();
    if (touchLongPressTriggered) {
      touchLongPressTriggered = false;
      return;
    }
    const state = getState();
    if (state.mode !== 'playing') return;
    const dist = Math.hypot(
      e.clientX - pointerDownPos.x,
      e.clientY - pointerDownPos.y
    );
    if (dist > 10) return;
    const hit = getTileAtClientCoords(e.clientX, e.clientY);
    if (!hit) return;

    if (e.button === 2 || pointerDownPos.button === 2) {
      lastRightClickAt = performance.now();
      disposeGhostPreview();
      onTileRightClick(hit.x, hit.z, e.clientX, e.clientY);
    } else if (e.button === 0 || e.pointerType === 'touch') {
      disposeGhostPreview();
      onTileClick(hit.x, hit.z);
    }
  };

  const onPointerCancel = () => {
    isDragging = false;
    clearTouchLongPress();
    touchLongPressTriggered = false;
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const state = getState();
    if (state.mode !== 'playing') return;
    const now = performance.now();
    if (now - lastRightClickAt < 80) return;
    const hit = getTileAtClientCoords(e.clientX, e.clientY);
    if (hit) {
      lastRightClickAt = now;
      disposeGhostPreview();
      onTileRightClick(hit.x, hit.z, e.clientX, e.clientY);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom = Math.max(0.5, Math.min(1.8, zoom - e.deltaY * 0.0008));
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) {
        const prevNarrow = width < 640;
        const nextNarrow = w < 640;
        width = w;
        height = h;
        canvas.width = w;
        canvas.height = h;
        if (prevNarrow !== nextNarrow) {
          zoom = getDefaultZoom(w);
        }
      }
    }
  });
  resizeObserver.observe(container);

  let animId = 0;
  let lastTime = performance.now();

  const drawTilePrism = (
    tx: number,
    tz: number,
    baseColor: string,
    roofColor: string,
    prismHeight: number,
    strokeColor = 'rgba(15, 23, 42, 0.45)'
  ) => {
    if (!ctx) return;
    const half = TILE_WORLD_SIZE * 0.48;
    const { wx, wz } = getTileCenterWorld(tx, tz);
    const p0 = projectIso(wx - half, 0, wz - half);
    const p1 = projectIso(wx + half, 0, wz - half);
    const p2 = projectIso(wx + half, 0, wz + half);
    const p3 = projectIso(wx - half, 0, wz + half);

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (prismHeight > 0) {
      const bHalf = TILE_WORLD_SIZE * 0.34;
      const t0 = projectIso(wx - bHalf, prismHeight, wz - bHalf);
      const t1 = projectIso(wx + bHalf, prismHeight, wz - bHalf);
      const t2 = projectIso(wx + bHalf, prismHeight, wz + bHalf);
      const t3 = projectIso(wx - bHalf, prismHeight, wz + bHalf);

      const b1 = projectIso(wx + bHalf, 0, wz - bHalf);
      const b2 = projectIso(wx + bHalf, 0, wz + bHalf);
      const b3 = projectIso(wx - bHalf, 0, wz + bHalf);

      // Left face
      ctx.beginPath();
      ctx.moveTo(b3.x, b3.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.stroke();

      // Right face
      ctx.beginPath();
      ctx.moveTo(b2.x, b2.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.closePath();
      ctx.fillStyle = roofColor;
      ctx.fill();
      ctx.stroke();

      // Roof face
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fillStyle = roofColor;
      ctx.fill();
      ctx.stroke();
    }
  };

  const renderFrame = (now: number) => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const state = getState();
    if (state.mode === 'playing') {
      const panSpeed = 240 * dt;
      if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp'))
        camOffsetY += panSpeed;
      if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown'))
        camOffsetY -= panSpeed;
      if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft'))
        camOffsetX += panSpeed;
      if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight'))
        camOffsetX -= panSpeed;

      const focusX = hoveredTile
        ? hoveredTile.x
        : Math.max(0, Math.min(GRID_SIZE - 1, Math.round(9 - camOffsetX / 45)));
      const focusZ = hoveredTile
        ? hoveredTile.z
        : Math.max(0, Math.min(GRID_SIZE - 1, Math.round(9 - camOffsetY / 35)));
      const profile = soundEngine.updateAmbienceFromCamera(
        state.grid,
        focusX,
        focusZ,
        state.metrics.population,
        42 / Math.max(0.5, zoom)
      );
      container.dataset.ambienceZone = profile.dominantZone;
      container.dataset.ambienceLabel = profile.zoneLabel;
    }

    if (ctx) {
      ctx.fillStyle = '#132232';
      ctx.fillRect(0, 0, width, height);

      for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const tile = state.grid[z]?.[x];
          if (!tile) continue;
          const style = TILE_COLORS[tile.type] ?? TILE_COLORS.empty_land;
          const activeHeatmap = getHeatmapMode ? getHeatmapMode() : 'none';
          const isRoad = isRoadTile(tile.type);
          let groundBase =
            isBuiltStructure(tile.type) && !isRoad ? '#335c45' : style.base;
          if (activeHeatmap === 'land_value' && tile.type !== 'river_water') {
            const lv = tile.landValue;
            groundBase =
              lv > 15
                ? '#ea580c'
                : lv >= 5
                ? '#f59e0b'
                : lv >= 1
                ? '#10b981'
                : '#64748b';
          }
          const naturalSeedHeight =
            tile.type === 'empty_land' && (x * 31 + z * 17) % 11 <= 5
              ? 6
              : tile.type === 'lowland_marsh' && (x * 19 + z * 23) % 7 <= 3
              ? 3
              : 0;
          const tileStroke =
            tile.isReservedPublicLand && tile.type !== 'river_water'
              ? '#06b6d4'
              : 'rgba(15, 23, 42, 0.45)';

          drawTilePrism(
            x,
            z,
            groundBase,
            style.roof,
            isRoad
              ? 0
              : Math.max(
                  naturalSeedHeight,
                  style.height * (tile.constructionRemainingDays > 0 ? 0.45 : 1)
                ),
            tileStroke
          );

          // Vẽ vạch kẻ làn đường kết nối cho ô đường bộ
          if (isRoad) {
            const conn = getRoadConnections(state.grid, x, z);
            const { wx, wz } = getTileCenterWorld(x, z);
            const cPt = projectIso(wx, 0.2, wz);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.6 * zoom;
            const halfStep = TILE_WORLD_SIZE * 0.45;
            const drawArm = (dx: number, dz: number) => {
              const ePt = projectIso(
                wx + dx * halfStep,
                0.2,
                wz + dz * halfStep
              );
              ctx.beginPath();
              ctx.moveTo(cPt.x, cPt.y);
              ctx.lineTo(ePt.x, ePt.y);
              ctx.stroke();
            };
            if (conn.north) drawArm(0, -1);
            if (conn.south) drawArm(0, 1);
            if (conn.west) drawArm(-1, 0);
            if (conn.east) drawArm(1, 0);
          }
        }
      }

      // Vẽ phương tiện di chuyển theo điều hướng A* và đường cong Bézier / Spline
      const speedFactor =
        (state.metrics.trafficSpeedIndex / 100) * 0.85 + 0.2;
      for (let i = navAgents.length - 1; i >= 0; i--) {
        const agent = navAgents[i];
        const sample = stepVehicleNavigationAgent(
          agent,
          dt,
          speedFactor,
          state.grid,
          nodeOccupancyMap
        );
        if (agent.despawnedSafely) {
          navAgents.splice(i, 1);
          container.dataset.activeVehicleCount = String(navAgents.length);
          continue;
        }
        const vPt = projectIso(sample.x, sample.y + 0.6, sample.z);
        ctx.fillStyle =
          agent.kind === 'truck'
            ? '#f97316'
            : agent.kind === 'bus'
            ? '#38bdf8'
            : '#facc15';
        ctx.beginPath();
        ctx.arc(vPt.x, vPt.y, Math.max(2.5, 3.8 * zoom), 0, Math.PI * 2);
        ctx.fill();
      }

      // Đồng bộ hủy Ghost nếu người chơi đã hủy chọn công cụ xây dựng
      if (
        ghostPreview &&
        (state.selectedTool === 'inspect' ||
          state.selectedTool === 'act_clearance' ||
          state.selectedTool === 'sub_drainage' ||
          state.mode !== 'playing')
      ) {
        disposeGhostPreview();
      } else if (
        ghostPreview &&
        ghostPreview.visible &&
        state.selectedTool !== ghostPreview.tool
      ) {
        const recheck = canPlaceToolAtTile(
          state,
          ghostPreview.x,
          ghostPreview.z,
          state.selectedTool
        );
        if (recheck.isGhostBuilding) {
          ghostPreview.tool = state.selectedTool;
          ghostPreview.isValid = recheck.allowed && !recheck.isColliding;
          ghostPreview.isColliding = recheck.isColliding;
          syncGhostDataset();
        } else {
          disposeGhostPreview();
        }
      }

      // Vẽ khung chọn và khung hover
      const activeHover =
        hoveredTile &&
        (state.selectedTool !== 'inspect' ||
          isBuiltStructure(state.grid[hoveredTile.z]?.[hoveredTile.x]?.type))
          ? hoveredTile
          : null;

      if (activeHover) {
        drawTilePrism(
          activeHover.x,
          activeHover.z,
          'rgba(250, 204, 21, 0.22)',
          'rgba(250, 204, 21, 0.35)',
          0,
          '#facc15'
        );

        // Vẽ Mô hình 3D Ghost Preview mờ (transparent = true, opacity = 0.5 / 0.68 khi va chạm)
        // Màu xanh (đủ điều kiện xây), đỏ rực rỡ (va chạm công trình khác), hoặc đỏ (thiếu điều kiện)
        if (ghostPreview && ghostPreview.visible && ghostPreview.tool) {
          const ghostType = ghostPreview.tool as TileType;
          const ghostStyle = TILE_COLORS[ghostType];
          const hasSpec = Boolean(BUILDING_SPECS[ghostType]);
          if (ghostStyle && hasSpec) {
            const ghostHeight = Math.max(8, ghostStyle.height);
            const baseTint = ghostPreview.isColliding
              ? 'rgba(255, 23, 68, 0.72)'
              : ghostPreview.isValid
              ? 'rgba(34, 197, 94, 0.5)'
              : 'rgba(239, 68, 68, 0.5)';
            const roofTint = ghostPreview.isColliding
              ? 'rgba(255, 51, 102, 0.78)'
              : ghostPreview.isValid
              ? 'rgba(74, 222, 128, 0.5)'
              : 'rgba(248, 113, 113, 0.5)';
            const strokeTint = ghostPreview.isColliding
              ? '#ff1744'
              : ghostPreview.isValid
              ? '#22c55e'
              : '#ef4444';
            drawTilePrism(
              ghostPreview.x,
              ghostPreview.z,
              baseTint,
              roofTint,
              ghostHeight,
              strokeTint
            );
          }
        }

        const targetTile = state.grid[activeHover.z]?.[activeHover.x];
        if (
          targetTile &&
          !isBuiltStructure(targetTile.type) &&
          isRoadTile(state.selectedTool as TileType)
        ) {
          const snap = detectRoadProximitySnap(
            state.grid,
            activeHover.x,
            activeHover.z
          );
          for (const g of snap.snappedGapTiles) {
            drawTilePrism(
              g.x,
              g.z,
              'rgba(56, 189, 248, 0.25)',
              'rgba(56, 189, 248, 0.35)',
              0,
              '#38bdf8'
            );
          }
        }
      }

      if (state.selectedTile) {
        drawTilePrism(
          state.selectedTile.x,
          state.selectedTile.z,
          'rgba(56, 189, 248, 0.18)',
          'rgba(56, 189, 248, 0.28)',
          0,
          '#38bdf8'
        );
      }

      pulseEffects = pulseEffects.filter((p) => {
        p.life -= dt * 1.8;
        if (p.life <= 0) return false;
        const { wx, wz } = getTileCenterWorld(p.x, p.z);
        const pt = projectIso(wx, 2, wz);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, (1 - p.life) * 28 * zoom, 0, Math.PI * 2);
        ctx.stroke();
        return true;
      });
    }

    animId = requestAnimationFrame(renderFrame);
  };

  animId = requestAnimationFrame(renderFrame);

  return () => {
    cancelAnimationFrame(animId);
    clearTouchLongPress();
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
    if (canvas.parentNode === container) {
      container.removeChild(canvas);
    }
  };
}
