import {
  BASE_EMPTY_LAND_PRICE,
  BASE_MARSH_LAND_PRICE,
  BUILDING_SPECS,
  canRoadsConnect,
  classifyRoadJunction,
  computeCityLevel,
  evaluateOnboardingProgress,
  formatVnd,
  generateDefaultBuildingIdentity,
  getBuildingFinancialPreview,
  getDifficultySpec,
  getToolUnlockRequirementLabel,
  GRID_SIZE,
  hasNeighborOfType,
  isBuiltStructure,
  isMainArterialRoad,
  isPublicServiceModule,
  isRoadTile,
  isToolUnlockedAtLevel,
  TILE_LABELS,
} from './constants';
import { calculateMacroEconomy, GlobalLedger } from './economy';
import {
  BankLoan,
  CityGameState,
  CompensationLevel,
  DifficultyLevel,
  LaborTierCounts,
  LedgerEntry,
  MacroMetrics,
  PlacementRiskEvaluation,
  RoadConnections,
  TileData,
  TileType,
  ToolId,
} from './types';

export function getRoadConnections(
  grid: TileData[][],
  x: number,
  z: number,
  selfRoadType?: TileType
): RoadConnections {
  const currentTileType =
    selfRoadType ??
    (z >= 0 &&
    z < grid.length &&
    x >= 0 &&
    x < grid[0].length &&
    isRoadTile(grid[z][x].type)
      ? grid[z][x].type
      : 'road_urban');

  const check = (nx: number, nz: number): boolean => {
    if (nz < 0 || nz >= grid.length || nx < 0 || nx >= grid[0].length) {
      return false;
    }
    return canRoadsConnect(currentTileType, grid[nz][nx].type);
  };
  const north = check(x, z - 1);
  const south = check(x, z + 1);
  const west = check(x - 1, z);
  const east = check(x + 1, z);
  return {
    north,
    south,
    west,
    east,
    junctionType: classifyRoadJunction(north, south, west, east),
  };
}

export function detectRoadProximitySnap(
  grid: TileData[][],
  x: number,
  z: number,
  targetRoadType: TileType = 'road_urban'
): {
  previewConnections: RoadConnections;
  snappedGapTiles: { x: number; z: number }[];
  junctionLabel: string;
} {
  const snappedGapTiles: { x: number; z: number }[] = [];
  const dirs = [
    { dx: 0, dz: -1, key: 'north' as const },
    { dx: 0, dz: 1, key: 'south' as const },
    { dx: -1, dz: 0, key: 'west' as const },
    { dx: 1, dz: 0, key: 'east' as const },
  ];

  const conn = {
    north: false,
    south: false,
    west: false,
    east: false,
  };

  for (const d of dirs) {
    const nx1 = x + d.dx;
    const nz1 = z + d.dz;
    if (nz1 < 0 || nz1 >= grid.length || nx1 < 0 || nx1 >= grid[0].length) {
      continue;
    }
    if (canRoadsConnect(targetRoadType, grid[nz1][nx1].type)) {
      conn[d.key] = true;
    } else {
      const nx2 = x + d.dx * 2;
      const nz2 = z + d.dz * 2;
      const midTile = grid[nz1][nx1];
      const canAutoSnapMid =
        (midTile.type === 'empty_land' || midTile.type === 'lowland_marsh') &&
        midTile.disputeTurns === 0;
      if (
        canAutoSnapMid &&
        nz2 >= 0 &&
        nz2 < grid.length &&
        nx2 >= 0 &&
        nx2 < grid[0].length &&
        isRoadTile(grid[nz2][nx2].type) &&
        canRoadsConnect(targetRoadType, grid[nz2][nx2].type)
      ) {
        conn[d.key] = true;
        snappedGapTiles.push({ x: nx1, z: nz1 });
      }
    }
  }

  const junctionType = classifyRoadJunction(
    conn.north,
    conn.south,
    conn.west,
    conn.east
  );

  const junctionLabel =
    junctionType === 'crossroad'
      ? 'Ngã Tư (Cross-Intersection)'
      : junctionType === 't_junction'
      ? 'Ngã Ba Chữ T (T-Junction)'
      : junctionType === 'corner'
      ? 'Khúc Cua Vuông Góc (L-Corner)'
      : junctionType === 'straight_we'
      ? 'Tuyến Đường Ngang (Tây - Đông)'
      : junctionType === 'straight_ns'
      ? 'Tuyến Đường Dọc (Bắc - Nam)'
      : 'Điểm Đường Đơn';

  return {
    previewConnections: { ...conn, junctionType },
    snappedGapTiles,
    junctionLabel,
  };
}

export function refreshAllRoadJunctions(grid: TileData[][]): void {
  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (isRoadTile(tile.type)) {
        const c = getRoadConnections(grid, x, z, tile.type);
        tile.junctionType = c.junctionType;
      } else {
        tile.junctionType = undefined;
      }
    }
  }
}

/**
 * Khuếch tán Giá Đất Đô Thị (`recalculateGridLandValues`):
 * Cập nhật `tile.landValue` dựa trên bán kính 3 ô xung quanh:
 * - Tăng mạnh gần `road_urban`, `road_ring`, `pub_school`, `pub_hospital`, `com_mall`, `com_office`
 * - Giảm mạnh khi gần `ind_factory` (ô nhiễm công nghiệp nặng)
 */
export function recalculateGridLandValues(grid: TileData[][]): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const getNeighborLandImpact = (neighborType: TileType): number => {
    switch (neighborType) {
      case 'road_urban':
        return 1.35;
      case 'road_ring':
        return 2.4;
      case 'road_highway':
        return 1.8;
      case 'pub_school':
        return 3.2;
      case 'pub_hospital':
        return 3.5;
      case 'priv_school':
        return 2.6;
      case 'priv_hospital':
        return 2.8;
      case 'pub_admin':
        return 2.5;
      case 'com_mall':
        return 4.6;
      case 'com_office':
        return 5.4;
      case 'res_high':
        return 1.8;
      case 'showbiz_stadium':
        return 3.4;
      case 'ind_factory':
        return -3.8;
      default:
        return 0;
    }
  };

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const tile = grid[z][x];
      if (tile.type === 'river_water') {
        tile.landValue = 0;
        continue;
      }

      const basePrice =
        tile.elevation === 0 ? BASE_MARSH_LAND_PRICE : BASE_EMPTY_LAND_PRICE;
      const spec = BUILDING_SPECS[tile.type];
      const selfBuildingValue =
        isBuiltStructure(tile.type) && spec
          ? Math.max(0.02, spec.costBillion * 0.65)
          : 0;
      const drainageValue = tile.hasDrainage ? 0.02 : 0;

      let diffusionDelta = 0;
      const zMin = Math.max(0, z - 3);
      const zMax = Math.min(rows - 1, z + 3);
      const xMin = Math.max(0, x - 3);
      const xMax = Math.min(cols - 1, x + 3);

      for (let rz = zMin; rz <= zMax; rz++) {
        for (let rx = xMin; rx <= xMax; rx++) {
          if (rx === x && rz === z) continue;
          const dist = Math.max(Math.abs(rx - x), Math.abs(rz - z));
          if (dist > 3) continue;
          const neighbor = grid[rz][rx];
          const rawImpact = getNeighborLandImpact(neighbor.type);
          if (rawImpact === 0) continue;
          const falloff = (4 - dist) / 3; // dist 1 => 1.0, dist 2 => 0.667, dist 3 => 0.333
          diffusionDelta += rawImpact * falloff;
        }
      }

      const computed = Math.max(
        0.0005,
        Math.min(180, basePrice + selfBuildingValue + drainageValue + diffusionDelta)
      );
      tile.landValue = Number(computed.toFixed(3));
    }
  }
}

export function createInitialGrid(seedOffset = 0): TileData[][] {
  const grid: TileData[][] = [];

  for (let z = 0; z < GRID_SIZE; z++) {
    const row: TileData[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const riverCenter =
        13 +
        ((seedOffset % 3) - 1) +
        Math.round(Math.sin((z + seedOffset) * 0.38));
      const isRiver = x === riverCenter || x === riverCenter + 1;
      const isNearRiver = Math.abs(x - riverCenter) <= 2 && !isRiver;

      const type: TileType = isRiver
        ? 'river_water'
        : isNearRiver
        ? 'lowland_marsh'
        : 'empty_land';

      const elevation = isRiver ? -1 : isNearRiver ? 0 : x < 5 ? 2 : 1;
      const landValue = isRiver
        ? 0
        : isNearRiver
        ? BASE_MARSH_LAND_PRICE
        : BASE_EMPTY_LAND_PRICE;

      row.push({
        x,
        z,
        type,
        elevation,
        landValue,
        hasDrainage: false,
        drainageRemainingDays: 0,
        isFlooded: false,
        sidewalkVendors: false,
        disputeTurns: 0,
        supplyRatio: 1.0,
        level: 1,
        constructionTotalDays: 0,
        constructionRemainingDays: 0,
        maxCapacity: 0,
        currentOccupants: 0,
        occupantsByTier: { unskilled: 0, skilled: 0, educated: 0 },
        minimumWealthLevel: 'low',
        requiredWorkers: { unskilled: 0, skilled: 0, educated: 0 },
        assignedWorkers: { unskilled: 0, skilled: 0, educated: 0 },
        lowEfficiencyMonths: 0,
        localSupplyIndex: 100,
      });
    }
    grid.push(row);
  }

  return grid;
}

/**
 * Kiểm tra điều kiện tiên quyết (Prerequisites) trước khi cho phép khởi công xây dựng bất kỳ công trình nào
 */
export function validateBuildPrerequisites(
  grid: TileData[][],
  x: number,
  z: number,
  targetType: TileType,
  metrics: MacroMetrics
): { allowed: boolean; reason?: string } {
  if (
    isRoadTile(targetType) ||
    targetType === 'agr_farm' ||
    targetType === 'util_power_water'
  ) {
    return { allowed: true };
  }

  const nearAnyRoad = hasNeighborOfType(grid, x, z, [
    'road_alley',
    'road_urban',
    'road_ring',
    'road_highway',
  ]);
  const nearMainRoad = hasNeighborOfType(grid, x, z, [
    'road_urban',
    'road_ring',
    'road_highway',
  ]);

  if (!nearAnyRoad) {
    return {
      allowed: false,
      reason: `Điều kiện quy hoạch: Không thể xây ${TILE_LABELS[targetType]} giữa đất trống chưa có đường! Hãy xây Đường Hẻm [1], Đường Nhựa [2], Vành Đai [K] hoặc Cao Tốc [3] dẫn tới ô (${x + 1}, ${z + 1}) trước.`,
    };
  }

  const requiresMainRoad =
    targetType === 'res_high' ||
    targetType === 'com_mall' ||
    targetType === 'com_office' ||
    targetType === 'ind_fdi' ||
    targetType === 'pub_edu_med' ||
    targetType === 'pub_hospital' ||
    targetType === 'priv_hospital' ||
    targetType === 'priv_school' ||
    targetType === 'showbiz_stadium';

  if (requiresMainRoad && !nearMainRoad) {
    return {
      allowed: false,
      reason: `Điều kiện hạ tầng: ${TILE_LABELS[targetType]} có quy mô lớn, xe cứu hỏa và xe cấp cứu không thể vào Đường Hẻm [1]! Bắt buộc phải đặt sát cạnh Đường Nhựa Đô Thị [2], Đường Vành Đai [K] hoặc Cao Tốc [3].`,
    };
  }

  const requiresPowerWater =
    targetType === 'com_mall' ||
    targetType === 'com_office' ||
    targetType === 'ind_fdi' ||
    targetType === 'showbiz_stadium';

  if (requiresPowerWater) {
    let hasPowerWater = false;
    for (let rz = 0; rz < grid.length; rz++) {
      for (let rx = 0; rx < grid[rz].length; rx++) {
        if (grid[rz][rx].type === 'util_power_water') {
          hasPowerWater = true;
          break;
        }
      }
    }
    if (!hasPowerWater) {
      return {
        allowed: false,
        reason: `Điều kiện tiện ích: Cần xây ít nhất 1 công trình Thủy Lợi, Điện & Cấp Thoát Nước [I] trước khi khởi công ${TILE_LABELS[targetType]}!`,
      };
    }
  }

  if (targetType === 'ind_fdi' && metrics.pci < 55) {
    return {
      allowed: false,
      reason: `Điều kiện thu hút FDI: Chỉ số PCI hiện tại (${metrics.pci}/100) chưa đạt ngưỡng 55 để tập đoàn bán dẫn đặt nhà máy! Hãy xây UBND [U], Thủy Lợi & Điện [I] hoặc ưu đãi thuế FDI.`,
    };
  }

  if (targetType === 'showbiz_stadium' && metrics.population < 80) {
    return {
      allowed: false,
      reason: `Điều kiện dân sinh: Thành phố cần đạt tối thiểu 80 cư dân (hiện có ${metrics.population} người) mới đủ điều kiện khởi công Tổ Hợp Sân Vận Động & Showbiz [J]!`,
    };
  }

  return { allowed: true };
}

/**
 * Kiểm tra va chạm (Collision Detection) cho Mô hình 3D Ghost Preview (`previewMesh`)
 */
export function detectGhostCollision(
  grid: TileData[][],
  x: number,
  z: number,
  toolId?: ToolId
): {
  isColliding: boolean;
  collidedWithType: TileType | null;
  collidedWithLabel: string | null;
  collisionReason: string | null;
} {
  if (
    !toolId ||
    toolId === 'inspect' ||
    toolId === 'act_clearance' ||
    toolId === 'act_reserve_land' ||
    toolId === 'sub_drainage'
  ) {
    return {
      isColliding: false,
      collidedWithType: null,
      collidedWithLabel: null,
      collisionReason: null,
    };
  }

  if (z < 0 || z >= grid.length || x < 0 || x >= grid[0].length) {
    return {
      isColliding: false,
      collidedWithType: null,
      collidedWithLabel: null,
      collisionReason: null,
    };
  }

  const tile = grid[z][x];
  if (isBuiltStructure(tile.type)) {
    const label = TILE_LABELS[tile.type];
    return {
      isColliding: true,
      collidedWithType: tile.type,
      collidedWithLabel: label,
      collisionReason: `Va chạm công trình: Không thể đặt đè lên ${label}!`,
    };
  }

  return {
    isColliding: false,
    collidedWithType: null,
    collidedWithLabel: null,
    collisionReason: null,
  };
}

/**
 * Kiểm tra nhanh ô đất (x, z) có đủ điều kiện đặt công trình/công cụ đang chọn hay không
 */
export function canPlaceToolAtTile(
  state: CityGameState,
  x: number,
  z: number,
  toolId?: ToolId,
  bypassLevelLock = true
): {
  allowed: boolean;
  isGhostBuilding: boolean;
  isColliding: boolean;
  collidedWithLabel?: string;
  reason?: string;
} {
  const activeTool = toolId ?? state.selectedTool;
  if (
    activeTool === 'inspect' ||
    activeTool === 'act_clearance' ||
    activeTool === 'sub_drainage'
  ) {
    return { allowed: false, isGhostBuilding: false, isColliding: false };
  }

  if (z < 0 || z >= state.grid.length || x < 0 || x >= state.grid[0].length) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: 'Tọa độ ngoài phạm vi quy hoạch.',
    };
  }

  const tile = state.grid[z][x];

  if (activeTool === 'act_reserve_land') {
    if (tile.type !== 'empty_land' && tile.type !== 'lowland_marsh') {
      return {
        allowed: false,
        isGhostBuilding: false,
        isColliding: true,
        reason: 'Chỉ khoanh quỹ đất công trên Đất Trống hoặc Đất Trũng chưa xây dựng.',
      };
    }
    if (tile.isReservedPublicLand) {
      return {
        allowed: false,
        isGhostBuilding: false,
        isColliding: false,
        reason: 'Ô đất này đã được khoanh quỹ đất công.',
      };
    }
    const reserveCost = Math.max(0.0005, tile.landValue);
    if (state.treasury < reserveCost) {
      return {
        allowed: false,
        isGhostBuilding: false,
        isColliding: false,
        reason: 'Ngân sách không đủ để đặt cọc khoanh đất.',
      };
    }
    return { allowed: true, isGhostBuilding: false, isColliding: false };
  }

  const targetType = activeTool as TileType;
  const spec = BUILDING_SPECS[targetType];
  if (!spec) {
    return { allowed: false, isGhostBuilding: false, isColliding: false };
  }

  const collision = detectGhostCollision(state.grid, x, z, activeTool);
  if (collision.isColliding) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: true,
      collidedWithLabel: collision.collidedWithLabel ?? undefined,
      reason:
        collision.collisionReason ?? 'Ô đất đã có công trình hiện hữu.',
    };
  }

  if (
    !bypassLevelLock &&
    !isToolUnlockedAtLevel(activeTool, state.cityLevel ?? 1)
  ) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: getToolUnlockRequirementLabel(activeTool),
    };
  }

  if (state.treasury < 0) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: 'Ngân sách không đủ',
    };
  }

  if (tile.disputeTurns > 0) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: 'Đang vướng khiếu kiện giải phóng mặt bằng.',
    };
  }

  if (
    tile.type === 'river_water' &&
    !isMainArterialRoad(targetType)
  ) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: 'Chỉ có thể xây cầu đường bộ qua sông.',
    };
  }

  const prereq = validateBuildPrerequisites(
    state.grid,
    x,
    z,
    targetType,
    state.metrics
  );
  if (!prereq.allowed) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: prereq.reason,
    };
  }

  const bridgeSurcharge = tile.type === 'river_water' ? 0.35 : 0;
  const totalCost = spec.costBillion + bridgeSurcharge;
  if (state.treasury < totalCost) {
    return {
      allowed: false,
      isGhostBuilding: true,
      isColliding: false,
      reason: 'Ngân sách không đủ',
    };
  }

  return { allowed: true, isGhostBuilding: true, isColliding: false };
}

/**
 * Pre-flight Check trước khi trừ tiền (`evaluatePlacementRisk`):
 * Kiểm tra nếu thiếu nhân sự phù hợp hoặc upkeep > 15% thu nhập dự kiến,
 * trả về dữ liệu cảnh báo để bật hộp thoại xác nhận màu vàng ("Vẫn Xây" hoặc "Hủy").
 */
export function evaluatePlacementRisk(
  state: CityGameState,
  toolId: ToolId,
  _x: number,
  _z: number
): PlacementRiskEvaluation {
  const emptyTier: LaborTierCounts = { unskilled: 0, skilled: 0, educated: 0 };

  if (
    toolId === 'inspect' ||
    toolId === 'act_clearance' ||
    toolId === 'act_reserve_land' ||
    toolId === 'sub_drainage' ||
    isRoadTile(toolId as TileType)
  ) {
    return {
      hasRisk: false,
      missingWorkersTotal: 0,
      missingByTier: emptyTier,
      expectedMonthlyUpkeep: 0,
      expectedMonthlyRevenueContribution: 0,
      expectedMonthlyNetDeficit: 0,
      upkeepToRevenuePercent: 0,
      isWorkerShortageRisk: false,
      isUpkeepOverThresholdRisk: false,
      reasons: [],
      warningTitle: '',
      warningMessage: '',
    };
  }

  const targetType = toolId as TileType;
  const spec = BUILDING_SPECS[targetType];
  if (!spec) {
    return {
      hasRisk: false,
      missingWorkersTotal: 0,
      missingByTier: emptyTier,
      expectedMonthlyUpkeep: 0,
      expectedMonthlyRevenueContribution: 0,
      expectedMonthlyNetDeficit: 0,
      upkeepToRevenuePercent: 0,
      isWorkerShortageRisk: false,
      isUpkeepOverThresholdRisk: false,
      reasons: [],
      warningTitle: '',
      warningMessage: '',
    };
  }

  const preview = getBuildingFinancialPreview(
    targetType,
    state.policies,
    state.difficulty ?? 'hard'
  );
  const req = spec.requiredWorkers;
  const reqTotal = req.unskilled + req.skilled + req.educated;

  const availUnskilled = Math.max(
    0,
    state.metrics.labor.unskilled - state.metrics.labor.employedUnskilled
  );
  const availSkilled = Math.max(
    0,
    state.metrics.labor.skilled - state.metrics.labor.employedSkilled
  );
  const availEducated = Math.max(
    0,
    state.metrics.labor.educated - state.metrics.labor.employedEducated
  );

  const missingByTier: LaborTierCounts = {
    unskilled: Math.max(0, req.unskilled - availUnskilled),
    skilled: Math.max(0, req.skilled - availSkilled),
    educated: Math.max(0, req.educated - availEducated),
  };
  const missingWorkersTotal =
    missingByTier.unskilled + missingByTier.skilled + missingByTier.educated;

  const isWorkerShortageRisk = reqTotal > 0 && missingWorkersTotal > 0;

  const staffedRatio =
    reqTotal > 0
      ? Math.max(0, (reqTotal - missingWorkersTotal) / reqTotal)
      : 1;
  const expectedMonthlyUpkeep = preview.upkeepBillion;
  const expectedMonthlyRevenueContribution = Number(
    (preview.expectedMonthlyTaxOrOutputBillion * staffedRatio).toFixed(3)
  );

  // So sánh upkeep với thu nhập dự kiến của thành phố (hoặc thu nhập công trình)
  const expectedCityRevenue = Math.max(
    0.4,
    state.metrics.monthlyRevenue + expectedMonthlyRevenueContribution
  );
  const upkeepToRevenuePercent =
    expectedMonthlyUpkeep > 0
      ? Math.round((expectedMonthlyUpkeep / expectedCityRevenue) * 100)
      : 0;

  const isUpkeepOverThresholdRisk =
    expectedMonthlyUpkeep > 0 && upkeepToRevenuePercent > 15;

  const expectedMonthlyNetDeficit = Number(
    Math.max(
      0,
      expectedMonthlyUpkeep - expectedMonthlyRevenueContribution
    ).toFixed(3)
  );

  const reasons: string[] = [];
  if (isWorkerShortageRisk) {
    const tierParts: string[] = [];
    if (missingByTier.unskilled > 0)
      tierParts.push(`${missingByTier.unskilled} Phổ thông`);
    if (missingByTier.skilled > 0)
      tierParts.push(`${missingByTier.skilled} Trung cấp`);
    if (missingByTier.educated > 0)
      tierParts.push(`${missingByTier.educated} Đại học/Kỹ sư`);
    reasons.push(
      `Thiếu ${missingWorkersTotal}/${reqTotal} nhân sự (${tierParts.join(', ')}) — công trình chỉ đạt ~${Math.round(staffedRatio * 100)}% công suất.`
    );
  }

  if (isUpkeepOverThresholdRisk) {
    reasons.push(
      `Phí duy trì (${formatVnd(expectedMonthlyUpkeep)}/tháng) chiếm ${upkeepToRevenuePercent}% tổng thu ngân sách dự kiến (> ngưỡng an toàn 15%).`
    );
  }

  const hasRisk = isWorkerShortageRisk || isUpkeepOverThresholdRisk;
  const warningTitle = `Cảnh Báo Rủi Ro Tài Chính & Nhân Sự: ${TILE_LABELS[targetType]}`;
  const deficitLabel =
    expectedMonthlyNetDeficit > 0
      ? `Dự kiến thâm hụt ròng -${formatVnd(expectedMonthlyNetDeficit)}/tháng.`
      : `Thu ròng dự kiến chỉ đạt +${formatVnd(Math.max(0, expectedMonthlyRevenueContribution - expectedMonthlyUpkeep))}/tháng.`;

  return {
    hasRisk,
    missingWorkersTotal,
    missingByTier,
    expectedMonthlyUpkeep,
    expectedMonthlyRevenueContribution,
    expectedMonthlyNetDeficit,
    upkeepToRevenuePercent,
    isWorkerShortageRisk,
    isUpkeepOverThresholdRisk,
    reasons,
    warningTitle,
    warningMessage: hasRisk ? `${reasons.join(' ')} ${deficitLabel}` : '',
  };
}

export function calculateLandClearanceCost(
  tile: TileData,
  compensationLevel: CompensationLevel,
  difficulty: DifficultyLevel = 'hard'
): {
  canClear: boolean;
  isWildLandClearance: boolean;
  compensationCost: number;
  protestDelayTurns: number;
  stabilityPenalty: number;
} {
  if (tile.type === 'river_water') {
    return {
      canClear: false,
      isWildLandClearance: false,
      compensationCost: 0,
      protestDelayTurns: 0,
      stabilityPenalty: 0,
    };
  }

  const multiplier =
    compensationLevel === 'low'
      ? 0.65
      : compensationLevel === 'fair'
      ? 1.0
      : 1.35;

  const diffClearanceMult = getDifficultySpec(difficulty).clearanceCostMultiplier;

  const reservedDiscountMult = tile.isReservedPublicLand ? 0.3 : 1.0;

  if (!isBuiltStructure(tile.type)) {
    const baseWildPrice =
      tile.type === 'lowland_marsh'
        ? BASE_MARSH_LAND_PRICE
        : BASE_EMPTY_LAND_PRICE;
    const rawWildCost = Math.max(
      0.0005,
      Math.min(0.0015, baseWildPrice * multiplier * diffClearanceMult)
    );
    const wildCost = Number((rawWildCost * reservedDiscountMult).toFixed(4));
    return {
      canClear: true,
      isWildLandClearance: true,
      compensationCost: wildCost,
      protestDelayTurns: 0,
      stabilityPenalty: 0,
    };
  }

  const structureWeight =
    tile.type === 'res_high' ||
    tile.type === 'com_mall' ||
    tile.type === 'com_office'
      ? 1.15
      : tile.type === 'com_market' ||
        tile.type === 'res_mid' ||
        tile.type === 'ind_food'
      ? 1.0
      : 0.85;

  const compensationCost = Number(
    (
      Math.max(
        0.005,
        tile.landValue * multiplier * structureWeight * diffClearanceMult
      ) * reservedDiscountMult
    ).toFixed(3)
  );

  const protestDelayTurns =
    compensationLevel === 'low' && !isRoadTile(tile.type) ? 2 : 0;
  const stabilityPenalty =
    compensationLevel === 'low' ? 6 : compensationLevel === 'fair' ? 1 : -2;

  return {
    canClear: true,
    isWildLandClearance: false,
    compensationCost,
    protestDelayTurns,
    stabilityPenalty,
  };
}

export interface ToolActionResult {
  nextState: CityGameState;
  success: boolean;
  message: string;
  costDelta: number;
  effectType: 'build' | 'clearance' | 'drainage' | 'inspect' | 'error';
}

function initializeTileWithSpec(
  tile: TileData,
  targetType: TileType,
  instanceSeq: number
): void {
  const spec = BUILDING_SPECS[targetType];
  const { instanceId, customName } = generateDefaultBuildingIdentity(
    targetType,
    instanceSeq
  );
  tile.type = targetType;
  tile.instanceId = instanceId;
  tile.customName = customName;
  tile.constructionTotalDays = spec.constructionDays;
  tile.constructionRemainingDays = spec.constructionDays;
  tile.maxCapacity = spec.maxCapacity;
  tile.currentOccupants = 0;
  tile.occupantsByTier = { unskilled: 0, skilled: 0, educated: 0 };
  tile.minimumWealthLevel = spec.minimumWealthLevel;
  tile.requiredWorkers = { ...spec.requiredWorkers };
  tile.assignedWorkers = { unskilled: 0, skilled: 0, educated: 0 };
  tile.revenue = 0;
  tile.taxPIT = 0;
  tile.taxCIT = 0;
  tile.maintenanceCost = Number(spec.maintenanceBillion.toFixed(4));
  tile.netIncome = Number((-spec.maintenanceBillion).toFixed(4));
  tile.lowEfficiencyMonths = 0;
  tile.localSupplyIndex = 100;
  tile.landValue = Number(
    Math.min(
      180,
      tile.landValue + Math.max(0.02, spec.costBillion * 0.85)
    ).toFixed(3)
  );
  if (
    targetType === 'road_highway' ||
    targetType === 'road_ring' ||
    targetType === 'ind_fdi'
  ) {
    tile.hasDrainage = true;
  }
}

export function applyToolToTile(
  state: CityGameState,
  x: number,
  z: number,
  toolId?: ToolId,
  bypassLevelLock?: boolean
): ToolActionResult {
  const activeTool = toolId ?? state.selectedTool;
  const shouldBypassLevelLock = bypassLevelLock ?? (toolId !== undefined);

  if (z < 0 || z >= state.grid.length || x < 0 || x >= state.grid[0].length) {
    return {
      nextState: state,
      success: false,
      message: 'Tọa độ ngoài phạm vi quy hoạch.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const nextGrid = state.grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      occupantsByTier: { ...cell.occupantsByTier },
      requiredWorkers: { ...cell.requiredWorkers },
      assignedWorkers: { ...cell.assignedWorkers },
    }))
  );
  const tile = nextGrid[z][x];
  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;

  if (activeTool === 'inspect') {
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner: `Đang khảo sát ô (${x + 1}, ${z + 1}): ${TILE_LABELS[tile.type]} — Giá đất ${formatVnd(tile.landValue, true)}.`,
      },
      success: true,
      message: `Đã chọn ô (${x + 1}, ${z + 1})`,
      costDelta: 0,
      effectType: 'inspect',
    };
  }

  if (
    !shouldBypassLevelLock &&
    !isToolUnlockedAtLevel(activeTool, state.cityLevel ?? 1)
  ) {
    const reqMsg = getToolUnlockRequirementLabel(activeTool);
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner: `🔒 Chưa mở khóa công trình: ${reqMsg}!`,
      },
      success: false,
      message: reqMsg,
      costDelta: 0,
      effectType: 'error',
    };
  }

  if (state.treasury < 0) {
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner: `Ngân sách không đủ! Ngân sách hiện đang âm (${formatVnd(state.treasury, true)}), không thể thi công công trình mới.`,
      },
      success: false,
      message: 'Ngân sách không đủ',
      costDelta: 0,
      effectType: 'error',
    };
  }

  if (activeTool === 'sub_drainage') {
    if (tile.type === 'river_water') {
      return {
        nextState: { ...state, selectedTile: { x, z } },
        success: false,
        message: 'Không thể lắp ống thoát nước trực tiếp trên lòng sông.',
        costDelta: 0,
        effectType: 'error',
      };
    }
    if (
      tile.hasDrainage ||
      (tile.drainageRemainingDays && tile.drainageRemainingDays > 0)
    ) {
      return {
        nextState: { ...state, selectedTile: { x, z } },
        success: false,
        message: 'Phân khu này đã có hoặc đang lắp đặt ống cống thoát nước.',
        costDelta: 0,
        effectType: 'error',
      };
    }
    const cost = 0.015;
    if (state.treasury < cost) {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner: `Ngân sách không đủ! Cần ${formatVnd(cost, true)} để lắp Ống Thoát Nước nhưng hiện chỉ có ${formatVnd(state.treasury, true)}.`,
        },
        success: false,
        message: 'Ngân sách không đủ',
        costDelta: 0,
        effectType: 'error',
      };
    }

    tile.drainageRemainingDays = 1;
    tile.landValue = Number((tile.landValue + 0.02).toFixed(3));

    const nextTreasury = Number((state.treasury - cost).toFixed(4));
    const nextMetrics = calculateMacroEconomy(
      nextGrid,
      state.policies,
      state.season,
      state.activeConcertMonths,
      nextTreasury,
      state.crisisMonthsElapsed,
      state.difficulty
    );
    const nextCityLevel = computeCityLevel(
      nextMetrics.population,
      nextTreasury,
      state.cityLevel ?? 1
    );
    const obEval = evaluateOnboardingProgress(
      nextGrid,
      nextMetrics.population,
      nextCityLevel,
      state.completedQuests ?? []
    );

    return {
      nextState: {
        ...state,
        treasury: nextTreasury,
        bestPci: Math.max(state.bestPci, nextMetrics.pci),
        selectedTile: { x, z },
        grid: nextGrid,
        regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
        metrics: nextMetrics,
        cityLevel: nextCityLevel,
        onboardingStep: obEval.onboardingStep,
        onboardingCompleted: obEval.onboardingCompleted,
        completedQuests: obEval.completedQuests,
        lastEventBanner: `Đang lắp Ống Thoát Nước tại (${x + 1}, ${z + 1}) (-${formatVnd(cost, true)} · Hoàn thiện sau 1 ngày).`,
      },
      success: true,
      message: 'Đang lắp đặt ống thoát nước (1 ngày)',
      costDelta: -cost,
      effectType: 'drainage',
    };
  }

  if (activeTool === 'act_reserve_land') {
    if (tile.type !== 'empty_land' && tile.type !== 'lowland_marsh') {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner:
            'Chỉ có thể Khoanh Quỹ Đất Công trên Đất Trống hoặc Đất Trũng chưa xây dựng.',
        },
        success: false,
        message: 'Chỉ khoanh quỹ đất công trên đất trống/đất trũng.',
        costDelta: 0,
        effectType: 'error',
      };
    }

    if (tile.isReservedPublicLand) {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner: `Ô đất (${x + 1}, ${z + 1}) đã được khoanh quỹ đất công trước đó!`,
        },
        success: false,
        message: 'Ô đất đã được khoanh quỹ đất công.',
        costDelta: 0,
        effectType: 'error',
      };
    }

    const reserveCost = Number(Math.max(0.0005, tile.landValue).toFixed(4));
    if (state.treasury < reserveCost) {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner: `Ngân sách không đủ! Cần ${formatVnd(reserveCost, true)} (100% giá đất hiện tại) để khoanh quỹ đất công tại (${x + 1}, ${z + 1}).`,
        },
        success: false,
        message: 'Ngân sách không đủ',
        costDelta: 0,
        effectType: 'error',
      };
    }

    tile.isReservedPublicLand = true;
    tile.reservedCostPaid = reserveCost;

    const nextTreasury = Number((state.treasury - reserveCost).toFixed(4));
    const nextMetrics = calculateMacroEconomy(
      nextGrid,
      state.policies,
      state.season,
      state.activeConcertMonths,
      nextTreasury,
      state.crisisMonthsElapsed,
      state.difficulty
    );

    const reserveLedgerEntry: LedgerEntry = {
      id: `RESERVE-Y${state.year}-M${state.month}-D${state.day}-${x + 1}x${z + 1}`,
      day: state.day,
      month: state.month,
      year: state.year,
      season: state.season,
      entryType: 'daily_build',
      summary: `Khoanh Quỹ Đất Công tại (${x + 1}, ${z + 1}) · Đặt cọc 100% giá đất (-${formatVnd(reserveCost, true)})`,
      totalRevenue: 0,
      totalTaxCIT: 0,
      totalTaxPIT: 0,
      totalMaintenanceCost: reserveCost,
      buildingMaintenanceCost: 0,
      infraMaintenanceCost: reserveCost,
      welfareAndFloodCost: 0,
      fdiBonus: 0,
      monthlyPropertyTax: 0,
      monthlyLandUseRevenue: 0,
      monthlyBankNet: 0,
      netIncome: Number((-reserveCost).toFixed(4)),
      treasuryAfter: nextTreasury,
      roadAndDrainageTileCount: 0,
      activeEntityCount: 1,
      entityBreakdown: [],
    };
    const nextGlobalLedger = [
      ...(state.globalLedger ?? []),
      reserveLedgerEntry,
    ].slice(-60);
    GlobalLedger.length = 0;
    GlobalLedger.push(...nextGlobalLedger);

    return {
      nextState: {
        ...state,
        treasury: nextTreasury,
        bestPci: Math.max(state.bestPci, nextMetrics.pci),
        selectedTile: { x, z },
        grid: nextGrid,
        regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
        metrics: nextMetrics,
        globalLedger: nextGlobalLedger,
        lastEventBanner: `Đã khoanh Quỹ Đất Công tại (${x + 1}, ${z + 1}): đặt cọc -${formatVnd(reserveCost, true)} · Giảm 70% phí GPMB cho công trình công & đường bộ (chuột phải để Nhả đất/Cầm cố).`,
      },
      success: true,
      message: 'Khoanh quỹ đất công thành công',
      costDelta: -reserveCost,
      effectType: 'build',
    };
  }

  if (activeTool === 'act_clearance') {
    const clearance = calculateLandClearanceCost(
      tile,
      state.policies.compensationLevel,
      state.difficulty ?? 'hard'
    );
    if (!clearance.canClear) {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner: 'Không thể giải tỏa lòng sông tự nhiên.',
        },
        success: false,
        message: 'Không thể giải tỏa lòng sông.',
        costDelta: 0,
        effectType: 'error',
      };
    }

    if (state.treasury < clearance.compensationCost) {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner: `Ngân sách không đủ! Cần ${formatVnd(clearance.compensationCost, true)} đền bù giải tỏa nhưng hiện chỉ có ${formatVnd(state.treasury, true)}.`,
        },
        success: false,
        message: 'Ngân sách không đủ',
        costDelta: 0,
        effectType: 'error',
      };
    }

    const oldName = tile.customName ?? TILE_LABELS[tile.type];
    tile.type = tile.elevation === 0 ? 'lowland_marsh' : 'empty_land';
    tile.instanceId = undefined;
    tile.customName = undefined;
    tile.revenue = 0;
    tile.taxPIT = 0;
    tile.taxCIT = 0;
    tile.maintenanceCost = 0;
    tile.netIncome = 0;
    tile.sidewalkVendors = false;
    tile.disputeTurns = clearance.protestDelayTurns;
    tile.constructionTotalDays = 0;
    tile.constructionRemainingDays = 0;
    tile.maxCapacity = 0;
    tile.currentOccupants = 0;
    tile.occupantsByTier = { unskilled: 0, skilled: 0, educated: 0 };
    tile.requiredWorkers = { unskilled: 0, skilled: 0, educated: 0 };
    tile.assignedWorkers = { unskilled: 0, skilled: 0, educated: 0 };
    tile.lowEfficiencyMonths = 0;
    tile.localSupplyIndex = 100;
    tile.isReservedPublicLand = false;
    tile.reservedCostPaid = undefined;
    tile.landValue =
      tile.elevation === 0 ? BASE_MARSH_LAND_PRICE : BASE_EMPTY_LAND_PRICE;

    recalculateGridLandValues(nextGrid);

    const nextTreasury = Number(
      (state.treasury - clearance.compensationCost).toFixed(4)
    );
    const nextMetrics = calculateMacroEconomy(
      nextGrid,
      state.policies,
      state.season,
      state.activeConcertMonths,
      nextTreasury,
      state.crisisMonthsElapsed,
      state.difficulty
    );

    const protestNote = clearance.isWildLandClearance
      ? ' (Đền bù san lấp đất nông nghiệp/đất hoang)'
      : clearance.protestDelayTurns > 0
      ? ` (Đền bù thấp gây khiếu kiện, chậm tiến độ ${clearance.protestDelayTurns} tháng!)`
      : ' (Người dân đồng thuận bàn giao mặt bằng sạch)';

    return {
      nextState: {
        ...state,
        treasury: nextTreasury,
        bestPci: Math.max(state.bestPci, nextMetrics.pci),
        selectedTile: { x, z },
        grid: nextGrid,
        regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
        metrics: nextMetrics,
        lastEventBanner: `Đã giải tỏa ${oldName} tại (${x + 1}, ${z + 1}): -${formatVnd(clearance.compensationCost, true)}${protestNote}`,
      },
      success: true,
      message: 'Giải tỏa mặt bằng thành công',
      costDelta: -clearance.compensationCost,
      effectType: 'clearance',
    };
  }

  if (tile.disputeTurns > 0) {
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner: `Ô đất (${x + 1}, ${z + 1}) đang vướng khiếu kiện đền bù, còn chờ ${tile.disputeTurns} tháng!`,
      },
      success: false,
      message: 'Đang vướng khiếu kiện giải phóng mặt bằng.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  if (
    tile.type === 'river_water' &&
    !isMainArterialRoad(activeTool as TileType)
  ) {
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner:
          'Trên sông Thịnh Vượng chỉ có thể quy hoạch cầu Đường Nhựa [2], Vành Đai [K] hoặc Cao Tốc [3].',
      },
      success: false,
      message: 'Chỉ có thể xây cầu đường bộ qua sông.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  if (isBuiltStructure(tile.type)) {
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner: `Ô (${x + 1}, ${z + 1}) đã có ${TILE_LABELS[tile.type]}. Hãy dùng "Đền Bù Giải Tỏa [B]" hoặc Chuột phải vào công trình để giải tỏa trước!`,
      },
      success: false,
      message: 'Cần Đền Bù Giải Tỏa công trình hiện hữu trước.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const targetType = activeTool as TileType;
  const spec = BUILDING_SPECS[targetType];
  if (!spec || spec.costBillion <= 0) {
    return {
      nextState: state,
      success: false,
      message: 'Công cụ không hợp lệ.',
      costDelta: 0,
      effectType: 'error',
    };
  }
  const bridgeSurcharge = tile.type === 'river_water' ? 0.35 : 0;

  const prereqCheck = validateBuildPrerequisites(
    nextGrid,
    x,
    z,
    targetType,
    state.metrics
  );
  if (!prereqCheck.allowed) {
    return {
      nextState: {
        ...state,
        selectedTile: { x, z },
        lastEventBanner: prereqCheck.reason ?? 'Chưa đủ điều kiện xây dựng.',
      },
      success: false,
      message: prereqCheck.reason ?? 'Chưa đủ điều kiện xây dựng.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  let totalCost = spec.costBillion + bridgeSurcharge;
  const wasReservedPublicLand = Boolean(tile.isReservedPublicLand);
  const preBuildLandValue = tile.landValue;
  let reservedDiscountNote = '';

  // Nếu ô đã khoanh quỹ đất công và xây công trình công hoặc đường bộ: giảm 70% chi phí giải phóng mặt bằng/mặt bằng công
  const isPublicOrRoadBuild =
    isRoadTile(targetType) ||
    isPublicServiceModule(targetType) ||
    targetType === 'util_power_water';
  if (wasReservedPublicLand && isPublicOrRoadBuild) {
    const gpmbDiscount = Number(
      Math.min(totalCost * 0.5, preBuildLandValue * 0.7).toFixed(4)
    );
    if (gpmbDiscount > 0) {
      totalCost = Number(Math.max(0.001, totalCost - gpmbDiscount).toFixed(4));
      reservedDiscountNote = ` · Quỹ đất công (-70% phí GPMB: tiết kiệm ${formatVnd(gpmbDiscount, true)})`;
    }
  }

  // Thu tiền sử dụng đất 1 lần (12% * tile.landValue) khi xây dự án thương mại/chung cư cao cấp
  const earnsLandUseFee =
    targetType === 'res_high' ||
    targetType === 'com_mall' ||
    targetType === 'com_office';
  const landUseRevenue = earnsLandUseFee
    ? Number((0.12 * preBuildLandValue).toFixed(3))
    : 0;
  const landUseNote =
    landUseRevenue > 0
      ? ` · +Thu tiền sử dụng đất 1 lần: +${formatVnd(landUseRevenue, true)}`
      : '';

  let snapMessage = '';
  let nextSeq = state.nextInstanceSeq || 1;

  if (isRoadTile(targetType)) {
    const snapInfo = detectRoadProximitySnap(nextGrid, x, z, targetType);
    const extraSnapCost = snapInfo.snappedGapTiles.length * spec.costBillion;
    if (state.treasury < totalCost + extraSnapCost) {
      if (state.treasury < totalCost) {
        return {
          nextState: {
            ...state,
            selectedTile: { x, z },
            lastEventBanner: `Ngân sách không đủ! Cần ${formatVnd(totalCost, true)} để xây ${TILE_LABELS[targetType]} nhưng hiện chỉ còn ${formatVnd(state.treasury, true)}.`,
          },
          success: false,
          message: 'Ngân sách không đủ',
          costDelta: 0,
          effectType: 'error',
        };
      }
      initializeTileWithSpec(tile, targetType, nextSeq++);
    } else {
      initializeTileWithSpec(tile, targetType, nextSeq++);
      if (snapInfo.snappedGapTiles.length > 0) {
        for (const gap of snapInfo.snappedGapTiles) {
          const gapTile = nextGrid[gap.z][gap.x];
          initializeTileWithSpec(gapTile, targetType, nextSeq++);
          gapTile.isReservedPublicLand = false;
          gapTile.reservedCostPaid = undefined;
          totalCost += spec.costBillion;
        }
        snapMessage = ` · Tự động bắt dính nối liền ${snapInfo.snappedGapTiles.length} ô đường tạo ${snapInfo.junctionLabel}`;
      }
    }

    refreshAllRoadJunctions(nextGrid);
    if (!snapMessage) {
      const updatedConn = getRoadConnections(nextGrid, x, z, targetType);
      if (updatedConn.junctionType === 'crossroad') {
        snapMessage = ' · Tự động khớp nối tạo Ngã Tư (Cross-Intersection)';
      } else if (updatedConn.junctionType === 't_junction') {
        snapMessage = ' · Tự động khớp nối tạo Ngã Ba Chữ T (T-Junction)';
      } else if (updatedConn.junctionType === 'corner') {
        snapMessage = ' · Tự động khớp nối tạo Góc Cua (L-Junction)';
      }
    }
  } else {
    if (state.treasury < totalCost) {
      return {
        nextState: {
          ...state,
          selectedTile: { x, z },
          lastEventBanner: `Ngân sách không đủ! Cần ${formatVnd(totalCost, true)} để khởi công ${TILE_LABELS[targetType]} nhưng hiện chỉ còn ${formatVnd(state.treasury, true)}.`,
        },
        success: false,
        message: 'Ngân sách không đủ',
        costDelta: 0,
        effectType: 'error',
      };
    }
    initializeTileWithSpec(tile, targetType, nextSeq++);
  }

  tile.isReservedPublicLand = false;
  tile.reservedCostPaid = undefined;

  refreshAllRoadJunctions(nextGrid);
  recalculateGridLandValues(nextGrid);

  const nextTreasury = Number(
    (state.treasury - totalCost + landUseRevenue).toFixed(4)
  );
  const nextMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    nextTreasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );
  if (landUseRevenue > 0) {
    nextMetrics.monthlyLandUseRevenue = Number(
      ((nextMetrics.monthlyLandUseRevenue ?? 0) + landUseRevenue).toFixed(3)
    );
  }

  const netBuildCashflow = Number((landUseRevenue - totalCost).toFixed(4));
  const buildLedgerEntry: LedgerEntry = {
    id: `BUILD-Y${state.year}-M${state.month}-D${state.day}-${tile.instanceId ?? nextSeq}`,
    day: state.day,
    month: state.month,
    year: state.year,
    season: state.season,
    entryType: 'daily_build',
    summary: `Khởi công ${tile.customName ?? TILE_LABELS[targetType]} (${tile.instanceId}) tại (${x + 1}, ${z + 1})${landUseNote}${reservedDiscountNote}`,
    totalRevenue: landUseRevenue,
    totalTaxCIT: 0,
    totalTaxPIT: 0,
    totalMaintenanceCost: Number(totalCost.toFixed(4)),
    buildingMaintenanceCost: isRoadTile(targetType) ? 0 : Number(totalCost.toFixed(4)),
    infraMaintenanceCost: isRoadTile(targetType) ? Number(totalCost.toFixed(4)) : 0,
    welfareAndFloodCost: 0,
    fdiBonus: 0,
    monthlyPropertyTax: 0,
    monthlyLandUseRevenue: landUseRevenue,
    monthlyBankNet: 0,
    netIncome: netBuildCashflow,
    treasuryAfter: nextTreasury,
    roadAndDrainageTileCount: isRoadTile(targetType) ? 1 : 0,
    activeEntityCount: 1,
    entityBreakdown: [
      {
        instanceId: tile.instanceId ?? `BLD-${nextSeq}`,
        customName: tile.customName ?? TILE_LABELS[targetType],
        tileType: targetType,
        x,
        z,
        occupantsOrWorkers:
          spec.maxCapacity > 0
            ? `0/${spec.maxCapacity} dân`
            : `${
                spec.requiredWorkers.unskilled +
                spec.requiredWorkers.skilled +
                spec.requiredWorkers.educated
              } nhân sự`,
        revenue: landUseRevenue,
        taxCIT: 0,
        taxPIT: 0,
        maintenanceCost: Number(totalCost.toFixed(4)),
        netIncome: netBuildCashflow,
      },
    ],
  };

  const nextGlobalLedger = [...(state.globalLedger ?? []), buildLedgerEntry].slice(-60);
  GlobalLedger.length = 0;
  GlobalLedger.push(...nextGlobalLedger);

  const capNote =
    spec.maxCapacity > 0
      ? ` · Sức chứa 0/${spec.maxCapacity} người`
      : spec.requiredWorkers.unskilled +
          spec.requiredWorkers.skilled +
          spec.requiredWorkers.educated >
        0
      ? ` · Cần 0/${
          spec.requiredWorkers.unskilled +
          spec.requiredWorkers.skilled +
          spec.requiredWorkers.educated
        } nhân sự`
      : '';

  const nextCityLevel = computeCityLevel(
    nextMetrics.population,
    nextTreasury,
    state.cityLevel ?? 1
  );
  const obEval = evaluateOnboardingProgress(
    nextGrid,
    nextMetrics.population,
    nextCityLevel,
    state.completedQuests ?? []
  );

  return {
    nextState: {
      ...state,
      treasury: nextTreasury,
      bestPci: Math.max(state.bestPci, nextMetrics.pci),
      selectedTile: { x, z },
      grid: nextGrid,
      regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
      metrics: nextMetrics,
      nextInstanceSeq: nextSeq,
      globalLedger: nextGlobalLedger,
      cityLevel: nextCityLevel,
      onboardingStep: obEval.onboardingStep,
      onboardingCompleted: obEval.onboardingCompleted,
      completedQuests: obEval.completedQuests,
      lastEventBanner: `Khởi công ${tile.customName ?? TILE_LABELS[targetType]} [${tile.instanceId}] tại (${x + 1}, ${z + 1}): -${formatVnd(totalCost, true)} · Hoàn thiện sau ${spec.constructionDays} ngày${capNote}${snapMessage}${reservedDiscountNote}${landUseNote}.`,
    },
    success: true,
    message: `Khởi công ${TILE_LABELS[targetType]}`,
    costDelta: netBuildCashflow,
    effectType: 'build',
  };
}

/**
 * Gỡ vốn Land Banking (`unreservePublicLand`):
 * Hủy đánh dấu `isReservedPublicLand` trên ô đất trống đã khoanh và hoàn trả 85% tiền cọc về Ngân sách.
 */
export function unreservePublicLand(
  state: CityGameState,
  x: number,
  z: number
): ToolActionResult {
  if (z < 0 || z >= state.grid.length || x < 0 || x >= state.grid[0].length) {
    return {
      nextState: state,
      success: false,
      message: 'Tọa độ không hợp lệ.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const targetTile = state.grid[z][x];
  if (!targetTile.isReservedPublicLand) {
    return {
      nextState: state,
      success: false,
      message: 'Ô đất này chưa được khoanh quỹ đất công.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const isCollateralized = (state.loans ?? []).some(
    (loan) =>
      loan.collateralTile &&
      loan.collateralTile.x === x &&
      loan.collateralTile.z === z
  );
  if (isCollateralized) {
    return {
      nextState: {
        ...state,
        lastEventBanner: `Không thể nhả ô đất (${x + 1}, ${z + 1}) vì đang được cầm cố thế chấp tại Ngân hàng Đô thị! Hãy tất toán khoản vay trước.`,
      },
      success: false,
      message: 'Ô đất đang được thế chấp tại Ngân hàng.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const nextGrid = state.grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      occupantsByTier: { ...cell.occupantsByTier },
      requiredWorkers: { ...cell.requiredWorkers },
      assignedWorkers: { ...cell.assignedWorkers },
    }))
  );
  const tile = nextGrid[z][x];
  const basePaid = tile.reservedCostPaid ?? tile.landValue;
  const refundAmount = Number((0.85 * basePaid).toFixed(4));

  tile.isReservedPublicLand = false;
  tile.reservedCostPaid = undefined;

  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;
  const nextTreasury = Number((state.treasury + refundAmount).toFixed(4));
  const nextMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    nextTreasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );

  const ledgerEntry: LedgerEntry = {
    id: `UNRES-Y${state.year}-M${state.month}-D${state.day}-${x + 1}x${z + 1}`,
    day: state.day,
    month: state.month,
    year: state.year,
    season: state.season,
    entryType: 'daily_build',
    summary: `Nhả Quỹ Đất Công tại (${x + 1}, ${z + 1}): Hoàn cọc 85% (+${formatVnd(refundAmount, true)})`,
    totalRevenue: refundAmount,
    totalTaxCIT: 0,
    totalTaxPIT: 0,
    totalMaintenanceCost: 0,
    buildingMaintenanceCost: 0,
    infraMaintenanceCost: 0,
    welfareAndFloodCost: 0,
    fdiBonus: 0,
    monthlyPropertyTax: 0,
    monthlyLandUseRevenue: 0,
    monthlyBankNet: 0,
    netIncome: refundAmount,
    treasuryAfter: nextTreasury,
    roadAndDrainageTileCount: 0,
    activeEntityCount: 1,
    entityBreakdown: [],
  };
  const nextGlobalLedger = [...(state.globalLedger ?? []), ledgerEntry].slice(-60);
  GlobalLedger.length = 0;
  GlobalLedger.push(...nextGlobalLedger);

  return {
    nextState: {
      ...state,
      treasury: nextTreasury,
      grid: nextGrid,
      regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
      metrics: nextMetrics,
      globalLedger: nextGlobalLedger,
      lastEventBanner: `Đã nhả Quỹ Đất Công ô (${x + 1}, ${z + 1}) và hoàn trả 85% cọc: +${formatVnd(refundAmount, true)} vào Ngân sách.`,
    },
    success: true,
    message: `Nhả đất thành công (+${formatVnd(refundAmount, true)})`,
    costDelta: refundAmount,
    effectType: 'clearance',
  };
}

/**
 * Cầm cố Quỹ Đất Công (`mortgageReservedLand`):
 * Cho vay thế chấp bằng 70% * tile.landValue với lãi suất ưu đãi 0.6%/tháng (kỳ hạn 6 tháng),
 * gắn `collateralTile`. Nếu quá hạn khi đáo hạn mà không đủ tiền trả, tự động thanh lý quỹ đất công.
 */
export function mortgageReservedLand(
  state: CityGameState,
  x: number,
  z: number
): ToolActionResult {
  if (z < 0 || z >= state.grid.length || x < 0 || x >= state.grid[0].length) {
    return {
      nextState: state,
      success: false,
      message: 'Tọa độ không hợp lệ.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const tile = state.grid[z][x];
  if (!tile.isReservedPublicLand) {
    return {
      nextState: state,
      success: false,
      message: 'Chỉ có thể cầm cố ô đất đã khoanh quỹ đất công.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const alreadyMortgaged = (state.loans ?? []).some(
    (loan) =>
      loan.collateralTile &&
      loan.collateralTile.x === x &&
      loan.collateralTile.z === z
  );
  if (alreadyMortgaged) {
    return {
      nextState: {
        ...state,
        lastEventBanner: `Ô đất (${x + 1}, ${z + 1}) hiện đã được cầm cố thế chấp cho một khoản vay đang chạy!`,
      },
      success: false,
      message: 'Ô đất đã được cầm cố trước đó.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const principal = Number((0.7 * tile.landValue).toFixed(4));
  if (principal < 0.0001) {
    return {
      nextState: state,
      success: false,
      message: 'Giá trị đất quá thấp để thế chấp.',
      costDelta: 0,
      effectType: 'error',
    };
  }

  const newLoan: BankLoan = {
    id: `MORT-Y${state.year}-M${state.month}-D${state.day}-${x + 1}x${z + 1}`,
    principal,
    remainingPrincipal: principal,
    monthlyRatePercent: 0.6,
    totalMonths: 6,
    remainingMonths: 6,
    collateralTile: { x, z },
  };

  const nextTreasury = Number((state.treasury + principal).toFixed(4));
  const nextLoans = [...(state.loans ?? []), newLoan];
  const nextMetrics = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    nextTreasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );

  const ledgerEntry: LedgerEntry = {
    id: `BANK-MORT-${newLoan.id}`,
    day: state.day,
    month: state.month,
    year: state.year,
    season: state.season,
    entryType: 'daily_build',
    summary: `Cầm cố Quỹ Đất Công (${x + 1}, ${z + 1}) vay 70% giá trị (+${formatVnd(principal, true)} · 0,6%/th · 6 tháng)`,
    totalRevenue: principal,
    totalTaxCIT: 0,
    totalTaxPIT: 0,
    totalMaintenanceCost: 0,
    buildingMaintenanceCost: 0,
    infraMaintenanceCost: 0,
    welfareAndFloodCost: 0,
    fdiBonus: 0,
    monthlyPropertyTax: 0,
    monthlyLandUseRevenue: 0,
    monthlyBankNet: principal,
    netIncome: principal,
    treasuryAfter: nextTreasury,
    roadAndDrainageTileCount: 0,
    activeEntityCount: 1,
    entityBreakdown: [],
  };
  const nextGlobalLedger = [...(state.globalLedger ?? []), ledgerEntry].slice(-60);
  GlobalLedger.length = 0;
  GlobalLedger.push(...nextGlobalLedger);

  return {
    nextState: {
      ...state,
      treasury: nextTreasury,
      loans: nextLoans,
      metrics: nextMetrics,
      globalLedger: nextGlobalLedger,
      lastEventBanner: `Đã cầm cố Quỹ Đất Công (${x + 1}, ${z + 1}): giải ngân +${formatVnd(principal, true)} (lãi suất ưu đãi 0,6%/tháng, kỳ hạn 6 tháng).`,
    },
    success: true,
    message: `Giải ngân vay thế chấp +${formatVnd(principal, true)}`,
    costDelta: principal,
    effectType: 'build',
  };
}
