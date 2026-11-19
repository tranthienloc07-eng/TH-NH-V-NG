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
  getDifficultySpec,
  getRegionName,
  hasNeighborOfType,
  isBuiltStructure,
  isResidentialTile,
  isRoadTile,
  isWorkplaceTile,
  MAX_DAY_TICK_MS,
  MIN_DAY_TICK_MS,
  REGION_GRID_SIZE,
  TILE_LABELS,
} from './constants';
import {
  calculateMacroEconomy,
  evaluateConcertEligibility,
  getTileDetailedReport,
  GlobalLedger,
  runEndOfMonthSettlement,
} from './economy';
import {
  createInitialGrid,
  recalculateGridLandValues,
} from './gridSnapping';
import {
  AdvisorBriefing,
  AdvisorRecommendation,
  BankDeposit,
  BankLoan,
  CityGameState,
  DifficultyLevel,
  GameStateMode,
  MacroMetrics,
  MacroPolicies,
  MonthlyCitEntry,
  RunSnapshot,
  SeasonType,
  TileData,
} from './types';

export const VICTORY_POP_TARGET = 1200;
export const VICTORY_PCI_TARGET = 75;
export const VICTORY_MIN_REGIONS = 2;

/**
 * Tổng hợp dân số, việc làm và thu/chi hàng tháng trên toàn bộ các vùng đã mở khóa (state.unlockedRegions)
 */
export function aggregateUnlockedRegionsMetrics(
  regionGrids: Record<string, TileData[][]>,
  unlockedRegions: string[],
  activeRegionKey: string,
  activeMetrics: MacroMetrics,
  policies: MacroPolicies,
  season: SeasonType,
  activeConcertMonths: number,
  treasury: number,
  crisisMonthsElapsed: number,
  difficulty: DifficultyLevel = 'hard'
): MacroMetrics {
  if (!unlockedRegions || unlockedRegions.length <= 1) {
    return activeMetrics;
  }

  let totalPop = activeMetrics.population;
  let totalHousing = activeMetrics.housingCapacity;
  let totalRevenue = activeMetrics.monthlyRevenue;
  let totalExpense = activeMetrics.monthlyExpense;
  let totalNet = activeMetrics.netBalance;
  let bestRegionalPci = activeMetrics.pci;

  const labor = { ...activeMetrics.labor };

  for (const regKey of unlockedRegions) {
    if (regKey === activeRegionKey) continue;
    const otherGrid = regionGrids[regKey];
    if (!otherGrid) continue;
    const m = calculateMacroEconomy(
      otherGrid,
      policies,
      season,
      activeConcertMonths,
      treasury,
      crisisMonthsElapsed,
      difficulty
    );
    totalPop += m.population;
    totalHousing += m.housingCapacity;
    totalRevenue = Number((totalRevenue + m.monthlyRevenue).toFixed(4));
    totalExpense = Number((totalExpense + m.monthlyExpense).toFixed(4));
    totalNet = Number((totalNet + m.netBalance).toFixed(4));
    bestRegionalPci = Math.max(bestRegionalPci, m.pci);

    labor.unskilled += m.labor.unskilled;
    labor.skilled += m.labor.skilled;
    labor.educated += m.labor.educated;
    labor.employedUnskilled += m.labor.employedUnskilled;
    labor.employedSkilled += m.labor.employedSkilled;
    labor.employedEducated += m.labor.employedEducated;
    labor.totalJobSlots += m.labor.totalJobSlots;
    labor.totalEmployed += m.labor.totalEmployed;
    labor.housingCapacity += m.labor.housingCapacity;
  }

  return {
    ...activeMetrics,
    pci: bestRegionalPci,
    population: totalPop,
    housingCapacity: totalHousing,
    monthlyRevenue: totalRevenue,
    monthlyExpense: totalExpense,
    netBalance: totalNet,
    totalRegionalPopulation: totalPop,
    totalRegionalJobs: labor.totalEmployed,
    canExpandRegion:
      totalPop >= EXPANSION_POP_TARGET && treasury >= EXPANSION_TREASURY_TARGET,
    labor,
  };
}

/**
 * Kiểm tra điều kiện Chiến thắng: Tổng Dân số >= 1200, PCI >= 75, unlockedRegions.length >= 2
 */
export function evaluateVictoryOutcome(
  metrics: MacroMetrics,
  unlockedRegionsCount: number,
  month: number,
  year: number,
  treasury: number,
  endlessMode?: boolean
): RunSnapshot | null {
  if (endlessMode) return null;
  if (
    metrics.population >= VICTORY_POP_TARGET &&
    metrics.pci >= VICTORY_PCI_TARGET &&
    unlockedRegionsCount >= VICTORY_MIN_REGIONS
  ) {
    return {
      outcome: 'victory',
      reason: `Đại Đô Thị Thịnh Vượng: Đạt ${metrics.population.toLocaleString(
        'vi-VN'
      )} cư dân liên vùng, chỉ số PCI ${Math.round(
        metrics.pci
      )}/100 và mở rộng ${unlockedRegionsCount} vùng đô thị!`,
      month,
      year,
      treasury,
      population: metrics.population,
      pci: metrics.pci,
      socialStability: metrics.socialStability,
    };
  }
  return null;
}

/**
 * Cho phép người chơi nhấn "Tiếp Tục Chơi Endless" trên Victory Modal
 */
export function continueEndlessAfterVictory(
  state: CityGameState
): CityGameState {
  return {
    ...state,
    mode: 'playing',
    snapshot: null,
    endlessMode: true,
    lastEventBanner:
      'Chế độ Endless đã kích hoạt! Hãy tiếp tục mở rộng toàn bộ 81 vùng đô thị 9x9.',
  };
}

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
  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;
  const nextRegionGrids = { ...state.regionGrids, [regKey]: nextGrid };
  const rawMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    state.season,
    3,
    nextTreasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );
  const nextMetrics = aggregateUnlockedRegionsMetrics(
    nextRegionGrids,
    state.unlockedRegions,
    regKey,
    rawMetrics,
    state.policies,
    state.season,
    3,
    nextTreasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );

  return {
    nextState: {
      ...state,
      activeConcertMonths: 3,
      treasury: nextTreasury,
      grid: nextGrid,
      regionGrids: nextRegionGrids,
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
        'road_ring',
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

export function createInitialGameState(
  startPlaying = false,
  difficulty: DifficultyLevel = 'hard'
): CityGameState {
  const startKey = '4,4';
  const grid = createInitialGrid(0);
  const policies = createDefaultPolicies();
  const season: SeasonType = 'dry';
  const diffSpec = getDifficultySpec(difficulty);
  const startingTreasury = diffSpec.startingTreasury;
  const metrics = calculateMacroEconomy(
    grid,
    policies,
    season,
    0,
    startingTreasury,
    0,
    difficulty
  );

  GlobalLedger.length = 0;

  return {
    mode: startPlaying ? 'playing' : 'title',
    difficulty,
    endlessMode: false,
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
    lastEventBanner: `Ngân sách khởi điểm ${startingTreasury} Tỷ VNĐ (${diffSpec.label})! Hãy xây Đường [1-3] trước, sau đó phân lô Nhà ở & Công trình sát đường để cư dân di cư vào thành phố.`,
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
    loans: [],
    deposits: [],
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

export function hasPlayerActuallyPlayed(
  state: Partial<CityGameState> | null | undefined
): boolean {
  if (!state || !Array.isArray(state.grid)) return false;
  if (state.mode !== 'playing' && state.mode !== 'paused') return false;

  const hasBuiltOrDrainedTile = state.grid.some(
    (row) =>
      Array.isArray(row) &&
      row.some(
        (cell) =>
          cell && (Boolean(cell.hasDrainage) || isBuiltStructure(cell.type))
      )
  );
  const hasTimeProgressed =
    (typeof state.year === 'number' && state.year > 2026) ||
    (typeof state.month === 'number' && state.month > 1) ||
    (typeof state.day === 'number' && state.day > 1);
  const hasProgressRecords =
    (typeof state.nextInstanceSeq === 'number' && state.nextInstanceSeq > 1) ||
    (Array.isArray(state.globalLedger) && state.globalLedger.length > 0) ||
    (Array.isArray(state.completedQuests) && state.completedQuests.length > 0);

  return hasBuiltOrDrainedTile || hasTimeProgressed || hasProgressRecords;
}

export function saveGameStateToLocalStorage(
  state: CityGameState
): string | null {
  const savedAt = formatAutoSaveTimestamp();
  try {
    if (
      typeof window !== 'undefined' &&
      window.localStorage &&
      hasPlayerActuallyPlayed(state)
    ) {
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
      !parsed.metrics ||
      !hasPlayerActuallyPlayed(parsed)
    ) {
      return null;
    }
    const base = createInitialGameState(true, parsed.difficulty ?? 'hard');
    return {
      ...base,
      ...parsed,
      difficulty: parsed.difficulty ?? 'hard',
      endlessMode: parsed.endlessMode ?? false,
      policies: {
        ...base.policies,
        ...parsed.policies,
      },
      cityLevel: parsed.cityLevel ?? 1,
      onboardingStep: parsed.onboardingStep ?? 1,
      onboardingCompleted: parsed.onboardingCompleted ?? false,
      completedQuests: Array.isArray(parsed.completedQuests)
        ? parsed.completedQuests
        : [],
      loans: Array.isArray(parsed.loans) ? parsed.loans : [],
      deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
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

  const currentKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;
  const syncedRegionGrids = { ...state.regionGrids, [currentKey]: state.grid };
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
    const nextUnlocked = [...state.unlockedRegions, targetKey];
    const nextRegionGrids = { ...syncedRegionGrids, [targetKey]: newGrid };

    const rawMetrics = calculateMacroEconomy(
      newGrid,
      state.policies,
      state.season,
      state.activeConcertMonths,
      nextTreasury,
      state.crisisMonthsElapsed,
      state.difficulty
    );
    const nextMetrics = aggregateUnlockedRegionsMetrics(
      nextRegionGrids,
      nextUnlocked,
      targetKey,
      rawMetrics,
      state.policies,
      state.season,
      state.activeConcertMonths,
      nextTreasury,
      state.crisisMonthsElapsed,
      state.difficulty
    );

    const victorySnap = evaluateVictoryOutcome(
      nextMetrics,
      nextUnlocked.length,
      state.month,
      state.year,
      nextTreasury,
      state.endlessMode
    );

    return {
      nextState: {
        ...state,
        mode: victorySnap ? 'gameover' : state.mode,
        snapshot: victorySnap ?? state.snapshot,
        treasury: nextTreasury,
        activeRegion: { rx, rz },
        unlockedRegions: nextUnlocked,
        regionGrids: nextRegionGrids,
        grid: newGrid,
        selectedTile: null,
        metrics: nextMetrics,
        lastEventBanner: victorySnap
          ? victorySnap.reason
          : `Đã mở khóa vùng đô thị mới: ${getRegionName(rx, rz)} (-${EXPANSION_TREASURY_TARGET} Tỷ VNĐ)!`,
      },
      unlockedNew: true,
    };
  }

  const existingGrid =
    syncedRegionGrids[targetKey] ?? createInitialGrid(rx * 11 + rz * 7);
  const rawMetrics = calculateMacroEconomy(
    existingGrid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );
  const nextMetrics = aggregateUnlockedRegionsMetrics(
    syncedRegionGrids,
    state.unlockedRegions,
    targetKey,
    rawMetrics,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );

  return {
    nextState: {
      ...state,
      activeRegion: { rx, rz },
      regionGrids: syncedRegionGrids,
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
  const nextRegionGrids = { ...state.regionGrids, [regKey]: nextGrid };

  if (nextDay > 30) {
    return stepSimulationMonth({
      ...state,
      day: 1,
      grid: nextGrid,
      regionGrids: nextRegionGrids,
    });
  }

  const rawMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );
  const nextMetrics = aggregateUnlockedRegionsMetrics(
    nextRegionGrids,
    state.unlockedRegions,
    regKey,
    rawMetrics,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed,
    state.difficulty
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

  const victorySnap = evaluateVictoryOutcome(
    nextMetrics,
    state.unlockedRegions.length,
    state.month,
    state.year,
    state.treasury,
    state.endlessMode
  );

  const nextState: CityGameState = {
    ...state,
    mode: victorySnap ? 'gameover' : state.mode,
    snapshot: victorySnap ?? state.snapshot,
    day: nextDay,
    bestPci: Math.max(state.bestPci, nextMetrics.pci),
    grid: nextGrid,
    regionGrids: nextRegionGrids,
    metrics: nextMetrics,
    cityLevel: nextCityLevel,
    onboardingStep: obEval.onboardingStep,
    onboardingCompleted: obEval.onboardingCompleted,
    completedQuests: obEval.completedQuests,
    lastEventBanner: victorySnap ? victorySnap.reason : banner,
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

  recalculateGridLandValues(nextGrid);

  if (!state.isCrisis) {
    for (let i = 0; i < 3; i++) {
      runImmigrationSystemStep(
        nextGrid,
        state.policies,
        state.metrics.happiness
      );
    }
  }

  const regKey = `${state.activeRegion.rx},${state.activeRegion.rz}`;
  const tempRegionGrids = { ...state.regionGrids, [regKey]: nextGrid };

  const rawPreMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    nextSeason,
    nextConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );
  const preMetrics = aggregateUnlockedRegionsMetrics(
    tempRegionGrids,
    state.unlockedRegions,
    regKey,
    rawPreMetrics,
    state.policies,
    nextSeason,
    nextConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed,
    state.difficulty
  );

  const fdiBonus =
    preMetrics.pci >= 75 && preMetrics.population > 0 && !state.isCrisis
      ? 2.5
      : 0;
  let runningTreasury = Number(
    (state.treasury + preMetrics.netBalance + fdiBonus).toFixed(4)
  );

  // Xử lý Ngân hàng Đô thị cuối tháng: Thu trả góp vay, thanh lý tài sản đảm bảo nếu vỡ nợ đáo hạn, cộng lãi/tất toán sổ tiết kiệm
  let monthlyBankNet = 0;
  const bankEventNotes: string[] = [];
  const nextLoans: BankLoan[] = [];

  for (const loan of state.loans ?? []) {
    const interest = Number(
      (loan.remainingPrincipal * (loan.monthlyRatePercent / 100)).toFixed(4)
    );
    const principalPayment =
      loan.remainingMonths <= 1
        ? loan.remainingPrincipal
        : Number(
            Math.min(
              loan.remainingPrincipal,
              loan.principal / Math.max(1, loan.totalMonths)
            ).toFixed(4)
          );
    const installment = Number((principalPayment + interest).toFixed(4));

    // Nếu khoản vay thế chấp đất đáo hạn mà ngân sách không đủ trả -> thanh lý tài sản đảm bảo
    if (
      loan.collateralTile &&
      loan.remainingMonths <= 1 &&
      runningTreasury < installment
    ) {
      const { x: cx, z: cz } = loan.collateralTile;
      if (
        cz >= 0 &&
        cz < nextGrid.length &&
        cx >= 0 &&
        cx < nextGrid[cz].length
      ) {
        nextGrid[cz][cx].isReservedPublicLand = false;
        nextGrid[cz][cx].reservedCostPaid = undefined;
      }
      bankEventNotes.push(
        `Ngân hàng đã thanh lý Quỹ đất công (${cx + 1}, ${cz + 1}) do quá hạn khoản vay thế chấp!`
      );
      continue;
    }

    runningTreasury = Number((runningTreasury - installment).toFixed(4));
    monthlyBankNet = Number((monthlyBankNet - installment).toFixed(4));

    const newRemainingPrincipal = Number(
      Math.max(0, loan.remainingPrincipal - principalPayment).toFixed(4)
    );
    const newRemainingMonths = Math.max(0, loan.remainingMonths - 1);
    if (newRemainingMonths > 0 && newRemainingPrincipal > 0.0001) {
      nextLoans.push({
        ...loan,
        remainingPrincipal: newRemainingPrincipal,
        remainingMonths: newRemainingMonths,
      });
    } else if (loan.collateralTile) {
      bankEventNotes.push(
        `Đã trả xong khoản vay thế chấp ô đất (${loan.collateralTile.x + 1}, ${loan.collateralTile.z + 1}).`
      );
    }
  }

  const nextDeposits: BankDeposit[] = [];
  for (const dep of state.deposits ?? []) {
    const monthlyInterest = Number(
      (dep.amount * (dep.monthlyRatePercent / 100)).toFixed(4)
    );
    const nextAccrued = Number((dep.accruedInterest + monthlyInterest).toFixed(4));
    const nextRemainingMonths = Math.max(0, dep.remainingMonths - 1);
    if (nextRemainingMonths <= 0) {
      const payout = Number((dep.amount + nextAccrued).toFixed(4));
      runningTreasury = Number((runningTreasury + payout).toFixed(4));
      monthlyBankNet = Number((monthlyBankNet + payout).toFixed(4));
      bankEventNotes.push(
        `Sổ tiết kiệm đáo hạn: nhận gốc + lãi +${formatVnd(payout, true)}.`
      );
    } else {
      nextDeposits.push({
        ...dep,
        remainingMonths: nextRemainingMonths,
        accruedInterest: nextAccrued,
      });
    }
  }

  const nextTreasury = runningTreasury;
  const roundedBankNet = Number(monthlyBankNet.toFixed(3));

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
    state.activeConcertMonths,
    state.difficulty
  );
  settlementEntry.monthlyBankNet = roundedBankNet;
  if (roundedBankNet !== 0) {
    settlementEntry.netIncome = Number(
      (settlementEntry.netIncome + roundedBankNet).toFixed(2)
    );
    settlementEntry.summary += ` · Ngân hàng ${roundedBankNet >= 0 ? '+' : ''}${formatVnd(roundedBankNet)}`;
  }
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
      const initialTimer = getDifficultySpec(
        state.difficulty
      ).initialCrisisTimer;
      nextIsCrisis = true;
      nextCrisisTimer = initialTimer;
      nextCrisisMonthsElapsed = 0;
      banner = `BÁO ĐỘNG KHỦNG HOẢNG (CrisisTimer = ${initialTimer} tháng): Hạnh phúc < 30%, An sinh < 20% hoặc Ngân sách âm 2 tháng liên tiếp! Mỗi tháng tiếp theo PCI -5 điểm & Di cư +10%. Hãy tăng Trợ cấp An sinh, giảm Thuế PIT hoặc chọn Đền bù Cao 135% để đưa Hạnh phúc > 40%!`;
    }
  }

  const nextRegionGrids = { ...state.regionGrids, [regKey]: nextGrid };
  const rawNextMetrics = calculateMacroEconomy(
    nextGrid,
    state.policies,
    nextSeason,
    nextConcertMonths,
    nextTreasury,
    nextCrisisMonthsElapsed,
    state.difficulty
  );
  const nextMetrics = aggregateUnlockedRegionsMetrics(
    nextRegionGrids,
    state.unlockedRegions,
    regKey,
    rawNextMetrics,
    state.policies,
    nextSeason,
    nextConcertMonths,
    nextTreasury,
    nextCrisisMonthsElapsed,
    state.difficulty
  );
  nextMetrics.monthlyBankNet = roundedBankNet;

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
        nextConcertMonths,
        state.difficulty
      );
      if (tile.constructionRemainingDays === 0) {
        if (rep.economicEfficiencyPercent < 50) {
          tile.lowEfficiencyMonths = (tile.lowEfficiencyMonths ?? 0) + 1;
        } else {
          tile.lowEfficiencyMonths = 0;
        }
      }
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
  } else {
    const victorySnap = evaluateVictoryOutcome(
      nextMetrics,
      state.unlockedRegions.length,
      nextMonth,
      nextYear,
      nextTreasury,
      state.endlessMode
    );
    if (victorySnap) {
      nextMode = 'gameover';
      snapshot = victorySnap;
      banner = victorySnap.reason;
    }
  }

  const nextBestPci = Math.max(state.bestPci, nextMetrics.pci);

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
    regionGrids: nextRegionGrids,
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
    loans: nextLoans,
    deposits: nextDeposits,
  };

  if (bankEventNotes.length > 0 && !nextIsCrisis) {
    nextState.lastEventBanner = `${bankEventNotes[0]} · ${nextState.lastEventBanner}`;
  }

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
  const chronicLowEfficiencyBuildings: string[] = [];

  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[z].length; x++) {
      const tile = grid[z][x];
      const t = tile.type;
      if (isRoadTile(t)) roadCount++;
      else if (isResidentialTile(t)) {
        resCount++;
        if (t === 'res_high') resHighCount++;
      } else if (
        t === 'com_market' ||
        t === 'com_mall' ||
        t === 'com_street' ||
        t === 'com_office'
      ) {
        comCount++;
      } else if (
        t === 'ind_factory' ||
        t === 'ind_food' ||
        t === 'ind_fdi' ||
        t === 'agr_farm'
      ) {
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

      const spec = BUILDING_SPECS[t];
      if (
        spec &&
        spec.baseGrossOutputBillion > 0 &&
        (tile.lowEfficiencyMonths ?? 0) >= 2
      ) {
        const label =
          tile.customName ?? `${TILE_LABELS[t]} (${x + 1},${z + 1})`;
        chronicLowEfficiencyBuildings.push(
          `${label} (${tile.lowEfficiencyMonths} tháng <50%)`
        );
      }
    }
  }

  let healthGrade: AdvisorBriefing['healthGrade'] = 'B';
  if (state.isCrisis) {
    healthGrade = 'Crisis';
  } else if (
    netIncome >= 0.5 &&
    metrics.happiness >= 75 &&
    metrics.pci >= 65 &&
    chronicLowEfficiencyBuildings.length === 0
  ) {
    healthGrade = 'A';
  } else if (netIncome < 0 || treasury < 5 || metrics.happiness < 45) {
    healthGrade = 'D';
  } else if (
    netIncome < 0.1 ||
    metrics.staffShortageBuildings > 0 ||
    chronicLowEfficiencyBuildings.length > 0
  ) {
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

  if (metrics.hasActivePublicAdmin) {
    const unempUnskilled = Math.max(
      0,
      metrics.labor.unskilled - metrics.labor.employedUnskilled
    );
    const unempSkilled = Math.max(
      0,
      metrics.labor.skilled - metrics.labor.employedSkilled
    );
    const unempEducated = Math.max(
      0,
      metrics.labor.educated - metrics.labor.employedEducated
    );
    diagnostics.push(
      `Thống kê nhân lực UBND (Chưa có việc): Phổ thông ${unempUnskilled} · Trung cấp ${unempSkilled} · Bằng cấp ${unempEducated} người.`
    );
  }

  const activeTransitLevel =
    policies.transitLevel ?? (policies.subsidizeBusTransit ? 1 : 0);
  const highValueResLowCount = metrics.highLandValueResLowWithoutTransit ?? 0;
  if (
    (state.cityLevel ?? 1) >= 3 &&
    highValueResLowCount > 0 &&
    activeTransitLevel === 0
  ) {
    diagnostics.push(
      `Áp lực giãn dân: Có ${highValueResLowCount} khu Nhà Ống nằm tại vùng giá đất > 8 Tỷ VNĐ nhưng chưa có Bus/BRT, làm giảm Hạnh phúc cư dân.`
    );
    recommendations.push({
      id: 'rec_gentrification_bus_brt',
      priority: 'high',
      title: 'Bật Tuyến Xe Bus / BRT Hỗ Trợ Giãn Dân Vùng Giá Đất Cao',
      analysis:
        'Kích hoạt Bus Trợ Giá hoặc BRT Nhanh giúp người dân vùng giá đất cao đi làm thuận tiện và xóa điểm trừ Hạnh phúc giãn dân.',
      actionLabel: 'Bật Bus Trợ Giá',
      actionType: 'adjust_policy',
      policyKey: 'transitLevel',
      policyValue: 1,
    });
  }

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

  if (chronicLowEfficiencyBuildings.length > 0) {
    diagnostics.push(
      `Cảnh báo Hiệu suất thấp (<50% từ 2 tháng liên tiếp): ${chronicLowEfficiencyBuildings
        .slice(0, 2)
        .join(', ')}. Đang gây thất thu CIT và gánh nặng phí duy trì!`
    );
    recommendations.push({
      id: 'rec_low_efficiency_alert',
      priority: 'urgent',
      title: `Khắc Phục ${chronicLowEfficiencyBuildings.length} Công Trình Dưới 50% Công Suất`,
      analysis: `Các cơ sở (${chronicLowEfficiencyBuildings
        .slice(0, 2)
        .join(
          ', '
        )}) thiếu nhân sự hoặc kẹt chuỗi cung ứng ≥ 2 tháng. Hãy bổ sung nhà ở phù hợp hoặc nâng cấp giao thông Vành đai.`,
      actionLabel: resHighCount === 0 ? 'Xây Chung Cư [5]' : 'Mở Vành Đai [K]',
      actionType: 'select_tool',
      toolId: resHighCount === 0 ? 'res_mid' : 'road_ring',
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

  if (metrics.floodedTileCount > 0) {
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
    diagnostics: diagnostics.slice(0, 5),
    recommendations: recommendations.slice(0, 3),
  };
}
