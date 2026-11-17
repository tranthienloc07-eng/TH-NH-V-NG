import {
  BUILDING_SPECS,
  calculatePrivateServiceIncomeSuitability,
  canRoadsConnect,
  classifyRoadJunction,
  EXPANSION_POP_TARGET,
  EXPANSION_TREASURY_TARGET,
  formatVnd,
  generateDefaultBuildingIdentity,
  getDifficultySpec,
  GRID_SIZE,
  hasNeighborOfType,
  isBuiltStructure,
  isEconomicCitModule,
  isMainArterialRoad,
  isPrivateServiceModule,
  isPublicServiceModule,
  isResidentialTile,
  isRoadTile,
  isWorkplaceTile,
  STARTING_TREASURY,
  TILE_LABELS,
} from './constants';
import {
  CityGameState,
  DifficultyLevel,
  EntityLedgerRecord,
  LaborTierCounts,
  LedgerEntry,
  MacroMetrics,
  MacroPolicies,
  MonthlyCitEntry,
  SeasonType,
  SidewalkPolicy,
  TileData,
  TileDetailedReport,
  TileType,
  TransitLevel,
} from './types';

// Hệ thống Sổ cái Toàn cục (GlobalLedger) ghi lại lịch sử dòng tiền của từng ngày/tháng
export const GlobalLedger: LedgerEntry[] = [];

function getLocalRoadJunctionType(grid: TileData[][], x: number, z: number) {
  const selfType =
    z >= 0 && z < grid.length && x >= 0 && x < grid[0].length
      ? grid[z][x].type
      : 'road_urban';
  const check = (nx: number, nz: number): boolean => {
    if (nz < 0 || nz >= grid.length || nx < 0 || nx >= grid[0].length) {
      return false;
    }
    return canRoadsConnect(selfType, grid[nz][nx].type);
  };
  return classifyRoadJunction(
    check(x, z - 1),
    check(x, z + 1),
    check(x - 1, z),
    check(x + 1, z)
  );
}

/**
 * Tính chỉ số Cung ứng Cục bộ (`localSupplyIndex`: 0 - 100%) trong bán kính 5 ô
 * tới nguồn cung và đường trục (`road_ring`, `road_highway`), dùng `Math.max` theo từng nhóm
 * (KHÔNG cộng dồn khi đặt nhiều công trình cùng loại cạnh nhau).
 */
export function calculateLocalSupplyIndex(
  grid: TileData[][],
  x: number,
  z: number,
  tileType: TileType
): number {
  const connectedToRoad = hasNeighborOfType(grid, x, z, [
    'road_alley',
    'road_urban',
    'road_ring',
    'road_highway',
  ]);
  const baseScore = connectedToRoad ? 65 : 45;

  let maxArterialBonus = 0;
  let maxGatewayBonus = 0;
  let maxAgriBonus = 0;
  let maxIndustrialSupplyBonus = 0;

  for (let rz = Math.max(0, z - 5); rz <= Math.min(grid.length - 1, z + 5); rz++) {
    for (
      let rx = Math.max(0, x - 5);
      rx <= Math.min(grid[rz].length - 1, x + 5);
      rx++
    ) {
      const dist = Math.abs(rx - x) + Math.abs(rz - z);
      if (dist > 5) continue;

      const neighbor = grid[rz][rx];
      if (neighbor.constructionRemainingDays > 0 || neighbor.isFlooded) {
        continue;
      }

      // Nhóm 1: Đường trục vận tải (Vành đai / Cao tốc / Đường đô thị) - dùng Math.max không cộng dồn
      if (neighbor.type === 'road_highway') {
        maxArterialBonus = Math.max(maxArterialBonus, 18);
      } else if (neighbor.type === 'road_ring') {
        maxArterialBonus = Math.max(maxArterialBonus, 15);
      } else if (neighbor.type === 'road_urban') {
        maxArterialBonus = Math.max(maxArterialBonus, 6);
      }

      // Nhóm 2: Cửa ngõ Cảng / Ga liên vùng - dùng Math.max
      if (
        neighbor.type === 'gateway_port' ||
        neighbor.type === 'gateway_station'
      ) {
        maxGatewayBonus = Math.max(maxGatewayBonus, 12);
      }

      // Không tự tính chính ô đó làm nguồn cung cho mình
      if (rx === x && rz === z) continue;

      // Nhóm 3: Nguồn cung Nông trại (agr_farm) - dùng Math.max (đặt nhiều nông trại cạnh nhau không cộng dồn)
      if (neighbor.type === 'agr_farm') {
        const bonus =
          tileType === 'ind_food' || tileType === 'com_market' ? 20 : 10;
        maxAgriBonus = Math.max(maxAgriBonus, bonus);
      }

      // Nhóm 4: Nguồn cung Chế biến / Sản xuất (ind_food, ind_factory) - dùng Math.max
      if (neighbor.type === 'ind_food' || neighbor.type === 'ind_factory') {
        const bonus =
          tileType === 'com_market' ||
          tileType === 'com_mall' ||
          tileType === 'com_street'
            ? 12
            : 8;
        maxIndustrialSupplyBonus = Math.max(maxIndustrialSupplyBonus, bonus);
      }
    }
  }

  return Math.max(
    40,
    Math.min(
      100,
      baseScore +
        maxArterialBonus +
        maxGatewayBonus +
        maxAgriBonus +
        maxIndustrialSupplyBonus
    )
  );
}

function hasActiveAgriFarmInRadius(
  grid: TileData[][],
  x: number,
  z: number,
  radius = 5
): boolean {
  for (
    let rz = Math.max(0, z - radius);
    rz <= Math.min(grid.length - 1, z + radius);
    rz++
  ) {
    for (
      let rx = Math.max(0, x - radius);
      rx <= Math.min(grid[rz].length - 1, x + radius);
      rx++
    ) {
      if (Math.abs(rx - x) + Math.abs(rz - z) > radius) continue;
      const t = grid[rz][rx];
      if (
        t.type === 'agr_farm' &&
        t.constructionRemainingDays === 0 &&
        !t.isFlooded
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Kiểm tra điều kiện nghiêm ngặt để Tổ chức Đại Nhạc Hội Showbiz (Chống lỗi hack tiền đầu game khi chưa xây gì!):
 * 1. Không được đang có Đại nhạc hội diễn ra (activeConcertMonths === 0).
 * 2. Phải có ít nhất 1 Tổ Hợp Sân Vận Động & Showbiz [J] ĐÃ XÂY XONG (constructionRemainingDays === 0) và KHÔNG BỊ NGẬP.
 * 3. Sân vận động đó phải kết nối với Đường Nhựa/Vành Đai/Cao Tốc và có tối thiểu 20/40 nhân sự đang làm việc (assignedWorkersTotal >= 20).
 * 4. Thành phố phải có quy mô dân số tối thiểu 100 người.
 */
export function evaluateConcertEligibility(
  grid: TileData[][],
  population: number,
  activeConcertMonths: number
): {
  canTriggerConcert: boolean;
  concertBlockReason: string | null;
  readyStadiumCount: number;
  totalShowbizWorkers: number;
} {
  if (activeConcertMonths > 0) {
    return {
      canTriggerConcert: false,
      concertBlockReason: `Đại nhạc hội đang diễn ra (còn ${activeConcertMonths} tháng). Không thể bấm liên tục!`,
      readyStadiumCount: 0,
      totalShowbizWorkers: 0,
    };
  }

  let builtStadiums = 0;
  let completedStadiums = 0;
  let readyStadiumCount = 0;
  let totalShowbizWorkers = 0;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x];
      if (t.type === 'showbiz_stadium') {
        builtStadiums++;
        if (t.constructionRemainingDays === 0 && !t.isFlooded) {
          completedStadiums++;
          const workers =
            t.assignedWorkers.unskilled +
            t.assignedWorkers.skilled +
            t.assignedWorkers.educated;
          totalShowbizWorkers += workers;
          const nearMainRoad = hasNeighborOfType(grid, x, z, [
            'road_urban',
            'road_ring',
            'road_highway',
          ]);
          if (nearMainRoad && workers >= 20) {
            readyStadiumCount++;
          }
        }
      }
    }
  }

  if (builtStadiums === 0) {
    return {
      canTriggerConcert: false,
      concertBlockReason:
        'Chưa xây dựng Tổ Hợp Sân Vận Động & Showbiz [J]! Không thể tổ chức Đại nhạc hội khi chưa có sân vận động.',
      readyStadiumCount: 0,
      totalShowbizWorkers: 0,
    };
  }

  if (completedStadiums === 0) {
    return {
      canTriggerConcert: false,
      concertBlockReason:
        'Tổ Hợp Sân Vận Động & Showbiz [J] đang thi công hoặc đang bị ngập lụt, chưa thể đón khán giả!',
      readyStadiumCount: 0,
      totalShowbizWorkers: 0,
    };
  }

  if (readyStadiumCount === 0) {
    return {
      canTriggerConcert: false,
      concertBlockReason: `Tổ Hợp Showbiz chưa đủ nhân sự vận hành (Hiện có ${totalShowbizWorkers}/40 người, cần tối thiểu 20 nhân sự từ các khu dân cư)!`,
      readyStadiumCount: 0,
      totalShowbizWorkers,
    };
  }

  if (population < 100) {
    return {
      canTriggerConcert: false,
      concertBlockReason: `Dân số thành phố (${population} người) chưa đạt tối thiểu 100 người để lấp đầy khán đài Đại nhạc hội!`,
      readyStadiumCount,
      totalShowbizWorkers,
    };
  }

  return {
    canTriggerConcert: true,
    concertBlockReason: null,
    readyStadiumCount,
    totalShowbizWorkers,
  };
}

export function runJobPathfindingSystem(
  grid: TileData[][],
  policies: MacroPolicies
): {
  totalSupply: LaborTierCounts;
  totalDemand: LaborTierCounts;
  totalEmployed: LaborTierCounts;
  staffShortageBuildings: number;
} {
  const brainDrainFactor =
    policies.pitEducated > 25
      ? Math.max(0.4, 1 - (policies.pitEducated - 25) * 0.05)
      : 1.0;

  const transitLevel: TransitLevel =
    policies.transitLevel ?? (policies.subsidizeBusTransit ? 1 : 0);

  let supplyUnskilled = 0;
  let supplySkilled = 0;
  let supplyEducated = 0;
  const resPositions: { x: number; z: number }[] = [];

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (isResidentialTile(tile.type) && tile.constructionRemainingDays === 0) {
        if (tile.type === 'res_high') {
          tile.occupantsByTier.unskilled = 0;
          tile.currentOccupants =
            tile.occupantsByTier.skilled + tile.occupantsByTier.educated;
        }
        if (tile.currentOccupants > 0) {
          resPositions.push({ x, z });
        }
        supplyUnskilled += tile.occupantsByTier.unskilled;
        supplySkilled += tile.occupantsByTier.skilled;
        supplyEducated += Math.round(
          tile.occupantsByTier.educated * brainDrainFactor
        );
      }
    }
  }

  let remUnskilled = supplyUnskilled;
  let remSkilled = supplySkilled;
  let remEducated = supplyEducated;

  let demandUnskilled = 0;
  let demandSkilled = 0;
  let demandEducated = 0;
  let staffShortageBuildings = 0;

  // Phạm vi tìm việc mở rộng theo cấp độ Giao thông công cộng (0: 8 ô, 1: 14 ô, 2: toàn thành phố 36 ô)
  const maxCommuteRange = transitLevel === 2 ? 36 : transitLevel === 1 ? 14 : 8;

  const workplaces: TileData[] = [];
  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (isWorkplaceTile(tile.type)) {
        if (tile.constructionRemainingDays > 0) {
          tile.assignedWorkers = { unskilled: 0, skilled: 0, educated: 0 };
        } else {
          workplaces.push(tile);
        }
      }
    }
  }

  const isWithinTransitRange = (wp: TileData): number => {
    if (resPositions.length === 0) return 1;
    let minDist = Infinity;
    for (const rp of resPositions) {
      const d = Math.abs(wp.x - rp.x) + Math.abs(wp.z - rp.z);
      if (d < minDist) minDist = d;
    }
    return minDist <= maxCommuteRange ? 1 : 0;
  };

  workplaces.sort((a, b) => {
    const aPriority =
      a.type === 'util_power_water' || a.type === 'pub_admin' ? 1 : 0;
    const bPriority =
      b.type === 'util_power_water' || b.type === 'pub_admin' ? 1 : 0;
    if (bPriority !== aPriority) return bPriority - aPriority;

    const aInRange = isWithinTransitRange(a);
    const bInRange = isWithinTransitRange(b);
    if (bInRange !== aInRange) return bInRange - aInRange;

    const aRoad = hasNeighborOfType(grid, a.x, a.z, [
      'road_alley',
      'road_urban',
      'road_ring',
      'road_highway',
    ])
      ? 1
      : 0;
    const bRoad = hasNeighborOfType(grid, b.x, b.z, [
      'road_alley',
      'road_urban',
      'road_ring',
      'road_highway',
    ])
      ? 1
      : 0;
    return bRoad - aRoad;
  });

  for (const wp of workplaces) {
    const req = wp.requiredWorkers;
    demandUnskilled += req.unskilled;
    demandSkilled += req.skilled;
    demandEducated += req.educated;

    const fillU = Math.min(req.unskilled, remUnskilled);
    const fillS = Math.min(req.skilled, remSkilled);
    const fillE = Math.min(req.educated, remEducated);

    remUnskilled -= fillU;
    remSkilled -= fillS;
    remEducated -= fillE;

    wp.assignedWorkers = {
      unskilled: fillU,
      skilled: fillS,
      educated: fillE,
    };

    if (fillU < req.unskilled || fillS < req.skilled || fillE < req.educated) {
      staffShortageBuildings++;
    }
  }

  return {
    totalSupply: {
      unskilled: supplyUnskilled,
      skilled: supplySkilled,
      educated: supplyEducated,
    },
    totalDemand: {
      unskilled: demandUnskilled,
      skilled: demandSkilled,
      educated: demandEducated,
    },
    totalEmployed: {
      unskilled: supplyUnskilled - remUnskilled,
      skilled: supplySkilled - remSkilled,
      educated: supplyEducated - remEducated,
    },
    staffShortageBuildings,
  };
}

export interface PublicInfraAndAdminStatus {
  utilityActiveStations: number;
  utilityCapacityPop: number;
  utilityCapacityBuildings: number;
  utilityDemandPop: number;
  utilityDemandBuildings: number;
  utilityLoadPercent: number;
  isUtilityOverloaded: boolean;
  utilityOverloadOutputMultiplier: number; // 0.65 (-35% sản lượng) khi utilityLoadPercent > 100%, 1.0 bình thường
  hasActivePublicAdmin: boolean;
  taxCollectionEfficiencyPercent: number;  // 100% khi có UBND đủ nhân sự, 88% khi thất thoát hành chính 12%
  taxCollectionMultiplier: number;         // 1.0 khi có UBND đủ nhân sự, 0.88 khi thất thoát 12%
}

/**
 * Đánh giá Công suất Nhà máy Thủy lợi & Điện (util_power_water: 250 dân & 20 công trình / trạm)
 * và Hiệu lực thu thuế của UBND (pub_admin: chống thất thoát hành chính 12% CIT/PIT).
 */
export function evaluatePublicInfraAndAdminStatus(
  grid: TileData[][]
): PublicInfraAndAdminStatus {
  let utilityActiveStations = 0;
  let utilityDemandPop = 0;
  let utilityDemandBuildings = 0;
  let hasActivePublicAdmin = false;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x];
      if (!isBuiltStructure(t.type) || t.constructionRemainingDays > 0) {
        continue;
      }

      if (isResidentialTile(t.type)) {
        utilityDemandPop += t.currentOccupants;
      }

      if (
        !isRoadTile(t.type) &&
        t.type !== 'util_power_water' &&
        t.type !== 'gateway_port' &&
        t.type !== 'gateway_station'
      ) {
        utilityDemandBuildings += 1;
      }

      if (t.type === 'util_power_water') {
        const assigned =
          t.assignedWorkers.unskilled +
          t.assignedWorkers.skilled +
          t.assignedWorkers.educated;
        if (assigned > 0) {
          utilityActiveStations += 1;
        }
      }

      if (t.type === 'pub_admin') {
        const req =
          t.requiredWorkers.unskilled +
          t.requiredWorkers.skilled +
          t.requiredWorkers.educated;
        const assigned =
          t.assignedWorkers.unskilled +
          t.assignedWorkers.skilled +
          t.assignedWorkers.educated;
        if (req > 0 && assigned >= req) {
          hasActivePublicAdmin = true;
        }
      }
    }
  }

  const utilityCapacityPop = utilityActiveStations * 250;
  const utilityCapacityBuildings = utilityActiveStations * 20;

  let utilityLoadPercent = 0;
  let isUtilityOverloaded = false;

  if (utilityDemandPop === 0 && utilityDemandBuildings === 0) {
    utilityLoadPercent = 0;
    isUtilityOverloaded = false;
  } else if (utilityActiveStations === 0) {
    const rawUnpoweredLoad = Math.round(
      Math.max(
        (utilityDemandPop / 250) * 100,
        (utilityDemandBuildings / 20) * 100
      ) + 100
    );
    utilityLoadPercent = Math.max(105, rawUnpoweredLoad);
    isUtilityOverloaded = true;
  } else {
    const popLoad = (utilityDemandPop / utilityCapacityPop) * 100;
    const bldgLoad = (utilityDemandBuildings / utilityCapacityBuildings) * 100;
    utilityLoadPercent = Math.round(Math.max(popLoad, bldgLoad));
    isUtilityOverloaded =
      utilityLoadPercent > 100 ||
      utilityDemandPop > utilityCapacityPop ||
      utilityDemandBuildings > utilityCapacityBuildings;
    if (isUtilityOverloaded && utilityLoadPercent <= 100) {
      utilityLoadPercent = 101;
    }
  }

  const utilityOverloadOutputMultiplier = isUtilityOverloaded ? 0.65 : 1.0;
  const taxCollectionEfficiencyPercent = hasActivePublicAdmin ? 100 : 88;
  const taxCollectionMultiplier = hasActivePublicAdmin ? 1.0 : 0.88;

  return {
    utilityActiveStations,
    utilityCapacityPop,
    utilityCapacityBuildings,
    utilityDemandPop,
    utilityDemandBuildings,
    utilityLoadPercent,
    isUtilityOverloaded,
    utilityOverloadOutputMultiplier,
    hasActivePublicAdmin,
    taxCollectionEfficiencyPercent,
    taxCollectionMultiplier,
  };
}

export interface TileEconomicsResult {
  built: boolean;
  isComplete: boolean;
  connectedToRoad: boolean;
  reqWorkersTotal: number;
  assignedWorkersTotal: number;
  staffingRatio: number;
  supplyFactor: number;
  localSupplyIndex: number;
  roadBonus: number;
  citRate: number;
  fdiPciFactor: number;
  concertMultiplier: number;
  privateSuitabilityMultiplier: number;
  privateSuitabilityPercent: number;
  extraMultiplier: number;
  utilityOverloadOutputMultiplier: number;
  taxCollectionMultiplier: number;
  grossOutputBillion: number;
  citRevenueBillion: number;
  pitRevenueBillion: number;
  maintenanceCostBillion: number;
  netIncomeBillion: number;
}

/**
 * Hàm tính toán kinh tế ô đất dùng chung duy nhất (Single Source of Truth)
 * cho cả 3 nơi:
 * 1. Báo cáo chi tiết ô (`getTileDetailedReport`)
 * 2. HUD tổng hợp (`calculateMacroEconomy`)
 * 3. Quyết toán cuối tháng (`runEndOfMonthSettlement`)
 */
export function computeTileEconomics(
  grid: TileData[][],
  tile: TileData,
  policies: MacroPolicies,
  pci: number,
  supplyChainIndex: number,
  laborSupply: LaborTierCounts,
  activeConcertMonths = 0,
  difficulty: DifficultyLevel = 'hard'
): TileEconomicsResult {
  const built = isBuiltStructure(tile.type);
  const isComplete = tile.constructionRemainingDays === 0;
  const connectedToRoad = hasNeighborOfType(grid, tile.x, tile.z, [
    'road_alley',
    'road_urban',
    'road_ring',
    'road_highway',
  ]);
  const spec = BUILDING_SPECS[tile.type] ?? BUILDING_SPECS.empty_land;
  const infraStatus = evaluatePublicInfraAndAdminStatus(grid);

  const reqWorkersTotal =
    tile.requiredWorkers.unskilled +
    tile.requiredWorkers.skilled +
    tile.requiredWorkers.educated;
  const assignedWorkersTotal =
    tile.assignedWorkers.unskilled +
    tile.assignedWorkers.skilled +
    tile.assignedWorkers.educated;

  const staffingRatio =
    reqWorkersTotal > 0
      ? assignedWorkersTotal / reqWorkersTotal
      : isComplete
      ? 1
      : 0;

  const localSupplyIndex = isEconomicCitModule(tile.type)
    ? calculateLocalSupplyIndex(grid, tile.x, tile.z, tile.type)
    : 100;
  tile.localSupplyIndex = localSupplyIndex;

  const supplyFactor = tile.isFlooded ? 0.25 : supplyChainIndex / 100;
  const roadBonus = connectedToRoad ? 1.15 : 0.75;

  const brainDrainActive = policies.pitEducated > 25;
  const brainDrainFactor = brainDrainActive
    ? Math.max(0.4, 1 - (policies.pitEducated - 25) * 0.05)
    : 1.0;

  const privateSuitability = calculatePrivateServiceIncomeSuitability(
    tile.type,
    laborSupply.unskilled,
    laborSupply.skilled,
    laborSupply.educated
  );

  const fdiPciFactor =
    tile.type === 'ind_fdi'
      ? (0.6 + (pci / 100) * 0.85) * (brainDrainActive ? 0.65 : 1.0)
      : 1.0;

  const concertMultiplier =
    tile.type === 'showbiz_stadium' && activeConcertMonths > 0 ? 2.5 : 1.0;

  // Quá tải Điện/Nước (utilityLoadPercent > 100%): giảm 35% sản lượng của các công trình kinh tế/thương mại (agr_farm, ind_*, com_*)
  const isEconomicOrCommercialTile =
    tile.type === 'agr_farm' ||
    tile.type === 'ind_food' ||
    tile.type === 'ind_factory' ||
    tile.type === 'ind_fdi' ||
    tile.type === 'com_street' ||
    tile.type === 'com_market' ||
    tile.type === 'com_mall' ||
    tile.type === 'com_office';
  const utilityOverloadOutputMultiplier = isEconomicOrCommercialTile
    ? infraStatus.utilityOverloadOutputMultiplier
    : 1.0;
  const taxCollectionMultiplier = infraStatus.taxCollectionMultiplier;

  let citRate = 0;
  let extraMultiplier = 1.0;

  if (tile.type === 'agr_farm') {
    citRate = policies.citAgri;
  } else if (tile.type === 'ind_food') {
    citRate = policies.citIndustry;
    // Nhận bonus sản lượng +25% từ agr_farm trong bán kính 5 ô (không cộng dồn)
    const hasAgriBonus = hasActiveAgriFarmInRadius(grid, tile.x, tile.z, 5);
    extraMultiplier =
      (hasAgriBonus ? 1.25 : 0.9) * (0.85 + (localSupplyIndex / 100) * 0.15);
  } else if (tile.type === 'ind_factory') {
    citRate = policies.citIndustry;
  } else if (
    tile.type === 'com_market' ||
    tile.type === 'com_street' ||
    tile.type === 'com_mall'
  ) {
    citRate = policies.citMarket;
  } else if (tile.type === 'com_office') {
    citRate = policies.citMarket;
    // Văn phòng Tài chính sinh CIT/PIT lớn khi PCI >= 65
    const officePciFactor =
      pci >= 65 ? 1.25 + (pci - 65) * 0.015 : 0.65;
    extraMultiplier =
      officePciFactor *
      (brainDrainActive ? 0.7 : 1.0) *
      (0.85 + (localSupplyIndex / 100) * 0.15);
  } else if (tile.type === 'priv_hospital' || tile.type === 'priv_school') {
    citRate = policies.citMarket;
    extraMultiplier = privateSuitability.multiplier;
  } else if (tile.type === 'ind_fdi') {
    citRate = policies.citFdi;
    extraMultiplier = fdiPciFactor;
  } else if (tile.type === 'showbiz_stadium') {
    citRate = policies.citShowbiz;
    extraMultiplier = concertMultiplier;
  }

  let grossOutputBillion = 0;
  let citRevenueBillion = 0;

  if (built && isComplete && spec.baseGrossOutputBillion > 0) {
    grossOutputBillion = Number(
      (
        spec.baseGrossOutputBillion *
        staffingRatio *
        supplyFactor *
        roadBonus *
        extraMultiplier *
        utilityOverloadOutputMultiplier
      ).toFixed(3)
    );
    citRevenueBillion = Number(
      (((grossOutputBillion * citRate) / 100) * taxCollectionMultiplier).toFixed(3)
    );
  }

  let pitRevenueBillion = 0;
  if (built && isComplete && isResidentialTile(tile.type)) {
    const effEdu = Math.round(tile.occupantsByTier.educated * brainDrainFactor);
    pitRevenueBillion = Number(
      (
        (tile.occupantsByTier.unskilled * 0.012 * (policies.pitLow / 100) +
          tile.occupantsByTier.skilled * 0.028 * (policies.pitMid / 100) +
          effEdu * 0.065 * (policies.pitEducated / 100)) *
        taxCollectionMultiplier
      ).toFixed(3)
    );
  } else if (built && isComplete && tile.type === 'com_office') {
    // Văn phòng Tài chính tạo thêm nguồn thu PIT chuyên gia tài chính cao cấp khi PCI >= 65
    const officePitBoost = pci >= 65 ? 1.35 : 0.75;
    pitRevenueBillion = Number(
      (
        (tile.assignedWorkers.skilled * 0.035 * (policies.pitMid / 100) +
          tile.assignedWorkers.educated * 0.085 * (policies.pitEducated / 100)) *
        officePitBoost *
        taxCollectionMultiplier
      ).toFixed(3)
    );
  }

  const diffUpkeepMult = getDifficultySpec(difficulty).upkeepMultiplier;
  const standaloneDrainUpkeep = !built && tile.hasDrainage ? 0.002 : 0;
  const maintenanceCostBillion = Number(
    (
      ((built && isComplete ? spec.maintenanceBillion : 0) +
        standaloneDrainUpkeep) *
      diffUpkeepMult
    ).toFixed(4)
  );

  const netIncomeBillion = Number(
    (citRevenueBillion + pitRevenueBillion - maintenanceCostBillion).toFixed(4)
  );

  return {
    built,
    isComplete,
    connectedToRoad,
    reqWorkersTotal,
    assignedWorkersTotal,
    staffingRatio,
    supplyFactor,
    localSupplyIndex,
    roadBonus,
    citRate,
    fdiPciFactor,
    concertMultiplier,
    privateSuitabilityMultiplier: privateSuitability.multiplier,
    privateSuitabilityPercent: privateSuitability.suitabilityPercent,
    extraMultiplier,
    utilityOverloadOutputMultiplier,
    taxCollectionMultiplier,
    grossOutputBillion,
    citRevenueBillion,
    pitRevenueBillion,
    maintenanceCostBillion,
    netIncomeBillion,
  };
}

export function getTileDetailedReport(
  grid: TileData[][],
  tile: TileData,
  policies: MacroPolicies,
  metrics: MacroMetrics,
  currentMonth = 1,
  currentYear = 2026,
  activeConcertMonths = 0,
  difficulty: DifficultyLevel = 'hard'
): TileDetailedReport {
  const title = TILE_LABELS[tile.type];
  const isUnderConstruction = tile.constructionRemainingDays > 0;
  const spec = BUILDING_SPECS[tile.type] ?? BUILDING_SPECS.empty_land;

  const econ = computeTileEconomics(
    grid,
    tile,
    policies,
    metrics.pci,
    metrics.supplyChainIndex,
    {
      unskilled: metrics.labor.unskilled,
      skilled: metrics.labor.skilled,
      educated: metrics.labor.educated,
    },
    activeConcertMonths,
    difficulty
  );

  const reqTotal = econ.reqWorkersTotal;
  const assignedTotal = econ.assignedWorkersTotal;
  const staffingRatio = econ.staffingRatio;
  const connectedToRoad = econ.connectedToRoad;
  const supplyFactor = econ.supplyFactor;
  const roadBonus = econ.roadBonus;

  let missingWorkersWarning: string | null = null;
  if (isUnderConstruction) {
    missingWorkersWarning = `Đang thi công xây dựng: Còn ${tile.constructionRemainingDays}/${tile.constructionTotalDays} ngày để hoàn thiện.`;
  } else if (reqTotal > 0 && assignedTotal < reqTotal) {
    const missingEdu =
      tile.requiredWorkers.educated - tile.assignedWorkers.educated;
    const missingSkilled =
      tile.requiredWorkers.skilled - tile.assignedWorkers.skilled;
    const missingUnskilled =
      tile.requiredWorkers.unskilled - tile.assignedWorkers.unskilled;

    if (
      (tile.type === 'pub_edu_med' ||
        tile.type === 'pub_hospital' ||
        tile.type === 'priv_hospital') &&
      missingEdu > 0
    ) {
      missingWorkersWarning = `Thiếu ${missingEdu} Bác sĩ chuyên khoa có bằng cấp! Hãy xây Chung Cư Cao Cấp hoặc Chung Cư Mini để thu hút đội ngũ y bác sĩ.`;
    } else if (
      (tile.type === 'pub_school' || tile.type === 'priv_school') &&
      missingEdu > 0
    ) {
      missingWorkersWarning = `Thiếu ${missingEdu} Giáo viên / Giảng viên có bằng cấp! Hãy xây Chung Cư Cao Cấp hoặc Chung Cư Mini để thu hút nhân lực sư phạm.`;
    } else if (missingEdu > 0) {
      missingWorkersWarning = `Thiếu ${missingEdu} Kỹ sư / Chuyên gia có bằng cấp (Cần xây Chung Cư Cao Cấp).`;
    } else if (missingSkilled > 0) {
      missingWorkersWarning = `Thiếu ${missingSkilled} Lao động trung cấp (Cần xây Chung Cư Mini / Cao Cấp).`;
    } else if (missingUnskilled > 0) {
      missingWorkersWarning = `Thiếu ${missingUnskilled} Lao động phổ thông (Cần xây Khu Nhà Ống Hẻm Nhỏ).`;
    }
  }

  let categoryLabel = 'Địa hình tự nhiên';
  let unskilledCount = 0;
  let skilledCount = 0;
  let educatedCount = 0;
  let dominantLaborLabel = 'Chưa có người ở / làm việc';
  let corporateTaxKey: keyof MacroPolicies | null = null;
  let corporateTaxLabel = 'Không áp thuế TNDN';
  let corporateTaxRate = econ.citRate;

  if (isResidentialTile(tile.type)) {
    unskilledCount = tile.occupantsByTier.unskilled;
    skilledCount = tile.occupantsByTier.skilled;
    educatedCount = tile.occupantsByTier.educated;

    if (tile.type === 'res_low') {
      categoryLabel = 'Nhà Phố / Nhà Ống (Sức chứa 4-8 người)';
      dominantLaborLabel =
        'Phân tầng Thấp: Cho phép Lao động phổ thông & Tiểu thương sinh sống';
    } else if (tile.type === 'res_mid') {
      categoryLabel = 'Chung Cư Mini / Thấp Tầng (30-50 hộ)';
      dominantLaborLabel =
        'Phân tầng Trung cấp: Kỹ thuật viên, nhân viên dịch vụ & gia đình trẻ';
    } else {
      categoryLabel = 'Chung Cư Cao Cấp (Phân tầng Thu nhập Cao)';
      dominantLaborLabel =
        'Cấm Lao động phổ thông (0 người) · Chỉ Lao động trung cấp & Có bằng cấp sinh sống';
    }
  } else if (isWorkplaceTile(tile.type)) {
    unskilledCount = tile.assignedWorkers.unskilled;
    skilledCount = tile.assignedWorkers.skilled;
    educatedCount = tile.assignedWorkers.educated;

    switch (tile.type) {
      case 'com_market':
      case 'com_street':
        categoryLabel = 'Thương Mại & Tiểu Thương Bản Địa';
        dominantLaborLabel = 'Cần Lao động phổ thông & tiểu thương sạp chợ';
        corporateTaxKey = 'citMarket';
        corporateTaxLabel = 'Thuế TNDN Chợ & Bán lẻ';
        corporateTaxRate = policies.citMarket;
        break;
      case 'com_mall':
        categoryLabel = 'Thương Mại Dịch Vụ Hiện Đại';
        dominantLaborLabel = 'Cần Nhân viên dịch vụ trung cấp & Quản lý bán lẻ';
        corporateTaxKey = 'citMarket';
        corporateTaxLabel = 'Thuế TNDN Thương mại & Siêu thị';
        corporateTaxRate = policies.citMarket;
        break;
      case 'com_office':
        categoryLabel = 'Văn Phòng Tài Chính & Ngân Hàng';
        dominantLaborLabel =
          'Cần Chuyên gia tài chính có bằng cấp · Đột phá CIT/PIT khi PCI ≥ 65';
        corporateTaxKey = 'citMarket';
        corporateTaxLabel = 'Thuế TNDN Dịch vụ Tài chính (CIT)';
        corporateTaxRate = policies.citMarket;
        break;
      case 'agr_farm':
        categoryLabel = 'Nông Lâm & Thủy Hải Sản (Nuôi 180 dân/trại)';
        dominantLaborLabel = 'Cần Nông dân & Lao động phổ thông';
        corporateTaxKey = 'citAgri';
        corporateTaxLabel = 'Thuế TNDN Nông lâm thủy sản';
        corporateTaxRate = policies.citAgri;
        break;
      case 'ind_food':
        categoryLabel = 'Xưởng Chế Biến Thực Phẩm Sạch';
        dominantLaborLabel =
          'Cần Công nhân chế biến · +25% sản lượng khi gần Nông Trại [9]';
        corporateTaxKey = 'citIndustry';
        corporateTaxLabel = 'Thuế TNDN Chế biến thực phẩm';
        corporateTaxRate = policies.citIndustry;
        break;
      case 'ind_factory':
        categoryLabel = 'Công Nghiệp Sản Xuất Nặng (Ô nhiễm bán kính 2 ô)';
        dominantLaborLabel = 'Cần Công nhân nhà máy & Kỹ thuật viên trung cấp';
        corporateTaxKey = 'citIndustry';
        corporateTaxLabel = 'Thuế TNDN Công nghiệp sản xuất';
        corporateTaxRate = policies.citIndustry;
        break;
      case 'ind_fdi':
        categoryLabel = 'Tổ Hợp Công Nghệ Cao FDI';
        dominantLaborLabel = 'Cần Kỹ sư bán dẫn có bằng cấp & Kỹ thuật viên';
        corporateTaxKey = 'citFdi';
        corporateTaxLabel = 'Thuế TNDN FDI Công nghệ cao (Trọng số 30% PCI)';
        corporateTaxRate = policies.citFdi;
        break;
      case 'showbiz_stadium':
        categoryLabel = 'Ngành Giải Trí & Sự Kiện Showbiz';
        dominantLaborLabel = 'Cần Nhân sự Showbiz, truyền thông & nghệ sĩ';
        corporateTaxKey = 'citShowbiz';
        corporateTaxLabel = 'Thuế Sự kiện & Doanh nghiệp Giải trí';
        corporateTaxRate = policies.citShowbiz;
        break;
      case 'pub_edu_med':
        categoryLabel = 'Y Tế & Giáo Dục Công Lập';
        dominantLaborLabel =
          'Yêu cầu Bác sĩ, Giảng viên có bằng cấp, Điều dưỡng & Lao công';
        break;
      case 'pub_hospital':
        categoryLabel = 'Nhóm Y Tế · Khối Công Lập (Ngân sách nhà nước bù lỗ)';
        dominantLaborLabel =
          'Yêu cầu Bác sĩ công lập, Điều dưỡng & Hộ lý · Tối đa hóa An sinh xã hội';
        break;
      case 'priv_hospital':
        categoryLabel = 'Nhóm Y Tế · Khối Tư Nhân (Doanh nghiệp Y tế Tự chủ)';
        dominantLaborLabel =
          'Thu viện phí thương mại & đóng thuế CIT · Đòi hỏi cư dân có thu nhập tương xứng';
        corporateTaxKey = 'citMarket';
        corporateTaxLabel = 'Thuế TNDN Dịch vụ Y tế Tư nhân (CIT)';
        corporateTaxRate = policies.citMarket;
        break;
      case 'pub_school':
        categoryLabel = 'Nhóm Giáo Dục · Khối Công Lập (Ngân sách vận hành)';
        dominantLaborLabel =
          'Yêu cầu Giáo viên biên chế & Nhân viên trường học · Tăng mạnh Hạnh phúc';
        break;
      case 'priv_school':
        categoryLabel = 'Nhóm Giáo Dục · Khối Tư Nhân (Trường Quốc tế / Tư thục)';
        dominantLaborLabel =
          'Học phí cao, tự chủ tài chính & đóng thuế CIT · Đòi hỏi cư dân thu nhập cao';
        corporateTaxKey = 'citMarket';
        corporateTaxLabel = 'Thuế TNDN Giáo dục Tư thục / Quốc tế (CIT)';
        corporateTaxRate = policies.citMarket;
        break;
      default:
        categoryLabel = 'Hạ Tầng Công Cộng & An Sinh';
        dominantLaborLabel = 'Cán bộ hành chính, kỹ sư điện nước & chiến sĩ PCCC';
        break;
    }
  } else if (isRoadTile(tile.type)) {
    const junctionType = getLocalRoadJunctionType(grid, tile.x, tile.z);
    categoryLabel =
      tile.type === 'road_ring'
        ? 'Hạ Tầng Đại Lộ Vành Đai (Không đấu nối Đường Hẻm)'
        : 'Hạ Tầng Giao Thông Đường Bộ';
    dominantLaborLabel = `Kết nối tự động: ${
      junctionType === 'crossroad'
        ? 'Ngã Tư (Cross-Intersection)'
        : junctionType === 't_junction'
        ? 'Ngã Ba Chữ T (T-Junction)'
        : junctionType === 'corner'
        ? 'Góc Cua Chữ L'
        : 'Đoạn Đường Thẳng'
    }`;
  }

  const totalStaffOrPop = unskilledCount + skilledCount + educatedCount;
  const sectorOwnership: 'public' | 'private' | undefined =
    isPublicServiceModule(tile.type)
      ? 'public'
      : isPrivateServiceModule(tile.type)
      ? 'private'
      : undefined;

  const infraStatus = evaluatePublicInfraAndAdminStatus(grid);
  const isPublicUtilityOrService =
    tile.type === 'util_power_water' ||
    tile.type === 'pub_admin' ||
    tile.type === 'pub_hospital' ||
    tile.type === 'pub_school' ||
    tile.type === 'pub_security' ||
    tile.type === 'pub_edu_med';

  let publicServiceBadgeLabel: string | undefined;
  let publicServiceSummaryLabel: string | undefined;
  let publicServiceDetailLabel: string | undefined;

  if (tile.type === 'util_power_water') {
    publicServiceBadgeLabel = `Tải ${infraStatus.utilityLoadPercent}%`;
    publicServiceSummaryLabel = `Phục vụ: ${infraStatus.utilityDemandBuildings}/${infraStatus.utilityCapacityBuildings} công trình · Tải ${infraStatus.utilityLoadPercent}%`;
    publicServiceDetailLabel = `Công suất dân cư: ${infraStatus.utilityDemandPop}/${infraStatus.utilityCapacityPop} dân (${infraStatus.utilityActiveStations} trạm vận hành)`;
    if (!missingWorkersWarning && !isUnderConstruction && infraStatus.isUtilityOverloaded) {
      missingWorkersWarning = `Cảnh báo Quá tải Điện/Nước (${infraStatus.utilityLoadPercent}%): Đang giảm 35% sản lượng Nông nghiệp/Công nghiệp/Thương mại và -8 Hạnh phúc. Hãy xây thêm Nhà Máy Điện/Nước!`;
    }
  } else if (tile.type === 'pub_admin') {
    publicServiceBadgeLabel = infraStatus.hasActivePublicAdmin
      ? 'Thu thuế 100%'
      : 'Thu thuế 88%';
    publicServiceSummaryLabel = infraStatus.hasActivePublicAdmin
      ? 'Hiệu lực thu thuế: 100% (Chống thất thoát)'
      : 'Hiệu lực thu thuế: 88% (Thất thoát hành chính 12%)';
    publicServiceDetailLabel = infraStatus.hasActivePublicAdmin
      ? 'Đủ nhân sự vận hành · Xóa bỏ 12% thất thoát thuế CIT & PIT toàn đô thị'
      : 'Chưa đủ nhân sự vận hành · Ngân sách đang chịu 12% thất thoát hành chính trên tổng CIT/PIT';
  } else if (
    tile.type === 'pub_hospital' ||
    tile.type === 'pub_school' ||
    tile.type === 'pub_security' ||
    tile.type === 'pub_edu_med'
  ) {
    const serviceCapPct = isUnderConstruction
      ? 0
      : Math.min(100, Math.round(staffingRatio * (connectedToRoad ? 100 : 65)));
    publicServiceBadgeLabel = `Phục vụ ${serviceCapPct}%`;
    publicServiceSummaryLabel = `Công suất phục vụ: ${serviceCapPct}% · Nhân sự ${assignedTotal}/${reqTotal}`;
    publicServiceDetailLabel =
      tile.type === 'pub_security'
        ? 'Bảo đảm an ninh trật tự & tiếp cận PCCC khu vực'
        : 'Cung cấp dịch vụ công ích thiết yếu cho cư dân đô thị';
  }

  if (
    !missingWorkersWarning &&
    !isUnderConstruction &&
    isPrivateServiceModule(tile.type) &&
    econ.privateSuitabilityPercent < 65
  ) {
    missingWorkersWarning = `Cảnh báo Sức mua: Thu nhập bình quân cư dân hiện tại mới đáp ứng ${econ.privateSuitabilityPercent}% mức viện phí/học phí của ${TILE_LABELS[tile.type]}. Hãy quy hoạch thêm Chung Cư Mini [5] hoặc Chung Cư Cao Cấp [6]!`;
  }

  const grossOutputBillion = econ.grossOutputBillion;
  const corporateTaxRevenue = econ.citRevenueBillion;

  const potentialMaxGross =
    spec.baseGrossOutputBillion *
    1.15 *
    econ.extraMultiplier *
    econ.utilityOverloadOutputMultiplier;
  const potentialMaxCitRevenue = Number(
    (
      ((potentialMaxGross * corporateTaxRate) / 100) *
      econ.taxCollectionMultiplier
    ).toFixed(3)
  );

  const economicEfficiencyPercent =
    spec.baseGrossOutputBillion <= 0 || isUnderConstruction
      ? 0
      : Math.min(
          100,
          Math.round(
            staffingRatio *
              supplyFactor *
              (connectedToRoad ? 1.0 : 0.65) *
              econ.utilityOverloadOutputMultiplier *
              100
          )
        );

  const pitTaxRevenue = econ.pitRevenueBillion;
  const maintenanceCost = econ.maintenanceCostBillion;
  const netIncome = econ.netIncomeBillion;
  const netEconomicContribution = econ.netIncomeBillion;

  // Xây dựng bảng chi tiết doanh thu Thuế TNDN (CIT) theo từng tháng (Lịch sử + Dự báo theo mùa)
  const monthlyCitBreakdown: MonthlyCitEntry[] = [];
  if (tile.citHistory && tile.citHistory.length > 0) {
    monthlyCitBreakdown.push(...tile.citHistory.slice(-3));
  }

  const evalStaffRatio = staffingRatio > 0 ? staffingRatio : 1.0;
  const seasonalForecasts: {
    monthLabel: string;
    seasonLabel: string;
    seasonSupply: number;
    staffRatioUsed: number;
  }[] = [
    {
      monthLabel: `T${currentMonth}/${currentYear}`,
      seasonLabel: isUnderConstruction
        ? 'Đang xây'
        : tile.isFlooded
        ? 'Ngập lụt'
        : 'Hiện tại',
      seasonSupply: isUnderConstruction ? 0 : supplyFactor,
      staffRatioUsed: isUnderConstruction ? 0 : staffingRatio,
    },
    {
      monthLabel: 'T+1 (Mùa Khô)',
      seasonLabel: 'Mùa Khô',
      seasonSupply: metrics.supplyChainIndex / 100,
      staffRatioUsed: evalStaffRatio,
    },
    {
      monthLabel: 'T+2 (Mưa Bão)',
      seasonLabel: 'Mùa Mưa Bão',
      seasonSupply:
        !tile.hasDrainage && tile.elevation === 0
          ? 0.25
          : (metrics.supplyChainIndex / 100) * 0.92,
      staffRatioUsed: evalStaffRatio,
    },
    {
      monthLabel: 'T+3 (Triều Cường)',
      seasonLabel: 'Đỉnh Triều Cường',
      seasonSupply:
        !tile.hasDrainage && tile.elevation <= 1
          ? 0.25
          : (metrics.supplyChainIndex / 100) * 0.88,
      staffRatioUsed: evalStaffRatio,
    },
  ];

  for (const fc of seasonalForecasts) {
    const mGross = Number(
      (
        spec.baseGrossOutputBillion *
        fc.staffRatioUsed *
        fc.seasonSupply *
        roadBonus *
        econ.extraMultiplier *
        econ.utilityOverloadOutputMultiplier
      ).toFixed(3)
    );
    const mCit = Number(
      (((mGross * corporateTaxRate) / 100) * econ.taxCollectionMultiplier).toFixed(3)
    );
    const mEff =
      spec.baseGrossOutputBillion <= 0
        ? 0
        : Math.min(
            100,
            Math.round(
              fc.staffRatioUsed *
                fc.seasonSupply *
                (connectedToRoad ? 1.0 : 0.65) *
                econ.utilityOverloadOutputMultiplier *
                100
            )
          );
    monthlyCitBreakdown.push({
      monthLabel: fc.monthLabel,
      seasonLabel: fc.seasonLabel,
      grossOutputBillion: mGross,
      citRate: corporateTaxRate,
      citRevenueBillion: mCit,
      efficiencyPercent: mEff,
      isHistorical: false,
    });
  }

  const instanceId =
    tile.instanceId ??
    (isBuiltStructure(tile.type)
      ? `BLD-${String(tile.z * GRID_SIZE + tile.x + 1).padStart(4, '0')}`
      : `LOT-${tile.x + 1}-${tile.z + 1}`);
  const customName =
    tile.customName ?? `${TILE_LABELS[tile.type]} (${tile.x + 1},${tile.z + 1})`;

  return {
    instanceId,
    customName,
    title,
    categoryLabel,
    connectedToRoad,
    isUnderConstruction,
    constructionRemainingDays: tile.constructionRemainingDays,
    constructionTotalDays: tile.constructionTotalDays,
    maxCapacity: tile.maxCapacity,
    currentOccupants: tile.currentOccupants,
    minimumWealthLevel: tile.minimumWealthLevel,
    requiredWorkersTotal: reqTotal,
    assignedWorkersTotal: assignedTotal,
    requiredWorkers: tile.requiredWorkers,
    assignedWorkers: tile.assignedWorkers,
    staffingRatio,
    missingWorkersWarning,
    totalStaffOrPop,
    unskilledCount,
    skilledCount,
    educatedCount,
    dominantLaborLabel,
    corporateTaxKey,
    corporateTaxLabel,
    corporateTaxRate,
    revenue: grossOutputBillion,
    grossOutputBillion,
    taxCIT: corporateTaxRevenue,
    corporateTaxRevenue,
    potentialMaxCitRevenue,
    economicEfficiencyPercent,
    taxPIT: pitTaxRevenue,
    pitTaxRevenue,
    maintenanceCost,
    netIncome,
    netEconomicContribution,
    monthlyCitBreakdown,
    junctionType: tile.junctionType,
    sectorOwnership,
    residentIncomeSuitabilityPercent: isPrivateServiceModule(tile.type)
      ? econ.privateSuitabilityPercent
      : undefined,
    isPublicUtilityOrService,
    publicServiceBadgeLabel,
    publicServiceSummaryLabel,
    publicServiceDetailLabel,
    localSupplyIndex: econ.localSupplyIndex,
  };
}

export function calculatePCI(
  grid: TileData[][],
  policies: MacroPolicies,
  crisisPciPenalty = 0
): {
  pci: number;
  pciInfraScore: number;
  pciAdminScore: number;
  pciTaxScore: number;
} {
  let urbanRoads = 0;
  let ringRoads = 0;
  let highways = 0;
  let powerWaterCount = 0;
  let adminCount = 0;
  let eduMedCount = 0;
  let drainageCount = 0;
  let builtCount = 0;
  let floodedCount = 0;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x];
      if (isBuiltStructure(t.type) && t.constructionRemainingDays === 0) {
        builtCount++;
        if (t.hasDrainage) drainageCount++;
        if (t.isFlooded) floodedCount++;
        if (t.type === 'road_urban') urbanRoads++;
        if (t.type === 'road_ring') ringRoads++;
        if (t.type === 'road_highway') highways++;
        if (t.type === 'util_power_water') powerWaterCount++;
        if (t.type === 'pub_admin') adminCount++;
        if (
          t.type === 'pub_edu_med' ||
          t.type === 'pub_hospital' ||
          t.type === 'priv_hospital' ||
          t.type === 'pub_school' ||
          t.type === 'priv_school'
        ) {
          eduMedCount++;
        }
      }
    }
  }

  const drainageRatio = builtCount > 0 ? drainageCount / builtCount : 0.6;
  const rawInfra =
    45 +
    Math.min(25, urbanRoads * 1.5 + ringRoads * 2.0 + highways * 2.5) +
    Math.min(20, powerWaterCount * 12) +
    Math.round(drainageRatio * 15) -
    floodedCount * 5;
  const pciInfraScore = Math.max(10, Math.min(100, Math.round(rawInfra)));

  const rawAdmin =
    50 +
    Math.min(35, adminCount * 22) +
    Math.min(15, eduMedCount * 10) -
    (policies.compensationLevel === 'low' ? 12 : 0);
  const pciAdminScore = Math.max(15, Math.min(100, Math.round(rawAdmin)));

  const rawTax = 100 - Math.max(0, policies.citFdi - 5) * 3.2;
  const pciTaxScore = Math.max(10, Math.min(100, Math.round(rawTax)));

  const basePci = Math.round(
    pciInfraScore * 0.4 + pciAdminScore * 0.3 + pciTaxScore * 0.3
  );
  const pci = Math.max(0, Math.min(100, basePci - crisisPciPenalty));

  return {
    pci,
    pciInfraScore,
    pciAdminScore,
    pciTaxScore,
  };
}

export function calculateMacroEconomy(
  grid: TileData[][],
  policies: MacroPolicies,
  season: SeasonType,
  activeConcertMonths: number,
  treasury = STARTING_TREASURY,
  crisisMonthsElapsed = 0,
  difficulty: DifficultyLevel = 'hard'
): MacroMetrics {
  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (isRoadTile(tile.type)) {
        tile.junctionType = getLocalRoadJunctionType(grid, x, z);
      } else {
        tile.junctionType = undefined;
      }
    }
  }

  const jobResult = runJobPathfindingSystem(grid, policies);
  const infraStatus = evaluatePublicInfraAndAdminStatus(grid);

  // Đồng bộ chính sách giao thông mới (Tab [G]) và giữ tương thích ngược
  const transitLevel: TransitLevel =
    policies.transitLevel ?? (policies.subsidizeBusTransit ? 1 : 0);
  const sidewalkPolicy: SidewalkPolicy = !policies.allowSidewalkEconomy
    ? 'ban'
    : policies.sidewalkPolicy ?? 'informal';
  const banTrucksInResidential = Boolean(
    policies.banTrucksInResidential ?? policies.banPeakHeavyTrucks
  );
  const enableTollbooth = Boolean(policies.enableTollbooth);

  let housingCapacity = 0;
  let resLowCount = 0;
  let resMidCount = 0;
  let resHighCount = 0;
  let marketCount = 0;
  let mallCount = 0;
  let officeCount = 0;
  let agriCount = 0;
  let activeAgriCount = 0;
  let foodFactoryCount = 0;
  let factoryCount = 0;
  let fdiCount = 0;
  let adminCount = 0;
  let eduMedCount = 0;
  let securityCount = 0;
  let utilCount = 0;
  let showbizCount = 0;
  let alleyCount = 0;
  let urbanRoadCount = 0;
  let ringRoadCount = 0;
  let highwayCount = 0;
  let sidewalkVendorTiles = 0;
  let builtCount = 0;
  let drainageCount = 0;
  let floodedTileCount = 0;
  let disputeTiles = 0;
  let housesOnlyOnAlley = 0;
  let underConstructionCount = 0;

  const activeFactories: { x: number; z: number }[] = [];
  const completedResidentialTiles: { x: number; z: number }[] = [];

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];

      if (
        tile.constructionRemainingDays > 0 ||
        (tile.drainageRemainingDays && tile.drainageRemainingDays > 0)
      ) {
        underConstructionCount++;
      }

      const nearUrbanRoad = hasNeighborOfType(grid, x, z, ['road_urban']);
      tile.sidewalkVendors =
        sidewalkPolicy !== 'ban' &&
        nearUrbanRoad &&
        tile.constructionRemainingDays === 0 &&
        (tile.type === 'res_low' ||
          tile.type === 'res_mid' ||
          tile.type === 'com_street' ||
          tile.type === 'com_market');

      if (tile.sidewalkVendors) sidewalkVendorTiles++;

      const concreteDensity =
        isBuiltStructure(tile.type) && tile.type !== 'agr_farm';
      if (season === 'high_tide') {
        tile.isFlooded =
          !tile.hasDrainage &&
          concreteDensity &&
          (tile.elevation === 0 || tile.elevation <= 1);
      } else if (season === 'monsoon') {
        tile.isFlooded =
          !tile.hasDrainage && tile.elevation === 0 && concreteDensity;
      } else {
        tile.isFlooded = false;
      }

      if (tile.isFlooded) floodedTileCount++;
      if (tile.disputeTurns > 0) disputeTiles++;

      if (isBuiltStructure(tile.type)) {
        builtCount++;
        if (tile.hasDrainage) drainageCount++;
      }

      if (tile.constructionRemainingDays === 0) {
        if (isResidentialTile(tile.type)) {
          housingCapacity += tile.maxCapacity;
          completedResidentialTiles.push({ x, z });
        }
        switch (tile.type) {
          case 'res_low':
            resLowCount++;
            if (
              !hasNeighborOfType(grid, x, z, [
                'road_urban',
                'road_ring',
                'road_highway',
              ])
            ) {
              housesOnlyOnAlley++;
            }
            break;
          case 'res_mid':
            resMidCount++;
            break;
          case 'res_high':
            resHighCount++;
            break;
          case 'com_market':
            marketCount++;
            break;
          case 'com_mall':
            mallCount++;
            break;
          case 'com_office':
            officeCount++;
            break;
          case 'agr_farm': {
            agriCount++;
            const farmWorkers =
              tile.assignedWorkers.unskilled +
              tile.assignedWorkers.skilled +
              tile.assignedWorkers.educated;
            if (farmWorkers > 0 || !tile.isFlooded) {
              activeAgriCount++;
            }
            break;
          }
          case 'ind_food':
            foodFactoryCount++;
            break;
          case 'ind_factory':
            factoryCount++;
            activeFactories.push({ x, z });
            break;
          case 'ind_fdi':
            fdiCount++;
            break;
          case 'pub_admin':
            adminCount++;
            break;
          case 'pub_edu_med':
            eduMedCount++;
            break;
          case 'pub_hospital':
            eduMedCount += 1.5;
            break;
          case 'priv_hospital':
            eduMedCount += 0.65;
            break;
          case 'pub_school':
            eduMedCount += 1.35;
            break;
          case 'priv_school':
            eduMedCount += 0.55;
            break;
          case 'pub_security':
            securityCount++;
            break;
          case 'util_power_water':
            utilCount++;
            break;
          case 'showbiz_stadium':
            showbizCount++;
            break;
          case 'road_alley':
            alleyCount++;
            break;
          case 'road_urban':
            urbanRoadCount++;
            break;
          case 'road_ring':
            ringRoadCount++;
            break;
          case 'road_highway':
            highwayCount++;
            break;
        }
      }
    }
  }

  // Ô nhiễm công nghiệp nặng (`ind_factory`): giảm -4 Hạnh phúc mỗi ô dân cư trong bán kính 2 ô
  let pollutedResidentialCount = 0;
  if (activeFactories.length > 0 && completedResidentialTiles.length > 0) {
    for (const res of completedResidentialTiles) {
      const nearFactory = activeFactories.some(
        (fac) => Math.abs(fac.x - res.x) <= 2 && Math.abs(fac.z - res.z) <= 2
      );
      if (nearFactory) {
        pollutedResidentialCount++;
      }
    }
  }
  const pollutionPenaltyHappiness = pollutedResidentialCount * 4;

  const brainDrainActive = policies.pitEducated > 25;
  const unskilled = jobResult.totalSupply.unskilled;
  const skilled = jobResult.totalSupply.skilled;
  const educated = jobResult.totalSupply.educated;
  const population = unskilled + skilled + educated;

  // An ninh Lương thực (`agr_farm`): mỗi nông trại nuôi tối đa 180 dân
  const foodCapacityPop = activeAgriCount * 180;
  const foodSupplyPercent =
    population <= 0
      ? 100
      : Math.min(200, Math.round((foodCapacityPop / population) * 100));

  const totalJobSlots =
    jobResult.totalDemand.unskilled +
    jobResult.totalDemand.skilled +
    jobResult.totalDemand.educated;
  const totalEmployed =
    jobResult.totalEmployed.unskilled +
    jobResult.totalEmployed.skilled +
    jobResult.totalEmployed.educated;

  const crisisPciPenalty = Math.max(0, crisisMonthsElapsed * 5);
  const { pci, pciInfraScore, pciAdminScore, pciTaxScore } = calculatePCI(
    grid,
    policies,
    crisisPciPenalty
  );

  const hasMainRoads =
    urbanRoadCount > 0 || ringRoadCount > 0 || highwayCount > 0;
  const transitRelief =
    !hasMainRoads
      ? 0
      : transitLevel === 2
      ? 11.5
      : transitLevel === 1
      ? 5.5
      : 0;

  const roadCapacity =
    urbanRoadCount * 4.5 +
    ringRoadCount * 6.5 +
    highwayCount * 8.5 +
    alleyCount * 1.5;
  const vehicleDemand =
    population / 180 +
    marketCount * 4.5 +
    officeCount * 2.5 +
    (sidewalkPolicy === 'informal'
      ? sidewalkVendorTiles * 1.5
      : sidewalkPolicy === 'licensed'
      ? sidewalkVendorTiles * 0.6
      : 0) +
    (activeConcertMonths > 0 ? showbizCount * 10 : 0) -
    transitRelief -
    (banTrucksInResidential && hasMainRoads ? 3.5 : 0);

  const floodTrafficPenalty = floodedTileCount * 5.0;

  // Đã loại bỏ công thức Math.abs(greenLightMainRatio - 58) * 0.3 theo thiết kế mới
  const rawTrafficSpeed =
    builtCount === 0
      ? 100
      : 84 +
        Math.min(16, roadCapacity - vehicleDemand) -
        floodTrafficPenalty;
  const trafficSpeedIndex = Math.max(
    15,
    Math.min(100, Math.round(rawTrafficSpeed))
  );

  const supplySources =
    agriCount * 25 + foodFactoryCount * 18 + factoryCount * 15 + 35;
  const logisticsPenaltyFromTruckBan =
    banTrucksInResidential && ringRoadCount === 0 && highwayCount === 0 ? 5 : 0;
  const rawSupplyChain =
    builtCount === 0
      ? 100
      : Math.min(
          100,
          55 +
            supplySources * 0.5 +
            (urbanRoadCount + ringRoadCount * 1.6 + highwayCount * 2) * 1.8
        ) *
          (0.5 + (trafficSpeedIndex / 100) * 0.5) -
        floodedTileCount * 5 -
        logisticsPenaltyFromTruckBan;

  const supplyChainIndex = Math.max(
    20,
    Math.min(100, Math.round(rawSupplyChain))
  );

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x];
      t.supplyRatio = t.isFlooded
        ? 0.25
        : Number((supplyChainIndex / 100).toFixed(2));
    }
  }

  const totalRes = resLowCount + resMidCount + resHighCount;
  const emergencyAccessCoverage =
    sidewalkPolicy === 'licensed'
      ? 100
      : totalRes === 0
      ? 100
      : Math.max(
          25,
          Math.min(
            100,
            Math.round(
              ((totalRes - housesOnlyOnAlley * 0.6) / totalRes) * 80 +
                Math.min(20, securityCount * 15)
            )
          )
        );

  const laborSupplyForEcon: LaborTierCounts = {
    unskilled,
    skilled,
    educated,
  };

  let totalCitRevenue = 0;
  let totalResidentPitRevenue = 0;
  let totalMaintenance = 0;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x];
      const built = isBuiltStructure(t.type);
      if (!built && !t.hasDrainage) {
        t.revenue = 0;
        t.taxCIT = 0;
        t.taxPIT = 0;
        t.maintenanceCost = 0;
        t.netIncome = 0;
        continue;
      }

      const econ = computeTileEconomics(
        grid,
        t,
        policies,
        pci,
        supplyChainIndex,
        laborSupplyForEcon,
        activeConcertMonths,
        difficulty
      );

      totalMaintenance += econ.maintenanceCostBillion;
      totalResidentPitRevenue += econ.pitRevenueBillion;
      totalCitRevenue += econ.citRevenueBillion;

      t.revenue = econ.grossOutputBillion;
      t.taxCIT = econ.citRevenueBillion;
      t.taxPIT = econ.pitRevenueBillion;
      t.maintenanceCost = econ.maintenanceCostBillion;
      t.netIncome = econ.netIncomeBillion;
    }
  }

  const rawEmployedPitRevenue =
    jobResult.totalEmployed.unskilled * 0.012 * (policies.pitLow / 100) +
    jobResult.totalEmployed.skilled * 0.028 * (policies.pitMid / 100) +
    jobResult.totalEmployed.educated * 0.065 * (policies.pitEducated / 100);
  const employedPitRevenue = Number(
    (rawEmployedPitRevenue * infraStatus.taxCollectionMultiplier).toFixed(3)
  );
  const pitRevenue = Math.max(totalResidentPitRevenue, employedPitRevenue);

  // Thu phí BOT 30.000 VNĐ/lượt (0.00003 Tỷ/lượt) bù đắp bảo trì đường bộ
  const arterialRoadUnits =
    urbanRoadCount + ringRoadCount * 1.6 + highwayCount * 2.2;
  const monthlyTollTrips =
    enableTollbooth && arterialRoadUnits > 0
      ? Math.round(
          arterialRoadUnits * 280 +
            population * 4.5 +
            (factoryCount + foodFactoryCount + fdiCount) * 650
        )
      : 0;
  const tollboothRevenue = enableTollbooth
    ? Number((monthlyTollTrips * 0.00003).toFixed(3))
    : 0;

  // Thu phí cấp phép vỉa hè ('licensed')
  const sidewalkLicenseRevenue =
    sidewalkPolicy === 'licensed'
      ? Number((sidewalkVendorTiles * 0.035).toFixed(3))
      : 0;

  const monthlyRevenue = Number(
    (
      pitRevenue +
      totalCitRevenue +
      tollboothRevenue +
      sidewalkLicenseRevenue
    ).toFixed(2)
  );

  // Chi phí trợ giá Bus / BRT (0: 0 Tỷ, 1: 0.15 Tỷ/tháng khi có BRT/Bus nâng cấp, 2: 0.40 Tỷ/tháng)
  // Lưu ý: giữ transitUpkeep chỉ tính khi người chơi chọn BRT Nhanh (2) hoặc bật tường minh transitLevel trên mạng lưới có dân cư,
  // hoặc tính chuẩn theo transitLevel:
  const diffUpkeepMult = getDifficultySpec(difficulty).upkeepMultiplier;
  const transitUpkeep =
    builtCount === 0 || population === 0
      ? 0
      : transitLevel === 2
      ? Number((0.4 * diffUpkeepMult).toFixed(2))
      : transitLevel === 1 && policies.transitLevel !== undefined
      ? Number((0.15 * diffUpkeepMult).toFixed(2))
      : 0;

  const welfareCost =
    population === 0
      ? 0
      : Number(
          ((policies.welfareLevel / 100) * (0.15 + population / 1500)).toFixed(2)
        );
  const floodDamageCost = floodedTileCount * 0.35;

  const monthlyExpense =
    builtCount === 0
      ? 0
      : Number(
          (
            totalMaintenance +
            transitUpkeep +
            welfareCost +
            floodDamageCost
          ).toFixed(2)
        );
  const netBalance = Number((monthlyRevenue - monthlyExpense).toFixed(2));

  const compCrimeBonus =
    policies.compensationLevel === 'generous'
      ? -6
      : policies.compensationLevel === 'low'
      ? 6
      : 0;

  const rawCrime =
    builtCount === 0
      ? 5
      : 26 -
        policies.welfareLevel * 0.25 -
        securityCount * 10 +
        disputeTiles * 9 +
        compCrimeBonus +
        (sidewalkPolicy === 'ban' ? 6 : sidewalkPolicy === 'licensed' ? -2 : 0) +
        (policies.pitLow > 15 ? (policies.pitLow - 15) * 1.2 : 0);
  const crimeRisk = Math.max(2, Math.min(100, Math.round(rawCrime)));

  const pitHappinessRelief =
    (10 - policies.pitLow) * 0.8 +
    (12 - policies.pitMid) * 0.6 +
    (18 - policies.pitEducated) * 0.5;
  const compensationHappinessBonus =
    policies.compensationLevel === 'generous'
      ? 10
      : policies.compensationLevel === 'low'
      ? -8
      : 0;

  const sidewalkHappinessBonus =
    sidewalkPolicy === 'licensed'
      ? 6
      : sidewalkPolicy === 'informal'
      ? 5
      : -4;

  // Phạt thiếu lương thực khi có agr_farm nhưng không đủ nuôi dân (foodSupplyPercent < 100%)
  const foodShortagePenalty =
    agriCount > 0 && population > 0 && foodSupplyPercent < 100 ? 6 : 0;

  const rawHappiness =
    builtCount === 0
      ? 85 +
        (policies.welfareLevel - 50) * 0.35 +
        pitHappinessRelief +
        compensationHappinessBonus
      : 70 +
        sidewalkHappinessBonus +
        marketCount * 3 +
        eduMedCount * 6 +
        showbizCount * (activeConcertMonths > 0 ? 9 : 4) +
        (policies.welfareLevel - 40) * 0.35 +
        pitHappinessRelief +
        compensationHappinessBonus -
        floodedTileCount * 5 -
        disputeTiles * 8 -
        jobResult.staffShortageBuildings * 3 -
        (100 - trafficSpeedIndex) * 0.15 -
        (brainDrainActive ? 9 : 0) -
        (infraStatus.isUtilityOverloaded ? 8 : 0) -
        pollutionPenaltyHappiness -
        foodShortagePenalty -
        (enableTollbooth ? 2 : 0);
  const happiness = Math.max(5, Math.min(100, Math.round(rawHappiness)));

  const rawStability =
    builtCount === 0
      ? 90 +
        (policies.welfareLevel - 50) * 0.3 +
        compensationHappinessBonus * 0.8
      : 74 +
        (policies.welfareLevel - 40) * 0.35 +
        compensationHappinessBonus +
        securityCount * 7 +
        (happiness - 50) * 0.35 -
        crimeRisk * 0.3 -
        disputeTiles * 10 -
        floodedTileCount * 3.5 -
        foodShortagePenalty;
  const socialStability = Math.max(0, Math.min(100, Math.round(rawStability)));

  const drainageCoverage =
    builtCount > 0 ? Math.round((drainageCount / builtCount) * 100) : 100;

  const concertEligibility = evaluateConcertEligibility(
    grid,
    population,
    activeConcertMonths
  );

  const canExpandRegion =
    population >= EXPANSION_POP_TARGET && treasury >= EXPANSION_TREASURY_TARGET;

  return {
    population,
    housingCapacity,
    labor: {
      unskilled,
      skilled,
      educated,
      employedUnskilled: jobResult.totalEmployed.unskilled,
      employedSkilled: jobResult.totalEmployed.skilled,
      employedEducated: jobResult.totalEmployed.educated,
      totalJobSlots,
      totalEmployed,
      housingCapacity,
      brainDrainActive,
    },
    pci,
    pciInfraScore,
    pciAdminScore,
    pciTaxScore,
    trafficSpeedIndex,
    supplyChainIndex,
    floodedTileCount,
    drainageCoverage,
    socialStability,
    happiness,
    monthlyRevenue,
    monthlyExpense,
    netBalance,
    crimeRisk,
    emergencyAccessCoverage,
    underConstructionCount,
    staffShortageBuildings: jobResult.staffShortageBuildings,
    canTriggerConcert: concertEligibility.canTriggerConcert,
    concertBlockReason: concertEligibility.concertBlockReason,
    canExpandRegion,
    emigrationRatePercent: Math.max(0, crisisMonthsElapsed * 10),
    utilityActiveStations: infraStatus.utilityActiveStations,
    utilityCapacityPop: infraStatus.utilityCapacityPop,
    utilityCapacityBuildings: infraStatus.utilityCapacityBuildings,
    utilityDemandBuildings: infraStatus.utilityDemandBuildings,
    utilityLoadPercent: infraStatus.utilityLoadPercent,
    isUtilityOverloaded: infraStatus.isUtilityOverloaded,
    hasActivePublicAdmin: infraStatus.hasActivePublicAdmin,
    taxCollectionEfficiencyPercent: infraStatus.taxCollectionEfficiencyPercent,
    foodSupplyPercent,
    foodCapacityPop,
    tollboothRevenue,
    transitUpkeep,
    sidewalkLicenseRevenue,
    pollutionPenaltyHappiness,
    totalRegionalPopulation: population,
    totalRegionalJobs: totalEmployed,
  };
}

export function renameBuildingCustomName(
  state: CityGameState,
  x: number,
  z: number,
  newCustomName: string
): CityGameState {
  const trimmed = newCustomName.trim();
  if (!trimmed) return state;
  if (z < 0 || z >= state.grid.length || x < 0 || x >= state.grid[0].length) {
    return state;
  }
  const nextGrid = state.grid.map((row, rz) =>
    row.map((cell, rx) =>
      rx === x && rz === z ? { ...cell, customName: trimmed } : cell
    )
  );
  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;
  return {
    ...state,
    grid: nextGrid,
    regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
  };
}

export function markSettlementReportRead(state: CityGameState): CityGameState {
  if (!state.hasUnreadSettlement) return state;
  return {
    ...state,
    hasUnreadSettlement: false,
  };
}

/**
 * LÔ-GIC QUYẾT TOÁN CUỐI THÁNG (End-of-Month Settlement Logic — Day == 30)
 */
export function runEndOfMonthSettlement(
  grid: TileData[][],
  policies: MacroPolicies,
  metrics: MacroMetrics,
  month: number,
  year: number,
  season: SeasonType,
  treasuryAfter: number,
  fdiBonus = 0,
  activeConcertMonths = 0,
  difficulty: DifficultyLevel = 'hard'
): LedgerEntry {
  const laborSupplyForEcon: LaborTierCounts = {
    unskilled: metrics.labor.unskilled,
    skilled: metrics.labor.skilled,
    educated: metrics.labor.educated,
  };
  const infraStatus = evaluatePublicInfraAndAdminStatus(grid);

  let totalRevenue = 0;
  let totalTaxCIT = 0;
  let totalTaxPIT = 0;
  let rawBuildingMaint = 0;
  let rawInfraMaint = 0;
  let roadAndDrainageTileCount = 0;
  let activeEntityCount = 0;
  const entityBreakdown: EntityLedgerRecord[] = [];

  let fallbackSeq = 1;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      const built = isBuiltStructure(tile.type);
      if (!built && !tile.hasDrainage) continue;

      if (!tile.instanceId || !tile.customName) {
        const gen = generateDefaultBuildingIdentity(tile.type, fallbackSeq++);
        tile.instanceId = tile.instanceId ?? gen.instanceId;
        tile.customName = tile.customName ?? gen.customName;
      } else {
        fallbackSeq++;
      }

      if (isRoadTile(tile.type) || tile.hasDrainage) {
        roadAndDrainageTileCount++;
      }

      const econ = computeTileEconomics(
        grid,
        tile,
        policies,
        metrics.pci,
        metrics.supplyChainIndex,
        laborSupplyForEcon,
        activeConcertMonths,
        difficulty
      );

      const entityRevenue = econ.grossOutputBillion;
      const entityCit = econ.citRevenueBillion;
      const entityPit = econ.pitRevenueBillion;
      const entityMaint = econ.maintenanceCostBillion;
      const entityNet = econ.netIncomeBillion;

      tile.revenue = entityRevenue;
      tile.taxCIT = entityCit;
      tile.taxPIT = entityPit;
      tile.maintenanceCost = entityMaint;
      tile.netIncome = entityNet;

      totalRevenue += entityRevenue;
      totalTaxCIT += entityCit;
      totalTaxPIT += entityPit;

      if (built && !isRoadTile(tile.type)) {
        rawBuildingMaint += entityMaint;
      } else {
        rawInfraMaint += entityMaint;
      }

      activeEntityCount++;

      const reqWorkers = econ.reqWorkersTotal;
      const assWorkers = econ.assignedWorkersTotal;

      const occupantsOrWorkers = isResidentialTile(tile.type)
        ? `${tile.currentOccupants}/${tile.maxCapacity} dân`
        : reqWorkers > 0
        ? `${assWorkers}/${reqWorkers} nhân sự`
        : isRoadTile(tile.type)
        ? 'Hạ tầng đường'
        : 'Cống thoát nước';

      entityBreakdown.push({
        instanceId: tile.instanceId,
        customName: tile.customName,
        tileType: tile.type,
        x,
        z,
        occupantsOrWorkers,
        revenue: entityRevenue,
        taxCIT: entityCit,
        taxPIT: entityPit,
        maintenanceCost: entityMaint,
        netIncome: entityNet,
      });
    }
  }

  const tollAndSidewalkRev = Number(
    ((metrics.tollboothRevenue ?? 0) + (metrics.sidewalkLicenseRevenue ?? 0)).toFixed(3)
  );
  const transitCost = Number((metrics.transitUpkeep ?? 0).toFixed(3));

  const welfareCost =
    metrics.population === 0
      ? 0
      : Number(
          (
            (policies.welfareLevel / 100) *
            (0.15 + metrics.population / 1500)
          ).toFixed(2)
        );
  const floodDamageCost = Number((metrics.floodedTileCount * 0.35).toFixed(2));
  const welfareAndFloodCost = Number(
    (welfareCost + floodDamageCost).toFixed(2)
  );

  const roundedRev = Number((totalRevenue + tollAndSidewalkRev).toFixed(2));
  const roundedCit = Number((totalTaxCIT + tollAndSidewalkRev).toFixed(2));
  const roundedPit = Number(totalTaxPIT.toFixed(2));
  const buildingMaintenanceCost = Number(rawBuildingMaint.toFixed(3));
  const infraMaintenanceCost = Number((rawInfraMaint + transitCost).toFixed(3));
  const roundedMaint = Number(
    (buildingMaintenanceCost + infraMaintenanceCost).toFixed(3)
  );
  const netIncome = Number(
    (
      roundedCit +
      roundedPit +
      fdiBonus -
      roundedMaint -
      welfareAndFloodCost
    ).toFixed(2)
  );

  const adminTaxNote = infraStatus.hasActivePublicAdmin
    ? 'Hiệu lực thu thuế 100% (UBND chống thất thoát)'
    : 'Thất thoát hành chính 12% (Thiếu UBND vận hành)';

  return {
    id: `SETTLE-Y${year}-M${month}`,
    day: 30,
    month,
    year,
    season,
    entryType: 'monthly_settlement',
    summary: `Quyết toán cuối tháng T${month}/${year} (Ngày 30): Thu CIT +${formatVnd(roundedCit)}, Thu PIT +${formatVnd(roundedPit)} (${adminTaxNote}), Phí duy trì -${formatVnd(roundedMaint + welfareAndFloodCost)} · Ròng ${netIncome >= 0 ? '+' : ''}${formatVnd(netIncome)}`,
    totalRevenue: roundedRev,
    totalTaxCIT: roundedCit,
    totalTaxPIT: roundedPit,
    totalMaintenanceCost: roundedMaint,
    buildingMaintenanceCost,
    infraMaintenanceCost,
    welfareAndFloodCost,
    fdiBonus,
    netIncome,
    treasuryAfter,
    roadAndDrainageTileCount,
    activeEntityCount,
    entityBreakdown,
  };
}
