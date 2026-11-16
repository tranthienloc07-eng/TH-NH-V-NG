import {
  BASE_EMPTY_LAND_PRICE,
  BUILDING_SPECS,
  CITY_LEVEL_SPECS,
  computeCityLevel,
  createDefaultPolicies,
  DEFAULT_DAY_TICK_MS,
  evaluateOnboardingProgress,
  EXPANSION_POP_TARGET,
  EXPANSION_TREASURY_TARGET,
  formatVnd,
  getRegionName,
  hasNeighborOfType,
  isBuiltStructure,
  isResidentialTile,
  isRoadTile,
  isWorkplaceTile,
  MAX_DAY_TICK_MS,
  MIN_DAY_TICK_MS,
  REGION_GRID_SIZE,
  STARTING_TREASURY,
  TILE_LABELS,
} from './constants';
import {
  calculateMacroEconomy,
  evaluateConcertEligibility,
  getTileDetailedReport,
  GlobalLedger,
  runEndOfMonthSettlement,
} from './economy';
import { createInitialGrid } from './gridSnapping';
import {
  AdvisorBriefing,
  AdvisorRecommendation,
  CityGameState,
  GameStateMode,
  MacroPolicies,
  MonthlyCitEntry,
  SeasonType,
  TileData,
} from './types';

/**
 * Thực thi Tổ chức Đại Nhạc Hội Quốc Tế có kiểm tra điều kiện chống hack tiền đầu game
 */
export function triggerShowbizConcert(state: CityGameState): {
  nextState: CityGameState;
  success: boolean;
  revenueAdded: number;
  error?: string;
} {
  const check = evaluateConcertEligibility(
    state.grid,
    state.metrics.population,
    state.activeConcertMonths
  );

  if (!check.canTriggerConcert) {
    return {
      nextState: {
        ...state,
        lastEventBanner: `Không thể tổ chức Concert: ${check.concertBlockReason}`,
      },
      success: false,
      revenueAdded: 0,
      error: check.concertBlockReason ?? 'Chưa đủ điều kiện tổ chức Concert.',
    };
  }

  const baseEventRevenue =
    check.readyStadiumCount * 2.5 +
    Math.min(4.0, state.metrics.population / 250) *
      (state.policies.citShowbiz / 20);
  const revenueAdded = Number(baseEventRevenue.toFixed(2));

  const nextGrid = state.grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      occupantsByTier: { ...cell.occupantsByTier },
      requiredWorkers: { ...cell.requiredWorkers },
      assignedWorkers: { ...cell.assignedWorkers },
    }))
  );
  const nextTreasury = Number((state.treasury + revenueAdded).toFixed(4));
  const nextMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    state.season,
    3,
    nextTreasury,
    state.crisisMonthsElapsed
  );
  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;

  return {
    nextState: {
      ...state,
      activeConcertMonths: 3,
      treasury: nextTreasury,
      grid: nextGrid,
      regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
      metrics: nextMetrics,
      lastEventBanner: `ĐẠI NHẠC HỘI SHOWBIZ QUỐC TẾ: Thu +${formatVnd(revenueAdded, true)} thuế sự kiện từ ${check.readyStadiumCount} Tổ hợp Showbiz (kéo dài 3 tháng)!`,
    },
    success: true,
    revenueAdded,
  };
}

export function runConstructionSystemDay(grid: TileData[][]): {
  newlyCompletedNames: string[];
} {
  const newlyCompletedNames: string[] = [];

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (tile.constructionRemainingDays > 0) {
        tile.constructionRemainingDays = Math.max(
          0,
          tile.constructionRemainingDays - 1
        );
        if (tile.constructionRemainingDays === 0) {
          newlyCompletedNames.push(
            `${TILE_LABELS[tile.type]} (${x + 1},${z + 1})`
          );
        }
      }
      if (tile.drainageRemainingDays && tile.drainageRemainingDays > 0) {
        tile.drainageRemainingDays = Math.max(0, tile.drainageRemainingDays - 1);
        if (tile.drainageRemainingDays === 0) {
          tile.hasDrainage = true;
          tile.isFlooded = false;
          newlyCompletedNames.push(`Cống Thoát Nước (${x + 1},${z + 1})`);
        }
      }
    }
  }

  return { newlyCompletedNames };
}

/**
 * HỆ THỐNG 2: ImmigrationSystem — Sinh dân tự nhiên có điều kiện
 */
export function runImmigrationSystemStep(
  grid: TileData[][],
  policies: MacroPolicies,
  happiness: number
): number {
  let totalNewImmigrants = 0;
  const brainDrainActive = policies.pitEducated > 25;

  let openUnskilledJobs = 0;
  let openSkilledJobs = 0;
  let openEducatedJobs = 0;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x];
      if (isWorkplaceTile(t.type) && t.constructionRemainingDays === 0) {
        openUnskilledJobs += Math.max(
          0,
          t.requiredWorkers.unskilled - t.assignedWorkers.unskilled
        );
        openSkilledJobs += Math.max(
          0,
          t.requiredWorkers.skilled - t.assignedWorkers.skilled
        );
        openEducatedJobs += Math.max(
          0,
          t.requiredWorkers.educated - t.assignedWorkers.educated
        );
      }
    }
  }

  const happinessFactor = Math.max(0.25, happiness / 80);

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (!isResidentialTile(tile.type)) continue;
      if (tile.constructionRemainingDays > 0 || tile.isFlooded) continue;

      const emptySpace = tile.maxCapacity - tile.currentOccupants;
      if (emptySpace <= 0) continue;

      const nearRoad = hasNeighborOfType(grid, x, z, [
        'road_alley',
        'road_urban',
        'road_highway',
      ]);
      if (!nearRoad) continue;

      if (tile.type === 'res_low') {
        const jobBoost = openUnskilledJobs > 0 ? 1 : 0;
        const stepIn = Math.min(
          emptySpace,
          Math.max(1, Math.round((1 + jobBoost) * happinessFactor))
        );
        for (let i = 0; i < stepIn; i++) {
          if ((tile.currentOccupants + i) % 4 === 3) {
            tile.occupantsByTier.skilled += 1;
          } else {
            tile.occupantsByTier.unskilled += 1;
          }
        }
        tile.currentOccupants += stepIn;
        totalNewImmigrants += stepIn;
      } else if (tile.type === 'res_mid') {
        const jobBoost = openSkilledJobs > 0 ? 4 : 0;
        const stepIn = Math.min(
          emptySpace,
          Math.max(4, Math.round((8 + jobBoost) * happinessFactor))
        );
        const addEducated = brainDrainActive
          ? Math.floor(stepIn * 0.12)
          : Math.floor(stepIn * 0.25);
        const addSkilled = Math.floor(stepIn * 0.55);
        const addUnskilled = Math.max(0, stepIn - addEducated - addSkilled);

        tile.occupantsByTier.unskilled += addUnskilled;
        tile.occupantsByTier.skilled += addSkilled;
        tile.occupantsByTier.educated += addEducated;
        tile.currentOccupants += stepIn;
        totalNewImmigrants += stepIn;
      } else if (tile.type === 'res_high') {
        const jobBoost = openEducatedJobs + openSkilledJobs > 0 ? 12 : 0;
        const stepIn = Math.min(
          emptySpace,
          Math.max(15, Math.round((28 + jobBoost) * happinessFactor))
        );
        const educatedRatio = brainDrainActive ? 0.35 : 0.62;
        const addEducated = Math.round(stepIn * educatedRatio);
        const addSkilled = Math.max(0, stepIn - addEducated);

        tile.occupantsByTier.unskilled = 0;
        tile.occupantsByTier.skilled += addSkilled;
        tile.occupantsByTier.educated += addEducated;
        tile.currentOccupants =
          tile.occupantsByTier.skilled + tile.occupantsByTier.educated;
        totalNewImmigrants += stepIn;
      }
    }
  }

  return totalNewImmigrants;
}

/**
 * Hậu quả lan truyền trong Khủng hoảng (Snowball Emigration)
 */
export function runCrisisEmigrationStep(
  grid: TileData[][],
  emigrationRate: number
): number {
  if (emigrationRate <= 0) return 0;
  let totalEmigrated = 0;
  const clampedRate = Math.min(0.9, Math.max(0, emigrationRate));

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      if (!isResidentialTile(tile.type) || tile.currentOccupants <= 0) continue;

      const leaveCount = Math.min(
        tile.currentOccupants,
        Math.max(1, Math.round(tile.currentOccupants * clampedRate))
      );

      let remToLeave = leaveCount;
      const leaveEdu = Math.min(
        tile.occupantsByTier.educated,
        Math.round(
          leaveCount * (tile.occupantsByTier.educated / tile.currentOccupants)
        )
      );
      tile.occupantsByTier.educated -= leaveEdu;
      remToLeave -= leaveEdu;

      const leaveSkilled = Math.min(
        tile.occupantsByTier.skilled,
        Math.min(
          remToLeave,
          Math.ceil(
            leaveCount * (tile.occupantsByTier.skilled / tile.currentOccupants)
          )
        )
      );
      tile.occupantsByTier.skilled -= leaveSkilled;
      remToLeave -= leaveSkilled;

      const leaveUnskilled = Math.min(
        tile.occupantsByTier.unskilled,
        remToLeave
      );
      tile.occupantsByTier.unskilled -= leaveUnskilled;
      remToLeave -= leaveUnskilled;

      while (
        remToLeave > 0 &&
        tile.occupantsByTier.educated +
          tile.occupantsByTier.skilled +
          tile.occupantsByTier.unskilled >
          0
      ) {
        if (tile.occupantsByTier.educated > 0) {
          tile.occupantsByTier.educated--;
          remToLeave--;
        } else if (tile.occupantsByTier.skilled > 0) {
          tile.occupantsByTier.skilled--;
          remToLeave--;
        } else if (tile.occupantsByTier.unskilled > 0) {
          tile.occupantsByTier.unskilled--;
          remToLeave--;
        }
      }

      const newTotal =
        tile.occupantsByTier.unskilled +
        tile.occupantsByTier.skilled +
        tile.occupantsByTier.educated;
      totalEmigrated += tile.currentOccupants - newTotal;
      tile.currentOccupants = newTotal;
    }
  }

  return totalEmigrated;
}

export function createInitialGameState(startPlaying = false): CityGameState {
  const startKey = '4,4';
  const grid = createInitialGrid(0);
  const policies = createDefaultPolicies();
  const season: SeasonType = 'dry';
  const startingTreasury = STARTING_TREASURY;
  const metrics = calculateMacroEconomy(
    grid,
    policies,
    season,
    0,
    startingTreasury,
    0
  );

  GlobalLedger.length = 0;

  return {
    mode: startPlaying ? 'playing' : 'title',
    day: 1,
    month: 1,
    year: 2026,
    treasury: startingTreasury,
    bestPci: metrics.pci,
    season,
    activeConcertMonths: 0,
    selectedTool: 'road_urban',
    selectedTile: null,
    activeRegion: { rx: 4, rz: 4 },
    unlockedRegions: [startKey],
    regionGrids: { [startKey]: grid },
    grid,
    policies,
    metrics,
    lastEventBanner:
      'Ngân sách khởi điểm 50 Tỷ VNĐ! Hãy xây Đường [1-3] trước, sau đó phân lô Nhà ở & Công trình sát đường để cư dân di cư vào thành phố.',
    snapshot: null,
    isCrisis: false,
    crisisTimer: 0,
    crisisMonthsElapsed: 0,
    consecutiveNegativeBudgetMonths: 0,
    lastEmigratedCount: 0,
    nextInstanceSeq: 1,
    globalLedger: [],
    latestSettlementReport: null,
    hasUnreadSettlement: false,
    dayTickIntervalMs: DEFAULT_DAY_TICK_MS,
    cityLevel: 1,
    onboardingStep: 1,
    onboardingCompleted: false,
    completedQuests: [],
    lastSavedAt: null,
  };
}

export const AUTOSAVE_STORAGE_KEY = 'thinh_vuong_city_autosave_v1';

export function formatAutoSaveTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )} · ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function saveGameStateToLocalStorage(
  state: CityGameState
): string | null {
  const savedAt = formatAutoSaveTimestamp();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const payload: CityGameState = {
        ...state,
        lastSavedAt: savedAt,
      };
      window.localStorage.setItem(
        AUTOSAVE_STORAGE_KEY,
        JSON.stringify(payload)
      );
    }
  } catch {
    // Ignore storage quota or private mode errors silently
  }
  return savedAt;
}

export function loadGameStateFromLocalStorage(): CityGameState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CityGameState>;
    if (
      !parsed ||
      !Array.isArray(parsed.grid) ||
      typeof parsed.treasury !== 'number' ||
      !parsed.policies ||
      !parsed.metrics
    ) {
      return null;
    }
    const base = createInitialGameState(true);
    return {
      ...base,
      ...parsed,
      cityLevel: parsed.cityLevel ?? 1,
      onboardingStep: parsed.onboardingStep ?? 1,
      onboardingCompleted: parsed.onboardingCompleted ?? false,
      completedQuests: Array.isArray(parsed.completedQuests)
        ? parsed.completedQuests
        : [],
      lastSavedAt: parsed.lastSavedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function clearSavedGameState(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors silently
  }
}

export function setDayTickInterval(
  state: CityGameState,
  intervalMs: number
): CityGameState {
  const clamped = Math.max(
    MIN_DAY_TICK_MS,
    Math.min(MAX_DAY_TICK_MS, Math.round(intervalMs))
  );
  return {
    ...state,
    dayTickIntervalMs: clamped,
  };
}

export function selectOrUnlockRegion(
  state: CityGameState,
  rx: number,
  rz: number
): { nextState: CityGameState; unlockedNew: boolean; error?: string } {
  if (rx < 0 || rx >= REGION_GRID_SIZE || rz < 0 || rz >= REGION_GRID_SIZE) {
    return {
      nextState: state,
      unlockedNew: false,
      error: 'Tọa độ vùng ngoài lưới 9x9.',
    };
  }

  const targetKey = `${rx},${rz}`;
  const isAlreadyUnlocked = state.unlockedRegions.includes(targetKey);

  if (!isAlreadyUnlocked) {
    if (
      state.metrics.population < EXPANSION_POP_TARGET ||
      state.treasury < EXPANSION_TREASURY_TARGET
    ) {
      return {
        nextState: state,
        unlockedNew: false,
        error: `Cần đạt tối thiểu ${EXPANSION_POP_TARGET.toLocaleString('vi-VN')} dân (hiện có ${state.metrics.population.toLocaleString('vi-VN')}) và ngân sách dương từ ${EXPANSION_TREASURY_TARGET} Tỷ VNĐ trở lên để mở rộng sang thành phố mới!`,
      };
    }

    const newGrid = createInitialGrid(rx * 11 + rz * 7);
    const nextTreasury = Number(
      (state.treasury - EXPANSION_TREASURY_TARGET).toFixed(4)
    );
    const nextMetrics = calculateMacroEconomy(
      newGrid,
      state.policies,
      state.season,
      state.activeConcertMonths,
      nextTreasury,
      state.crisisMonthsElapsed
    );

    return {
      nextState: {
        ...state,
        treasury: nextTreasury,
        activeRegion: { rx, rz },
        unlockedRegions: [...state.unlockedRegions, targetKey],
        regionGrids: { ...state.regionGrids, [targetKey]: newGrid },
        grid: newGrid,
        selectedTile: null,
        metrics: nextMetrics,
        lastEventBanner: `Đã mở khóa vùng đô thị mới: ${getRegionName(rx, rz)} (-${EXPANSION_TREASURY_TARGET} Tỷ VNĐ)!`,
      },
      unlockedNew: true,
    };
  }

  const existingGrid =
    state.regionGrids[targetKey] ?? createInitialGrid(rx * 11 + rz * 7);
  const nextMetrics = calculateMacroEconomy(
    existingGrid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );

  return {
    nextState: {
      ...state,
      activeRegion: { rx, rz },
      grid: existingGrid,
      selectedTile: null,
      metrics: nextMetrics,
      lastEventBanner: `Đã chuyển sang điều hành vùng: ${getRegionName(rx, rz)}.`,
    },
    unlockedNew: false,
  };
}

export function stepSimulationDay(state: CityGameState): CityGameState {
  if (state.mode !== 'playing') return state;

  const nextGrid = state.grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      occupantsByTier: { ...cell.occupantsByTier },
      requiredWorkers: { ...cell.requiredWorkers },
      assignedWorkers: { ...cell.assignedWorkers },
      citHistory: cell.citHistory ? [...cell.citHistory] : undefined,
    }))
  );

  const { newlyCompletedNames } = runConstructionSystemDay(nextGrid);
  const newImmigrants = state.isCrisis
    ? 0
    : runImmigrationSystemStep(
        nextGrid,
        state.policies,
        state.metrics.happiness
      );

  const nextDay = state.day + 1;
  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;

  if (nextDay > 30) {
    return stepSimulationMonth({
      ...state,
      day: 1,
      grid: nextGrid,
      regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
    });
  }

  const nextMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );

  const prevLevel = state.cityLevel ?? 1;
  const nextCityLevel = computeCityLevel(
    nextMetrics.population,
    state.treasury,
    prevLevel
  );
  const obEval = evaluateOnboardingProgress(
    nextGrid,
    nextMetrics.population,
    nextCityLevel,
    state.completedQuests ?? []
  );

  let banner = state.lastEventBanner;
  if (nextCityLevel > prevLevel) {
    const spec = CITY_LEVEL_SPECS[nextCityLevel];
    banner = `🎉 THĂNG CẤP ĐÔ THỊ LEVEL ${nextCityLevel} — ${spec.title.toUpperCase()}: ${spec.unlockSummary}`;
  } else if (obEval.newlyCompletedQuestTitle) {
    banner = `✅ Hoàn thành nhiệm vụ: ${obEval.newlyCompletedQuestTitle}!`;
  } else if (newlyCompletedNames.length > 0) {
    banner = `Hoàn thiện thi công: ${newlyCompletedNames.slice(0, 2).join(', ')}!`;
  } else if (newImmigrants > 0) {
    banner = `Di cư tự nhiên: +${newImmigrants} người dân mới vừa dọn vào thành phố (Tổng dân số: ${nextMetrics.population.toLocaleString('vi-VN')} / ${nextMetrics.housingCapacity.toLocaleString('vi-VN')} chỗ ở).`;
  }

  const nextState: CityGameState = {
    ...state,
    day: nextDay,
    bestPci: Math.max(state.bestPci, nextMetrics.pci),
    grid: nextGrid,
    regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
    metrics: nextMetrics,
    cityLevel: nextCityLevel,
    onboardingStep: obEval.onboardingStep,
    onboardingCompleted: obEval.onboardingCompleted,
    completedQuests: obEval.completedQuests,
    lastEventBanner: banner,
  };

  const savedAt = saveGameStateToLocalStorage(nextState);
  nextState.lastSavedAt = savedAt;
  return nextState;
}

export function stepSimulationMonth(state: CityGameState): CityGameState {
  if (state.mode !== 'playing') return state;

  const settledMonth = state.month;
  const settledYear = state.year;

  let nextMonth = state.month + 1;
  let nextYear = state.year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const nextSeason: SeasonType =
    nextMonth >= 10 ? 'high_tide' : nextMonth >= 6 ? 'monsoon' : 'dry';

  const nextConcertMonths = Math.max(0, state.activeConcertMonths - 1);

  const nextGrid = state.grid.map((row) =>
    row.map((cell) => {
      const updated: TileData = {
        ...cell,
        occupantsByTier: { ...cell.occupantsByTier },
        requiredWorkers: { ...cell.requiredWorkers },
        assignedWorkers: { ...cell.assignedWorkers },
        citHistory: cell.citHistory ? [...cell.citHistory] : undefined,
      };
      if (updated.constructionRemainingDays > 0) {
        updated.constructionRemainingDays = 0;
      }
      if (updated.drainageRemainingDays && updated.drainageRemainingDays > 0) {
        updated.drainageRemainingDays = 0;
        updated.hasDrainage = true;
        updated.isFlooded = false;
      }
      if (updated.disputeTurns > 0) {
        updated.disputeTurns -= 1;
      }
      if (isBuiltStructure(updated.type) && !updated.isFlooded) {
        const sidewalkDrag = updated.sidewalkVendors ? -0.02 : 0.05;
        updated.landValue = Number(
          Math.max(
            BASE_EMPTY_LAND_PRICE,
            Math.min(200, updated.landValue + sidewalkDrag)
          ).toFixed(3)
        );
      }
      return updated;
    })
  );

  if (!state.isCrisis) {
    for (let i = 0; i < 3; i++) {
      runImmigrationSystemStep(
        nextGrid,
        state.policies,
        state.metrics.happiness
      );
    }
  }

  const preMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    nextSeason,
    nextConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );

  const fdiBonus =
    preMetrics.pci >= 75 && preMetrics.population > 0 && !state.isCrisis
      ? 2.5
      : 0;
  const nextTreasury = Number(
    (state.treasury + preMetrics.netBalance + fdiBonus).toFixed(4)
  );

  // Duy nhất 1 lần chốt sổ chuẩn xác khi chuyển tháng trong stepSimulationMonth
  const settlementEntry = runEndOfMonthSettlement(
    nextGrid,
    state.policies,
    preMetrics,
    settledMonth,
    settledYear,
    state.season,
    nextTreasury,
    fdiBonus,
    state.activeConcertMonths
  );
  const existingLedger = (state.globalLedger ?? []).filter(
    (e) => e.id !== settlementEntry.id
  );
  const nextGlobalLedger = [...existingLedger, settlementEntry].slice(-60);
  GlobalLedger.length = 0;
  GlobalLedger.push(...nextGlobalLedger);

  let nextConsecutiveNegBudget =
    nextTreasury < 0 ? state.consecutiveNegativeBudgetMonths + 1 : 0;

  let nextIsCrisis = state.isCrisis;
  let nextCrisisTimer = state.crisisTimer;
  let nextCrisisMonthsElapsed = state.crisisMonthsElapsed;
  let nextEmigratedCount = 0;
  let nextMode: GameStateMode = state.mode;
  let snapshot = state.snapshot;
  let banner = settlementEntry.summary;

  if (nextSeason === 'high_tide' && state.season !== 'high_tide') {
    banner =
      preMetrics.floodedTileCount > 0
        ? `CẢNH BÁO TRIỀU CƯỜNG: ${preMetrics.floodedTileCount} phân khu ngập nặng! Hãy lắp Ống Thoát Nước [V] (15 Triệu/ô · 1 ngày) để bảo vệ chuỗi cung ứng.`
        : 'Đỉnh triều cường tháng 10-12: Đô thị thoát nước an toàn.';
  } else if (preMetrics.labor.brainDrainActive) {
    banner =
      'CẢNH BÁO CHẢY MÁU CHẤT XÁM: Thuế TNCN lao động có bằng cấp > 25% khiến Bác sĩ & Kỹ sư rời bỏ thành phố!';
  } else if (preMetrics.canExpandRegion && state.unlockedRegions.length === 1) {
    banner = `ĐỦ ĐIỀU KIỆN MỞ RỘNG ĐÔ THỊ: Dân số đạt ${preMetrics.population.toLocaleString('vi-VN')} người & Ngân sách ${formatVnd(nextTreasury)}! Hãy mở Bản Đồ Vùng 9x9 [E].`;
  }

  // --- CHU KỲ KIỂM TRA CUỐI THÁNG (END OF MONTH CHECK — NGÀY 30) ---
  if (state.isCrisis) {
    const recovered =
      preMetrics.happiness > 40 &&
      preMetrics.socialStability >= 20 &&
      nextConsecutiveNegBudget < 2;

    if (recovered) {
      nextIsCrisis = false;
      nextCrisisTimer = 0;
      nextCrisisMonthsElapsed = 0;
      nextConsecutiveNegBudget = nextTreasury < 0 ? 1 : 0;
      banner = 'Khủng hoảng đã được xoa dịu';
    } else {
      nextCrisisTimer = Math.max(0, state.crisisTimer - 1);
      nextCrisisMonthsElapsed = state.crisisMonthsElapsed + 1;
      const emigrationRate = nextCrisisMonthsElapsed * 0.1;
      nextEmigratedCount = runCrisisEmigrationStep(nextGrid, emigrationRate);

      if (nextCrisisTimer <= 0) {
        nextMode = 'gameover';
        banner = 'Khủng hoảng An sinh kéo dài, biểu tình vượt tầm kiểm soát';
      } else {
        banner = `KHỦNG HOẢNG TIẾP DIỄN (Còn ${nextCrisisTimer} tháng): PCI bị trừ thêm 5 điểm (tổng -${nextCrisisMonthsElapsed * 5}), Di cư +${nextCrisisMonthsElapsed * 10}% (-${nextEmigratedCount} người dân rời đi)! Hãy tăng Trợ cấp An sinh, giảm Thuế PIT hoặc nâng Đền bù lên Cao 135% để đưa Hạnh phúc > 40%!`;
      }
    }
  } else {
    const shouldTriggerCrisis =
      preMetrics.happiness < 30 ||
      preMetrics.socialStability < 20 ||
      nextConsecutiveNegBudget >= 2;

    if (shouldTriggerCrisis) {
      nextIsCrisis = true;
      nextCrisisTimer = 3;
      nextCrisisMonthsElapsed = 0;
      banner =
        'BÁO ĐỘNG KHỦNG HOẢNG (CrisisTimer = 3 tháng): Hạnh phúc < 30%, An sinh < 20% hoặc Ngân sách âm 2 tháng liên tiếp! Mỗi tháng tiếp theo PCI -5 điểm & Di cư +10%. Hãy tăng Trợ cấp An sinh, giảm Thuế PIT hoặc chọn Đền bù Cao 135% để đưa Hạnh phúc > 40%!';
    }
  }

  const nextMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    nextSeason,
    nextConcertMonths,
    nextTreasury,
    nextCrisisMonthsElapsed
  );

  const prevLevel = state.cityLevel ?? 1;
  const nextCityLevel = computeCityLevel(
    nextMetrics.population,
    nextTreasury,
    prevLevel
  );
  const obEval = evaluateOnboardingProgress(
    nextGrid,
    nextMetrics.population,
    nextCityLevel,
    state.completedQuests ?? []
  );

  if (nextCityLevel > prevLevel && !nextIsCrisis) {
    const spec = CITY_LEVEL_SPECS[nextCityLevel];
    banner = `🎉 THĂNG CẤP ĐÔ THỊ LEVEL ${nextCityLevel} — ${spec.title.toUpperCase()}: ${spec.unlockSummary}`;
  }

  const seasonName =
    nextSeason === 'dry'
      ? 'Mùa Khô'
      : nextSeason === 'monsoon'
      ? 'Mùa Mưa Bão'
      : 'Triều Cường';
  for (let z = 0; z < nextGrid.length; z++) {
    for (let x = 0; x < nextGrid[z].length; x++) {
      const tile = nextGrid[z][x];
      const spec = BUILDING_SPECS[tile.type];
      if (!spec || spec.baseGrossOutputBillion <= 0) continue;
      const rep = getTileDetailedReport(
        nextGrid,
        tile,
        state.policies,
        nextMetrics,
        nextMonth,
        nextYear,
        nextConcertMonths
      );
      const entry: MonthlyCitEntry = {
        monthLabel: `T${nextMonth}/${nextYear}`,
        seasonLabel: seasonName,
        grossOutputBillion: rep.grossOutputBillion,
        citRate: rep.corporateTaxRate,
        citRevenueBillion: rep.corporateTaxRevenue,
        efficiencyPercent: rep.economicEfficiencyPercent,
        isHistorical: true,
      };
      const prevHist = tile.citHistory ? [...tile.citHistory] : [];
      prevHist.push(entry);
      tile.citHistory = prevHist.slice(-6);
    }
  }

  if (nextMode === 'gameover') {
    snapshot = {
      outcome: 'defeat',
      reason: 'Khủng hoảng An sinh kéo dài, biểu tình vượt tầm kiểm soát',
      month: nextMonth,
      year: nextYear,
      treasury: nextTreasury,
      population: nextMetrics.population,
      pci: nextMetrics.pci,
      socialStability: nextMetrics.socialStability,
    };
  }

  const nextBestPci = Math.max(state.bestPci, nextMetrics.pci);
  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;

  const nextState: CityGameState = {
    ...state,
    mode: nextMode,
    day: 1,
    month: nextMonth,
    year: nextYear,
    treasury: nextTreasury,
    bestPci: nextBestPci,
    season: nextSeason,
    activeConcertMonths: nextConcertMonths,
    grid: nextGrid,
    regionGrids: { ...state.regionGrids, [regKey]: nextGrid },
    metrics: nextMetrics,
    globalLedger: nextGlobalLedger,
    latestSettlementReport: settlementEntry,
    hasUnreadSettlement: true,
    lastEventBanner: banner,
    snapshot,
    isCrisis: nextIsCrisis,
    crisisTimer: nextCrisisTimer,
    crisisMonthsElapsed: nextCrisisMonthsElapsed,
    consecutiveNegativeBudgetMonths: nextConsecutiveNegBudget,
    lastEmigratedCount: nextEmigratedCount,
    cityLevel: nextCityLevel,
    onboardingStep: obEval.onboardingStep,
    onboardingCompleted: obEval.onboardingCompleted,
    completedQuests: obEval.completedQuests,
  };

  const savedAt = saveGameStateToLocalStorage(nextState);
  nextState.lastSavedAt = savedAt;
  return nextState;
}

/**
 * Hệ thống Trợ Lý Cố Vấn Kinh Tế Vĩ Mô (City Economic Advisor)
 */
export function generateCityAdvisorBriefing(
  state: CityGameState
): AdvisorBriefing {
  const report = state.latestSettlementReport;
  const { metrics, policies, grid, treasury } = state;

  const reportMonth = report ? report.month : state.month;
  const reportYear = report ? report.year : state.year;
  const reportSeason = report ? report.season : state.season;
  const seasonLabel =
    reportSeason === 'dry'
      ? 'Mùa Khô'
      : reportSeason === 'monsoon'
      ? 'Mùa Mưa Bão'
      : 'Đỉnh Triều Cường';

  const netIncome = report ? report.netIncome : metrics.netBalance;
  const totalCIT = report ? report.totalTaxCIT : metrics.monthlyRevenue * 0.55;
  const totalPIT = report ? report.totalTaxPIT : metrics.monthlyRevenue * 0.45;
  const totalUpkeep = report
    ? report.totalMaintenanceCost + report.welfareAndFloodCost
    : metrics.monthlyExpense;

  let topTaxContributor: string | null = null;
  let heaviestUpkeepEntity: string | null = null;

  if (report && report.entityBreakdown.length > 0) {
    const sortedByTax = [...report.entityBreakdown].sort(
      (a, b) => b.taxCIT + b.taxPIT - (a.taxCIT + a.taxPIT)
    );
    if (sortedByTax[0] && sortedByTax[0].taxCIT + sortedByTax[0].taxPIT > 0) {
      topTaxContributor = `${sortedByTax[0].customName} (+${formatVnd(
        sortedByTax[0].taxCIT + sortedByTax[0].taxPIT
      )})`;
    }

    const sortedByUpkeep = [...report.entityBreakdown].sort(
      (a, b) => b.maintenanceCost - a.maintenanceCost
    );
    if (sortedByUpkeep[0] && sortedByUpkeep[0].maintenanceCost > 0) {
      heaviestUpkeepEntity = `${sortedByUpkeep[0].customName} (-${formatVnd(
        sortedByUpkeep[0].maintenanceCost
      )})`;
    }
  }

  let roadCount = 0;
  let resCount = 0;
  let resHighCount = 0;
  let comCount = 0;
  let indCount = 0;
  let pubWelfareCount = 0;
  let privServiceCount = 0;

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const t = grid[z][x].type;
      if (isRoadTile(t)) roadCount++;
      else if (isResidentialTile(t)) {
        resCount++;
        if (t === 'res_high') resHighCount++;
      } else if (t === 'com_market' || t === 'com_mall' || t === 'com_street') {
        comCount++;
      } else if (t === 'ind_factory' || t === 'ind_fdi' || t === 'agr_farm') {
        indCount++;
      } else if (
        t === 'pub_hospital' ||
        t === 'pub_school' ||
        t === 'pub_edu_med'
      ) {
        pubWelfareCount++;
      } else if (t === 'priv_hospital' || t === 'priv_school') {
        privServiceCount++;
      }
    }
  }

  let healthGrade: AdvisorBriefing['healthGrade'] = 'B';
  if (state.isCrisis) {
    healthGrade = 'Crisis';
  } else if (netIncome >= 0.5 && metrics.happiness >= 75 && metrics.pci >= 65) {
    healthGrade = 'A';
  } else if (netIncome < 0 || treasury < 5 || metrics.happiness < 45) {
    healthGrade = 'D';
  } else if (netIncome < 0.1 || metrics.staffShortageBuildings > 0) {
    healthGrade = 'C';
  }

  const financialSummary = `Quyết toán T${reportMonth}/${reportYear}: Thu ròng ${
    netIncome >= 0 ? '+' : ''
  }${formatVnd(netIncome)}/tháng (CIT: +${formatVnd(
    totalCIT
  )} · PIT: +${formatVnd(totalPIT)} · Chi vận hành & An sinh: -${formatVnd(
    totalUpkeep
  )}). Quỹ kho bạc hiện đạt ${formatVnd(treasury)}.`;

  const diagnostics: string[] = [];
  const recommendations: AdvisorRecommendation[] = [];

  if (state.isCrisis || metrics.happiness < 40 || metrics.socialStability < 30) {
    diagnostics.push(
      `Báo động Đỏ: Hạnh phúc (${Math.round(
        metrics.happiness
      )}%) hoặc An sinh (${Math.round(
        metrics.socialStability
      )}%) đang dưới ngưỡng an toàn, nguy cơ di cư ${
        metrics.emigrationRatePercent
      }%/tháng.`
    );
    recommendations.push({
      id: 'rec_crisis_welfare',
      priority: 'urgent',
      title: 'Tăng Trợ Cấp An Sinh & Giảm Thuế Dân Sinh Khẩn Cấp',
      analysis:
        'Cần nâng ngay mức Trợ cấp An sinh lên 75% để kéo Hạnh phúc vượt mốc > 40% và dập tắt khủng hoảng.',
      actionLabel: 'Nâng An Sinh Lên 75%',
      actionType: 'adjust_policy',
      policyKey: 'welfareLevel',
      policyValue: Math.max(75, policies.welfareLevel),
    });
  }

  if (roadCount === 0 || resCount === 0) {
    diagnostics.push(
      'Đô thị đang ở giai đoạn khởi nguyên: Cần mạng lưới Đường giao thông và Khu dân cư để thu hút dân nhập cư.'
    );
    recommendations.push({
      id: 'rec_starter_road_res',
      priority: 'high',
      title:
        roadCount === 0
          ? 'Mở Trục Đường Nhựa Đô Thị Đầu Tiên'
          : 'Phân Lô Nhà Ống / Chung Cư Mini Sát Đường',
      analysis:
        roadCount === 0
          ? 'Mọi công trình dân cư và thương mại đều yêu cầu đặt sát đường giao thông để hoạt động.'
          : 'Cần xây khu nhà ở sát đường để cư dân dọn vào ở, tạo nguồn thu thuế TNCN (PIT) và lực lượng lao động.',
      actionLabel:
        roadCount === 0 ? 'Chọn Đường Nhựa [2]' : 'Chọn Nhà Ống [4]',
      actionType: 'select_tool',
      toolId: roadCount === 0 ? 'road_urban' : 'res_low',
    });
  }

  if (netIncome < 0 || (resCount > 0 && comCount + indCount === 0)) {
    diagnostics.push(
      netIncome < 0
        ? `Ngân sách đang thâm hụt ${formatVnd(
            Math.abs(netIncome)
          )}/tháng do chi phí duy trì hạ tầng lớn hơn nguồn thu thuế.`
        : 'Thành phố đã có cư dân nhưng thiếu Chợ / Khu thương mại để tạo nguồn thu Thuế TNDN (CIT) và việc làm.'
    );
    recommendations.push({
      id: 'rec_boost_cit_market',
      priority: netIncome < 0 ? 'urgent' : 'high',
      title: 'Phát Triển Chợ Truyền Thống / Thương Mại Tăng Thu CIT',
      analysis:
        'Chợ Truyền Thống thu hút tiểu thương và đóng góp trực tiếp Thuế TNDN (CIT) hàng tháng giúp cân bằng thu chi.',
      actionLabel: 'Chọn Xây Chợ [7]',
      actionType: 'select_tool',
      toolId: 'com_market',
    });
  }

  if (pubWelfareCount >= 2 && privServiceCount === 0 && netIncome < 0.25) {
    diagnostics.push(
      `Đang vận hành ${pubWelfareCount} cơ sở Y tế/Giáo dục Công lập gây áp lực phí duy trì (Upkeep) lên ngân sách nhà nước.`
    );
    recommendations.push({
      id: 'rec_private_service_balance',
      priority: 'high',
      title: 'Xã Hội Hóa: Đầu Tư Bệnh Viện / Trường Học Tư Thục',
      analysis:
        'Khối Tư nhân không tốn phí duy trì ngân sách (Upkeep = 0) mà còn nộp Thuế TNDN (CIT) khi thành phố có tầng lớp trung lưu & trí thức.',
      actionLabel: 'Chọn Bệnh Viện Tư [O]',
      actionType: 'select_tool',
      toolId: 'priv_hospital',
    });
  }

  if (metrics.labor.brainDrainActive) {
    diagnostics.push(
      `Chảy máu chất xám đang kích hoạt do Thuế TNCN Trí thức (${policies.pitEducated}%) vượt ngưỡng 25%!`
    );
    recommendations.push({
      id: 'rec_stop_brain_drain',
      priority: 'urgent',
      title: 'Hạ Thuế TNCN Trí Thức Xuống 18% Giữ Chân Chuyên Gia',
      analysis:
        'Giảm thuế PIT trí thức xuống <= 20% sẽ chấm dứt tình trạng chảy máu chất xám và phục hồi năng suất FDI / Bệnh viện.',
      actionLabel: 'Hạ PIT Trí Thức Còn 18%',
      actionType: 'adjust_policy',
      policyKey: 'pitEducated',
      policyValue: 18,
    });
  } else if (metrics.staffShortageBuildings > 0 && resHighCount === 0) {
    diagnostics.push(
      `Có ${metrics.staffShortageBuildings} công trình thiếu hụt nhân sự chuyên môn (Bác sĩ, Kỹ sư, Giáo viên).`
    );
    recommendations.push({
      id: 'rec_build_high_res',
      priority: 'high',
      title: 'Xây Chung Cư Cao Cấp Thu Hút Tầng Lớp Trí Thức',
      analysis:
        'Chung cư cao cấp (sát Đường Nhựa/Cao Tốc) cung cấp chỗ ở cho lao động có bằng cấp để lấp đầy vị trí Bác sĩ & Kỹ sư.',
      actionLabel: 'Chọn Chung Cư Cao Cấp [6]',
      actionType: 'select_tool',
      toolId: 'res_high',
    });
  }

  if (metrics.floodedTileCount > 0 || metrics.drainageCoverage < 60) {
    diagnostics.push(
      `Có ${metrics.floodedTileCount} phân khu đang bị ngập nước (Độ phủ cống ngầm: ${metrics.drainageCoverage}%), làm giảm hiệu suất kinh tế.`
    );
    recommendations.push({
      id: 'rec_install_drainage',
      priority: 'high',
      title: 'Lắp Đặt Cống Ngầm Thoát Nước Chống Ngập',
      analysis:
        'Chỉ tốn 15 Triệu VNĐ/ô (1 ngày thi công) để bảo vệ các phân khu thương mại khỏi thiệt hại mùa mưa bão & triều cường.',
      actionLabel: 'Chọn Ống Thoát Nước [V]',
      actionType: 'select_tool',
      toolId: 'sub_drainage',
    });
  }

  if (recommendations.length < 2) {
    diagnostics.push(
      `Chỉ số năng lực cạnh tranh PCI đạt ${Math.round(
        metrics.pci
      )}/100, tốc độ lưu thông giao thông đạt ${Math.round(
        metrics.trafficSpeedIndex
      )}%.`
    );
    if (policies.citFdi > 10) {
      recommendations.push({
        id: 'rec_optimize_fdi_tax',
        priority: 'opportunity',
        title: 'Ưu Đãi Thuế CIT Khu Công Nghệ Cao FDI (10%)',
        analysis:
          'Giảm nhẹ thuế CIT khối FDI xuống 10% sẽ đẩy mạnh điểm PCI và thu hút thêm dòng vốn đầu tư chất lượng cao.',
        actionLabel: 'Đặt Thuế FDI = 10%',
        actionType: 'adjust_policy',
        policyKey: 'citFdi',
        policyValue: 10,
      });
    } else {
      recommendations.push({
        id: 'rec_expand_fdi_zone',
        priority: 'opportunity',
        title: 'Mở Rộng Tổ Hợp Công Nghệ Cao FDI / TT Thương Mại',
        analysis:
          'Ngân sách đang vững vàng, thích hợp đầu tư công trình quy mô lớn để bứt phá doanh thu thuế CIT tháng tới.',
        actionLabel: 'Chọn Tổ Hợp FDI [F]',
        actionType: 'select_tool',
        toolId: 'ind_fdi',
      });
    }
  }

  const headline =
    healthGrade === 'Crisis'
      ? 'Báo Động Khủng Hoảng: Cần Cứu Trợ An Sinh & Ngân Sách Ngay!'
      : healthGrade === 'A'
      ? 'Tài Chính Thịnh Vượng: Thặng Dư Tốt & Tăng Trưởng Bền Vững'
      : healthGrade === 'D'
      ? 'Cảnh Báo Thâm Hụt: Cần Bổ Sung Nguồn Thu Thuế CIT & Cắt Giảm Lỗ'
      : 'Phân Tích Quyết Toán: Cần Cân Đối Nhân Sự & Mở Rộng Nguồn Thu';

  return {
    month: reportMonth,
    year: reportYear,
    seasonLabel,
    healthGrade,
    headline,
    financialSummary,
    topTaxContributor,
    heaviestUpkeepEntity,
    diagnostics: diagnostics.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
}
