import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyToolToTile,
  BUILDING_SPECS,
  calculateLandClearanceCost,
  calculateMacroEconomy,
  canPlaceToolAtTile,
  computeCityLevel,
  computeTileEconomics,
  createInitialGameState,
  detectGhostCollision,
  DEFAULT_DAY_TICK_MS,
  evaluateOnboardingProgress,
  generateCityAdvisorBriefing,
  getRoadConnections,
  getTileDetailedReport,
  GlobalLedger,
  isPolicyUnlockedAtLevel,
  isToolUnlockedAtLevel,
  markSettlementReportRead,
  MAX_DAY_TICK_MS,
  MIN_DAY_TICK_MS,
  ONBOARDING_QUESTS,
  renameBuildingCustomName,
  runEndOfMonthSettlement,
  setDayTickInterval,
  STARTING_TREASURY,
  stepSimulationDay,
  stepSimulationMonth,
  TOOLS,
  triggerShowbizConcert,
} from './rules';
import { computeCameraAmbienceProfile } from './audio';
import {
  buildSplineRouteFromTilePath,
  buildTileLaneCurvePoints,
  createVehicleNavAgent,
  findAStarRoadPath,
  generateVehicleRoutesFromGrid,
  getCardinalDirBetweenTiles,
  isNodeOccupiedByOther,
  lerpAngle,
  NodeOccupancyMap,
  nodeKey,
  sampleRouteAtDistance,
  stepVehicleNavigationAgent,
} from './roadVehiclePaths';

test('1. Realistic Vietnamese currency & capacity scale (50B start, 8M alley, 65M urban road, 32B apartment, 500k-1M wild land)', () => {
  const state = createInitialGameState(true);
  assert.equal(state.treasury, STARTING_TREASURY);
  assert.equal(state.treasury, 50);

  // Alley road: 8 Million VND (0.008 Billion), 1 day construction
  assert.equal(BUILDING_SPECS.road_alley.costBillion, 0.008);
  assert.equal(BUILDING_SPECS.road_alley.constructionDays, 1);

  // Urban road: 65 Million VND (0.065 Billion), 1 day construction
  assert.equal(BUILDING_SPECS.road_urban.costBillion, 0.065);
  assert.equal(BUILDING_SPECS.road_urban.constructionDays, 1);

  // Mid/high apartment: 32 Billion VND (within 30-35B), capacity 600 (within 200-1000)
  assert.equal(BUILDING_SPECS.res_high.costBillion, 32);
  assert.equal(BUILDING_SPECS.res_high.maxCapacity, 600);

  // Townhouse / Tube house: capacity 8 (within 4-8), 1 day construction
  assert.equal(BUILDING_SPECS.res_low.maxCapacity, 8);
  assert.equal(BUILDING_SPECS.res_low.constructionDays, 1);

  // Mini apartment: capacity 120 (within 100-150)
  assert.equal(BUILDING_SPECS.res_mid.maxCapacity, 120);

  // Hospital / University: 35 job slots (within 20-50)
  const hospReq = BUILDING_SPECS.pub_edu_med.requiredWorkers;
  assert.equal(hospReq.unskilled + hospReq.skilled + hospReq.educated, 35);

  // BaseEmptyLandPrice clearance cost: 500,000 VND - 1,000,000 VND (0.0005 - 0.001 Billion)
  const emptyTile = state.grid[5][5];
  const wildClearance = calculateLandClearanceCost(emptyTile, 'fair');
  assert.equal(wildClearance.canClear, true);
  assert.equal(wildClearance.isWildLandClearance, true);
  assert.ok(
    wildClearance.compensationCost >= 0.0005 &&
      wildClearance.compensationCost <= 0.001
  );
});

test('2. Road Snapping & Proximity Detection creates T-junctions, Cross-intersections, and bridges 1-tile gaps', () => {
  let state = createInitialGameState(true);

  // Place East-West road at (4, 5) and then at (6, 5) — 1 tile gap at (5, 5) should auto-snap!
  state = applyToolToTile(state, 4, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 5, 'road_urban').nextState;
  assert.equal(state.grid[5][5].type, 'road_urban');

  // Place North branch at (5, 4) -> (5, 5) becomes a T-junction ('t_junction')
  state = applyToolToTile(state, 5, 4, 'road_urban').nextState;
  const connT = getRoadConnections(state.grid, 5, 5);
  assert.equal(connT.junctionType, 't_junction');
  assert.equal(state.grid[5][5].junctionType, 't_junction');

  // Place South branch at (5, 6) -> (5, 5) becomes a 4-way Cross-intersection ('crossroad')
  state = applyToolToTile(state, 5, 6, 'road_urban').nextState;
  const connCross = getRoadConnections(state.grid, 5, 5);
  assert.equal(connCross.junctionType, 'crossroad');
  assert.equal(state.grid[5][5].junctionType, 'crossroad');
});

test('3. Decoupled Shell & Core (0 / MaxCapacity) + Natural Immigration + MinimumWealthLevel Stratification', () => {
  let state = createInitialGameState(true);

  // Build road (completes in 1 day) and Luxury High-Rise Apartment (completes in 5 days)
  state = applyToolToTile(state, 6, 6, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 7, 'res_high').nextState;

  const newlyBuiltApt = state.grid[7][6];
  assert.equal(newlyBuiltApt.currentOccupants, 0);
  assert.equal(newlyBuiltApt.maxCapacity, 600);
  assert.equal(newlyBuiltApt.constructionRemainingDays, 5);

  const initialReport = getTileDetailedReport(
    state.grid,
    newlyBuiltApt,
    state.policies,
    state.metrics
  );
  assert.equal(initialReport.currentOccupants, 0);
  assert.equal(initialReport.maxCapacity, 600);

  // Advance 1 day -> road at (6, 6) finishes construction (1 day), apartment has 4 days left and still 0 occupants
  state = stepSimulationDay(state);
  assert.equal(state.grid[6][6].constructionRemainingDays, 0);
  assert.equal(state.grid[7][6].constructionRemainingDays, 4);
  assert.equal(state.grid[7][6].currentOccupants, 0);

  // Advance 4 more days so the apartment finishes construction on day 5
  for (let i = 0; i < 4; i++) {
    state = stepSimulationDay(state);
  }
  assert.equal(state.grid[7][6].constructionRemainingDays, 0);

  // Immigrate gradually: population increases step-by-step (not jumping straight to 600)
  const popAfterFinish = state.grid[7][6].currentOccupants;
  assert.ok(popAfterFinish > 0 && popAfterFinish < 600);

  state = stepSimulationDay(state);
  const popNextDay = state.grid[7][6].currentOccupants;
  assert.ok(popNextDay > popAfterFinish && popNextDay < 600);

  // Verify MinimumWealthLevel = 'high': Strictly ZERO unskilled workers in Luxury High-Rise Apartment!
  const aptAfterImmigration = state.grid[7][6];
  assert.equal(aptAfterImmigration.occupantsByTier.unskilled, 0);
  assert.ok(aptAfterImmigration.occupantsByTier.skilled > 0);
  assert.ok(aptAfterImmigration.occupantsByTier.educated > 0);
});

test('4. Job Pathfinding links residents to Hospital and reports Doctor shortage when no educated housing exists', () => {
  let state = createInitialGameState(true);

  // Build Urban Road at (8, 7) and (7, 7) first so Hospital and Housing satisfy road adjacency prerequisites
  state = applyToolToTile(state, 8, 7, 'road_urban').nextState;
  state = applyToolToTile(state, 7, 7, 'road_urban').nextState;

  // Build only a Hospital (pub_edu_med) at (8, 8) adjacent to road (8, 7) without any residential buildings
  state = applyToolToTile(state, 8, 8, 'pub_edu_med').nextState;
  for (let d = 0; d < 4; d++) {
    state = stepSimulationDay(state);
  }

  const hospitalTile = state.grid[8][8];
  assert.equal(hospitalTile.constructionRemainingDays, 0);
  const shortageReport = getTileDetailedReport(
    state.grid,
    hospitalTile,
    state.policies,
    state.metrics
  );
  assert.equal(shortageReport.assignedWorkersTotal, 0);
  assert.equal(shortageReport.requiredWorkersTotal, 35);
  assert.ok(
    shortageReport.missingWorkersWarning &&
      shortageReport.missingWorkersWarning.includes('Bác sĩ')
  );

  // Now build a Luxury Apartment (res_high) at (7, 8) and a Tube House (res_low) at (7, 6) next to road (7, 7)
  state = applyToolToTile(state, 7, 8, 'res_high').nextState;
  state = applyToolToTile(state, 7, 6, 'res_low').nextState;
  for (let d = 0; d < 6; d++) {
    state = stepSimulationDay(state);
  }

  const staffedReport = getTileDetailedReport(
    state.grid,
    state.grid[8][8],
    state.policies,
    state.metrics
  );
  // Educated doctors from res_high and unskilled/skilled workers from res_low/res_high now fill the hospital!
  assert.equal(staffedReport.assignedWorkers.educated, 20);
  assert.equal(staffedReport.assignedWorkersTotal, 35);
  assert.equal(staffedReport.missingWorkersWarning, null);
});

test('5. Hotkey J for Showbiz (no WASD collision), strict building prerequisites, and anti-exploit Concert check', () => {
  const showbizTool = TOOLS.find((t) => t.id === 'showbiz_stadium');
  assert.ok(showbizTool);
  assert.equal(showbizTool.keyHint, 'J');

  // Ensure none of WASD are used as tool keyHints
  for (const tool of TOOLS) {
    assert.ok(
      !['W', 'A', 'S', 'D'].includes(tool.keyHint),
      `Tool ${tool.id} collides with WASD: ${tool.keyHint}`
    );
  }

  let state = createInitialGameState(true);

  // Early-game exploit check: Triggering Concert with nothing built MUST FAIL and add 0 money
  const earlyConcert = triggerShowbizConcert(state);
  assert.equal(earlyConcert.success, false);
  assert.equal(earlyConcert.nextState.treasury, 50);
  assert.equal(earlyConcert.nextState.activeConcertMonths, 0);
  assert.equal(state.metrics.canTriggerConcert, false);

  // Building a house in the middle of nowhere without a road MUST FAIL
  const noRoadBuild = applyToolToTile(state, 5, 5, 'res_low');
  assert.equal(noRoadBuild.success, false);
  assert.equal(noRoadBuild.nextState.grid[5][5].type, 'empty_land');

  // Building a Luxury Apartment (res_high) on a narrow dirt alley (road_alley) MUST FAIL
  state = applyToolToTile(state, 5, 5, 'road_alley').nextState;
  const alleyHighRise = applyToolToTile(state, 5, 6, 'res_high');
  assert.equal(alleyHighRise.success, false);
  assert.equal(alleyHighRise.nextState.grid[6][5].type, 'empty_land');

  // Building Showbiz Stadium without Power/Water (util_power_water) or Pop >= 80 MUST FAIL
  state = applyToolToTile(state, 8, 8, 'road_urban').nextState;
  const prematureShowbiz = applyToolToTile(state, 8, 9, 'showbiz_stadium');
  assert.equal(prematureShowbiz.success, false);
});

test('6. Spline & Bezier vehicle movement on non-straight road segments (L-corners & T-junctions)', () => {
  let state = createInitialGameState(true);

  // Build an L-shaped corner road at (5, 4) -> (5, 5) -> (6, 5)
  state = applyToolToTile(state, 5, 4, 'road_urban').nextState;
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 5, 'road_urban').nextState;

  const cornerTile = state.grid[5][5];
  assert.equal(cornerTile.junctionType, 'corner');

  // Verify 90-degree turn waypoints inside (5, 5) from South (0, 1) to East (1, 0)
  const curvePts = buildTileLaneCurvePoints(
    cornerTile,
    { dx: 0, dz: 1 },
    { dx: 1, dz: 0 }
  );
  assert.equal(curvePts.length, 10);
  assert.ok(curvePts.every((p) => p.isCurve === true));

  // Verify intermediate point on the Bezier curve is smoothly curved (neither purely colinear in X nor purely colinear in Z)
  const pStart = curvePts[0];
  const pMid = curvePts[5];
  const pEnd = curvePts[9];
  assert.ok(pMid.x > pStart.x && pMid.x < pEnd.x);
  assert.ok(pMid.z > pStart.z && pMid.z < pEnd.z);

  // Verify full route generation across the L-corner and a T-junction branch at (4, 5)
  state = applyToolToTile(state, 4, 5, 'road_urban').nextState;
  const routes = generateVehicleRoutesFromGrid(state.grid);
  assert.ok(routes.length >= 1);
  assert.equal(routes[0].hasCurvedSegments, true);

  // Sample along the route and verify smooth continuous positions and yaw angles
  const s1 = sampleRouteAtDistance(routes[0], 0);
  const s2 = sampleRouteAtDistance(routes[0], routes[0].totalLength * 0.25);
  assert.ok(Number.isFinite(s1.x) && Number.isFinite(s1.z) && Number.isFinite(s1.yaw));
  assert.ok(Number.isFinite(s2.x) && Number.isFinite(s2.z) && Number.isFinite(s2.yaw));

  // Verify shortest-arc lerpAngle across the -PI / +PI boundary
  const lerped = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  assert.ok(Math.abs(Math.abs(lerped) - Math.PI) < 0.01);
});

test('7. Monthly CIT Revenue Breakdown dashboard data & historical tracking per commercial building', () => {
  let state = createInitialGameState(true);

  // Build road, housing, and a commercial market
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 5, 4, 'res_mid').nextState;
  state = applyToolToTile(state, 5, 6, 'com_market').nextState;

  // Step 8 days so buildings finish construction and workers staff the market
  for (let d = 0; d < 8; d++) {
    state = stepSimulationDay(state);
  }

  const marketTile = state.grid[6][5];
  const reportBeforeMonth = getTileDetailedReport(
    state.grid,
    marketTile,
    state.policies,
    state.metrics,
    state.month,
    state.year
  );

  assert.equal(reportBeforeMonth.corporateTaxKey, 'citMarket');
  assert.ok(reportBeforeMonth.corporateTaxRevenue > 0);
  assert.ok(reportBeforeMonth.potentialMaxCitRevenue >= reportBeforeMonth.corporateTaxRevenue);
  assert.ok(reportBeforeMonth.monthlyCitBreakdown.length >= 4);
  assert.equal(reportBeforeMonth.monthlyCitBreakdown[0].monthLabel, 'T1/2026');
  assert.ok(reportBeforeMonth.monthlyCitBreakdown[0].citRevenueBillion > 0);

  // Advance a full month (End-of-Month Check) -> records historical CIT entry
  state = stepSimulationMonth(state);
  const marketAfterMonth = state.grid[6][5];
  assert.ok(Array.isArray(marketAfterMonth.citHistory));
  assert.equal(marketAfterMonth.citHistory?.length, 1);
  assert.equal(marketAfterMonth.citHistory?.[0].isHistorical, true);
});

test('8. End-of-Month Crisis & Grace Period System (Trigger -> Snowball PCI/Emigration -> Recovery -> Permadeath after 3 months)', () => {
  let state = createInitialGameState(true);

  // Build road and housing so city has residents
  state = applyToolToTile(state, 6, 6, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 5, 'res_mid').nextState;
  for (let d = 0; d < 8; d++) {
    state = stepSimulationDay(state);
  }
  assert.ok(state.metrics.population > 0);

  // 1. Trigger Crisis via oppressive policies (Happiness < 30% / Stability < 20%) at End-of-Month
  state.policies = {
    ...state.policies,
    pitLow: 25,
    pitMid: 35,
    pitEducated: 45,
    welfareLevel: 0,
    compensationLevel: 'low',
    allowSidewalkEconomy: false,
  };
  state = stepSimulationMonth(state);

  // Must NOT Game Over immediately! Instead: isCrisis = true, crisisTimer = 3
  assert.equal(state.mode, 'playing');
  assert.equal(state.isCrisis, true);
  assert.equal(state.crisisTimer, 3);
  assert.equal(state.crisisMonthsElapsed, 0);

  const pciBeforeSnowball = state.metrics.pci;

  // 2. Snowball Effect: 1 month passes in Crisis without recovery -> CrisisTimer = 2, PCI -5, Emigration +10%
  state = stepSimulationMonth(state);
  assert.equal(state.mode, 'playing');
  assert.equal(state.isCrisis, true);
  assert.equal(state.crisisTimer, 2);
  assert.equal(state.crisisMonthsElapsed, 1);
  assert.equal(state.metrics.emigrationRatePercent, 10);
  assert.ok(state.metrics.pci <= pciBeforeSnowball - 4.5);

  // 3. Recovery: Player raises Welfare, lowers PIT, sets compensationLevel to 'generous' (Cao 135%)
  state.policies = {
    ...state.policies,
    pitLow: 2,
    pitMid: 5,
    pitEducated: 10,
    welfareLevel: 95,
    compensationLevel: 'generous',
    allowSidewalkEconomy: true,
  };
  state.metrics = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );
  assert.ok(state.metrics.happiness > 40);

  // Next End-of-Month check cancels Crisis and shows 'Khủng hoảng đã được xoa dịu'
  state = stepSimulationMonth(state);
  assert.equal(state.mode, 'playing');
  assert.equal(state.isCrisis, false);
  assert.equal(state.crisisTimer, 0);
  assert.equal(state.lastEventBanner, 'Khủng hoảng đã được xoa dịu');

  // 4. Permadeath: Re-trigger Crisis and let 3 consecutive months expire without recovery
  state.policies = {
    ...state.policies,
    pitLow: 25,
    pitMid: 35,
    pitEducated: 45,
    welfareLevel: 0,
    compensationLevel: 'low',
    allowSidewalkEconomy: false,
  };
  // End of Month A: Trigger (timer = 3)
  state = stepSimulationMonth(state);
  assert.equal(state.isCrisis, true);
  assert.equal(state.crisisTimer, 3);
  assert.equal(state.mode, 'playing');

  // End of Month B: timer = 2
  state = stepSimulationMonth(state);
  assert.equal(state.crisisTimer, 2);
  assert.equal(state.mode, 'playing');

  // End of Month C: timer = 1
  state = stepSimulationMonth(state);
  assert.equal(state.crisisTimer, 1);
  assert.equal(state.mode, 'playing');

  // End of Month D: timer reaches 0 -> Permadeath GameOver!
  state = stepSimulationMonth(state);
  assert.equal(state.crisisTimer, 0);
  assert.equal(state.mode, 'gameover');
  assert.equal(
    state.snapshot?.reason,
    'Khủng hoảng An sinh kéo dài, biểu tình vượt tầm kiểm soát'
  );
});

test('9. Negative budget check blocks construction with "Ngân sách không đủ" while free-pan inspect mode (Shift) works freely', () => {
  let state = createInitialGameState(true);
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;

  // Force negative budget (< 0)
  state = {
    ...state,
    treasury: -1.5,
  };

  // Attempting to build road or residential when treasury < 0 must fail with 'Ngân sách không đủ'
  const roadAttempt = applyToolToTile(state, 5, 6, 'road_urban');
  assert.equal(roadAttempt.success, false);
  assert.equal(roadAttempt.message, 'Ngân sách không đủ');

  const resAttempt = applyToolToTile(state, 5, 4, 'res_low');
  assert.equal(resAttempt.success, false);
  assert.equal(resAttempt.message, 'Ngân sách không đủ');

  // Free-pan inspect mode (Shift) still selects/inspects tiles freely without error
  const inspectAttempt = applyToolToTile(state, 5, 5, 'inspect');
  assert.equal(inspectAttempt.success, true);
  assert.equal(inspectAttempt.effectType, 'inspect');
});

test('10. 3D Ghost Preview validation (canPlaceToolAtTile): Green when prerequisites met, Red when missing road or occupied, and disabled on ESC/Shift inspect', () => {
  let state = createInitialGameState(true);

  // Without a road nearby, Apartment (res_high) ghost preview is Red (allowed = false, isGhostBuilding = true, isColliding = false)
  const unroadedGhost = canPlaceToolAtTile(state, 5, 4, 'res_high');
  assert.equal(unroadedGhost.isGhostBuilding, true);
  assert.equal(unroadedGhost.allowed, false);
  assert.equal(unroadedGhost.isColliding, false);

  // Place an urban road at (5, 5)
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;

  // Now (5, 4) is adjacent to urban road and treasury (49.935B) >= 32B -> Ghost Preview is Green (allowed = true, isColliding = false)
  const validApartmentGhost = canPlaceToolAtTile(state, 5, 4, 'res_high');
  assert.equal(validApartmentGhost.isGhostBuilding, true);
  assert.equal(validApartmentGhost.allowed, true);
  assert.equal(validApartmentGhost.isColliding, false);

  // Hovering over the already-built road at (5, 5) -> Ghost Preview is Colliding (allowed = false, isColliding = true)
  const occupiedGhost = canPlaceToolAtTile(state, 5, 5, 'res_high');
  assert.equal(occupiedGhost.isGhostBuilding, true);
  assert.equal(occupiedGhost.allowed, false);
  assert.equal(occupiedGhost.isColliding, true);

  // Cancelling with ESC / Shift sets tool to 'inspect' -> Ghost Preview is hidden (isGhostBuilding = false)
  const inspectGhost = canPlaceToolAtTile(state, 5, 4, 'inspect');
  assert.equal(inspectGhost.isGhostBuilding, false);
  assert.equal(inspectGhost.allowed, false);
  assert.equal(inspectGhost.isColliding, false);
});

test('11. Ghost Preview Collision Detection (detectGhostCollision) flags overlap with existing buildings and returns collidedWithLabel', () => {
  let state = createInitialGameState(true);

  // Build road at (5, 5) and Tube House (res_low) at (5, 4)
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 5, 4, 'res_low').nextState;

  // Hovering Apartment ghost over empty land at (6, 5) -> no collision
  const emptyCollision = detectGhostCollision(state.grid, 6, 5, 'res_high');
  assert.equal(emptyCollision.isColliding, false);

  // Hovering Apartment ghost over existing Tube House at (5, 4) -> collision detected!
  const buildingCollision = detectGhostCollision(state.grid, 5, 4, 'res_high');
  assert.equal(buildingCollision.isColliding, true);
  assert.ok(buildingCollision.collidedWithLabel?.includes('Nhà Ống'));

  // canPlaceToolAtTile also reports isColliding = true and reason 'Va chạm công trình: ...'
  const placeCheck = canPlaceToolAtTile(state, 5, 4, 'res_high');
  assert.equal(placeCheck.allowed, false);
  assert.equal(placeCheck.isColliding, true);
  assert.ok(placeCheck.reason?.includes('Va chạm công trình'));
});

test('12. Building InstanceID, CustomName, 5 Financial Attributes (revenue, taxPIT, taxCIT, maintenanceCost, netIncome), GlobalLedger & Day 30 Settlement', () => {
  let state = createInitialGameState(true);
  assert.equal(GlobalLedger.length, 0);
  assert.equal(state.globalLedger.length, 0);

  // Place Urban Road, Traditional Market #1, Traditional Market #2, and Mini Apartment
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 5, 4, 'com_market').nextState;
  state = applyToolToTile(state, 6, 4, 'com_market').nextState;
  state = applyToolToTile(state, 5, 6, 'res_mid').nextState;

  const market1 = state.grid[4][5];
  const market2 = state.grid[4][6];
  const apt = state.grid[6][5];

  // Verify unique InstanceIDs and auto-incremented CustomNames
  assert.equal(market1.instanceId, 'BLD-0003');
  assert.equal(market1.customName, 'Chợ Truyền Thống #3');
  assert.equal(market2.instanceId, 'BLD-0004');
  assert.equal(market2.customName, 'Chợ Truyền Thống #4');
  assert.equal(apt.instanceId, 'BLD-0005');
  assert.equal(apt.customName, 'Chung Cư Mini An Cư #5');

  // Verify custom rename works
  state = renameBuildingCustomName(state, 5, 4, 'Chợ Bến Thành');
  assert.equal(state.grid[4][5].customName, 'Chợ Bến Thành');

  // Verify daily build ledger entries recorded in GlobalLedger
  assert.equal(state.globalLedger.length, 5);
  assert.equal(GlobalLedger.length, 5);
  assert.equal(state.globalLedger[0].entryType, 'daily_build');

  // Step through to Day 30: verify stepSimulationDay does NOT trigger duplicate settlement at nextDay === 30
  while (state.day < 30) {
    state = stepSimulationDay(state);
  }
  assert.equal(state.day, 30);
  assert.equal(state.latestSettlementReport, null);

  // Step 1 more day (Day 30 -> Month 2 Day 1) so stepSimulationMonth runs the single authoritative End-of-Month Settlement
  state = stepSimulationDay(state);
  assert.equal(state.day, 1);
  assert.equal(state.month, 2);

  // Verify 5 financial properties on commercial and residential tiles
  const settledMarket = state.grid[4][5];
  const settledApt = state.grid[6][5];

  assert.ok((settledMarket.revenue ?? 0) > 0);
  assert.ok((settledMarket.taxCIT ?? 0) > 0);
  assert.equal(settledMarket.taxPIT ?? 0, 0);
  assert.ok((settledMarket.maintenanceCost ?? 0) > 0);
  assert.equal(
    settledMarket.netIncome ?? 0,
    Number(
      (
        (settledMarket.taxCIT ?? 0) +
        (settledMarket.taxPIT ?? 0) -
        (settledMarket.maintenanceCost ?? 0)
      ).toFixed(4)
    )
  );

  assert.ok((settledApt.taxPIT ?? 0) > 0);
  assert.equal(settledApt.taxCIT ?? 0, 0);
  assert.ok((settledApt.netIncome ?? 0) > 0);
  assert.ok((state.grid[5][5].maintenanceCost ?? 0) > 0);

  // Verify End-of-Month Settlement Report was generated once in stepSimulationMonth and stored in GlobalLedger
  assert.ok(state.latestSettlementReport);
  assert.equal(state.latestSettlementReport?.entryType, 'monthly_settlement');
  assert.equal(state.latestSettlementReport?.day, 30);
  assert.ok((state.latestSettlementReport?.totalRevenue ?? 0) > 0);
  assert.ok((state.latestSettlementReport?.totalTaxCIT ?? 0) > 0);
  assert.ok((state.latestSettlementReport?.totalTaxPIT ?? 0) > 0);
  assert.ok((state.latestSettlementReport?.totalMaintenanceCost ?? 0) > 0);
  assert.equal(state.latestSettlementReport?.entityBreakdown.length, 5);

  const marketRecord = state.latestSettlementReport?.entityBreakdown.find(
    (r) => r.instanceId === 'BLD-0003'
  );
  assert.ok(marketRecord);
  assert.equal(marketRecord?.customName, 'Chợ Bến Thành');
  assert.ok((marketRecord?.taxCIT ?? 0) > 0);

  // Verify direct runEndOfMonthSettlement call
  const directSettlement = runEndOfMonthSettlement(
    state.grid,
    state.policies,
    state.metrics,
    state.month,
    state.year,
    state.season,
    state.treasury,
    0
  );
  assert.equal(directSettlement.entityBreakdown.length, 5);
});

test('13. Vehicle A* Pathfinding, Node Occupancy Check, and 3-Second Stuck Fallback (Re-pathfinding & Safe Despawn)', () => {
  let state = createInitialGameState(true);

  // Build a road loop with an alternative branch:
  // Main horizontal road: (4,5) -> (5,5) -> (6,5) -> (7,5)
  // Alternate bypass around (5,5): (4,6) -> (5,6) -> (6,6)
  state = applyToolToTile(state, 4, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 7, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 4, 6, 'road_urban').nextState;
  state = applyToolToTile(state, 5, 6, 'road_urban').nextState;
  state = applyToolToTile(state, 6, 6, 'road_urban').nextState;

  // Verify A* finds shortest direct path when unblocked
  const directPath = findAStarRoadPath(
    state.grid,
    { x: 4, z: 5 },
    { x: 7, z: 5 }
  );
  assert.ok(directPath);
  assert.equal(directPath?.length, 4);

  // Verify A* routes around occupied/blocked node (5, 5)
  const blocked = new Set<string>([nodeKey(5, 5)]);
  const bypassPath = findAStarRoadPath(
    state.grid,
    { x: 4, z: 5 },
    { x: 7, z: 5 },
    blocked
  );
  assert.ok(bypassPath);
  assert.ok(bypassPath!.length > 4);
  assert.equal(
    bypassPath!.some((p) => p.x === 5 && p.z === 5),
    false
  );

  // Create vehicle navigation agent and occupancy map
  const routes = generateVehicleRoutesFromGrid(state.grid);
  assert.ok(routes.length > 0);
  const occupancyMap: NodeOccupancyMap = new Map();
  const agent = createVehicleNavAgent(routes[0], 0, occupancyMap);

  // Block the next tile on the route with another vehicle ('other_truck_99')
  const nextTileToBlock = { x: 5, z: 5 };
  occupancyMap.set(nodeKey(nextTileToBlock.x, nextTileToBlock.z), 'other_truck_99');
  assert.equal(
    isNodeOccupiedByOther(occupancyMap, 5, 5, agent.id),
    true
  );

  // Force agent to be at (4,5) and destination (5,5) which is occupied, and lock all other neighbors so no bypass exists
  occupancyMap.set(nodeKey(4, 6), 'other_bus_88');
  agent.currentTile = { x: 4, z: 5 };
  agent.destinationTile = { x: 5, z: 5 };

  // Step for 1.5 seconds (< 3.0s): vehicle waits at node and does NOT despawn yet
  stepVehicleNavigationAgent(agent, 1.5, 1.0, state.grid, occupancyMap);
  assert.equal(agent.statusReason, 'waiting_node');
  assert.equal(agent.despawnedSafely, false);
  assert.ok(agent.stuckTimerSeconds >= 1.5);

  // Step another 1.6 seconds (total 3.1s >= 3.0s): triggers 3s fallback and safely despawns since all exits are blocked!
  stepVehicleNavigationAgent(agent, 1.6, 1.0, state.grid, occupancyMap);
  assert.equal(agent.despawnedSafely, true);
  assert.equal(agent.statusReason, 'despawned');
  assert.equal(occupancyMap.get(nodeKey(4, 5)), undefined);
});

test('14. Split Public vs Private Healthcare & Education Modules (pub_hospital, priv_hospital, pub_school, priv_school)', () => {
  let state = createInitialGameState(true);
  state.treasury = 120;

  // Build urban road spine and high-rise + mini apartments for affluent + middle-class residents
  for (let x = 3; x <= 9; x++) {
    state = applyToolToTile(state, x, 5, 'road_urban').nextState;
  }
  state = applyToolToTile(state, 3, 4, 'res_high').nextState;
  state = applyToolToTile(state, 4, 4, 'res_mid').nextState;

  // Build all 4 independent Healthcare & Education modules along the urban road:
  const pubHospRes = applyToolToTile(state, 5, 4, 'pub_hospital');
  assert.equal(pubHospRes.success, true);
  state = pubHospRes.nextState;

  const privHospRes = applyToolToTile(state, 6, 4, 'priv_hospital');
  assert.equal(privHospRes.success, true);
  state = privHospRes.nextState;

  const pubSchoolRes = applyToolToTile(state, 7, 4, 'pub_school');
  assert.equal(pubSchoolRes.success, true);
  state = pubSchoolRes.nextState;

  const privSchoolRes = applyToolToTile(state, 8, 4, 'priv_school');
  assert.equal(privSchoolRes.success, true);
  state = privSchoolRes.nextState;

  // Populate residential buildings with educated & skilled workers and complete construction
  for (let d = 0; d < 6; d++) {
    state = stepSimulationDay(state);
  }
  state.grid[4][3].occupantsByTier = { unskilled: 0, skilled: 120, educated: 180 };
  state.grid[4][3].currentOccupants = 300;
  state.grid[4][4].occupantsByTier = { unskilled: 20, skilled: 50, educated: 30 };
  state.grid[4][4].currentOccupants = 100;
  state.metrics = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );

  // Inspect Public Hospital (pub_hospital) vs Private Hospital (priv_hospital)
  const pubHospReport = getTileDetailedReport(
    state.grid,
    state.grid[4][5],
    state.policies,
    state.metrics
  );
  const privHospReport = getTileDetailedReport(
    state.grid,
    state.grid[4][6],
    state.policies,
    state.metrics
  );

  // Public Hospital: Public sector, negative upkeep cost, 0 CIT tax
  assert.equal(pubHospReport.sectorOwnership, 'public');
  assert.equal(pubHospReport.taxCIT, 0);
  assert.ok(pubHospReport.maintenanceCost > 0);
  assert.ok(pubHospReport.netIncome < 0);

  // Private Hospital: Private sector, 0 municipal upkeep, positive revenue & CIT tax paid to budget
  assert.equal(privHospReport.sectorOwnership, 'private');
  assert.equal(privHospReport.maintenanceCost, 0);
  assert.ok(privHospReport.revenue > 0);
  assert.ok(privHospReport.taxCIT > 0);
  assert.ok(privHospReport.netIncome > 0);
  assert.ok((privHospReport.residentIncomeSuitabilityPercent ?? 0) >= 70);

  // Inspect Public School (pub_school) vs Private/International School (priv_school)
  const pubSchoolReport = getTileDetailedReport(
    state.grid,
    state.grid[4][7],
    state.policies,
    state.metrics
  );
  const privSchoolReport = getTileDetailedReport(
    state.grid,
    state.grid[4][8],
    state.policies,
    state.metrics
  );

  assert.equal(pubSchoolReport.sectorOwnership, 'public');
  assert.equal(pubSchoolReport.taxCIT, 0);
  assert.ok(pubSchoolReport.maintenanceCost > 0);

  assert.equal(privSchoolReport.sectorOwnership, 'private');
  assert.equal(privSchoolReport.maintenanceCost, 0);
  assert.ok(privSchoolReport.revenue > 0);
  assert.ok(privSchoolReport.taxCIT > 0);
});

test('15. Time Tick System (5-8 Seconds/Day) & Unread Settlement Notification Red Dot Badge Lifecycle', () => {
  let state = createInitialGameState(true);

  // Default day tick is 6000ms (6 seconds/day, within 5-8s range)
  assert.equal(state.dayTickIntervalMs, DEFAULT_DAY_TICK_MS);
  assert.ok(
    state.dayTickIntervalMs >= MIN_DAY_TICK_MS &&
      state.dayTickIntervalMs <= MAX_DAY_TICK_MS
  );
  assert.equal(state.hasUnreadSettlement, false);

  // Updating day tick clamps to [5000, 8000]ms
  state = setDayTickInterval(state, 5000);
  assert.equal(state.dayTickIntervalMs, 5000);
  state = setDayTickInterval(state, 8000);
  assert.equal(state.dayTickIntervalMs, 8000);
  state = setDayTickInterval(state, 1000);
  assert.equal(state.dayTickIntervalMs, 5000);

  // Step to Day 30 -> hasUnreadSettlement is still false because settlement only runs once on month transition in stepSimulationMonth
  while (state.day < 30) {
    state = stepSimulationDay(state);
  }
  assert.equal(state.day, 30);
  assert.equal(state.hasUnreadSettlement, false);

  // Step 1 more day (Day 30 -> Month 2 Day 1) -> stepSimulationMonth runs settlement once and sets hasUnreadSettlement = true
  state = stepSimulationDay(state);
  assert.equal(state.day, 1);
  assert.equal(state.month, 2);
  assert.equal(state.hasUnreadSettlement, true);
  assert.ok(state.latestSettlementReport);

  // When player clicks "Đóng Báo Cáo", markSettlementReportRead clears the Red Dot Badge until next month
  state = markSettlementReportRead(state);
  assert.equal(state.hasUnreadSettlement, false);
});

test('16. Optimized Vehicle A* Spline Continuity (North-South & East-West), Zero Wrap-Around Teleportation, and Opposite-Lane Pass-Through', () => {
  let state = createInitialGameState(true);

  // Verify getCardinalDirBetweenTiles never corrupts North-South (dx = 0) into diagonal
  assert.deepEqual(
    getCardinalDirBetweenTiles({ x: 6, z: 4 }, { x: 6, z: 5 }),
    { dx: 0, dz: 1 }
  );
  assert.deepEqual(
    getCardinalDirBetweenTiles({ x: 6, z: 5 }, { x: 6, z: 4 }),
    { dx: 0, dz: -1 }
  );

  // Build a Crossroad + L-corner network:
  // North-South spine: (6, 3) -> (6, 4) -> (6, 5) -> (6, 6) -> (6, 7)
  // East-West spine:   (4, 5) -> (5, 5) -> (6, 5) -> (7, 5) -> (8, 5)
  for (let z = 3; z <= 7; z++) {
    state = applyToolToTile(state, 6, z, 'road_urban').nextState;
  }
  for (let x = 4; x <= 8; x++) {
    if (x !== 6) {
      state = applyToolToTile(state, x, 5, 'road_urban').nextState;
    }
  }

  // Test North-South A* spline route directly
  const nsPath = findAStarRoadPath(
    state.grid,
    { x: 6, z: 3 },
    { x: 6, z: 7 }
  );
  assert.ok(nsPath);
  assert.equal(nsPath?.length, 5);

  const nsRoute = buildSplineRouteFromTilePath(
    'ns_test_route',
    'bus',
    state.grid,
    nsPath!
  );
  assert.ok(nsRoute);

  // Verify every consecutive segment around the closed loop (including wrap-around from last point to first point)
  // is smooth and never jumps across non-adjacent tiles (< 1.5 world units)
  for (let i = 0; i < nsRoute!.points.length; i++) {
    const p0 = nsRoute!.points[i];
    const p1 = nsRoute!.points[(i + 1) % nsRoute!.points.length];
    const segDist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    assert.ok(
      segDist < 1.5,
      `Expected smooth segment < 1.5 world units at index ${i}, got ${segDist}`
    );
  }

  // Generate routes from the full crossroad grid and spawn 2 vehicles on the primary route
  const routes = generateVehicleRoutesFromGrid(state.grid);
  assert.ok(routes.length >= 2);

  const occupancyMap: NodeOccupancyMap = new Map();
  const route0 = routes[0];
  const vehA = createVehicleNavAgent(
    { ...route0, id: 'veh_A' },
    0,
    occupancyMap
  );
  const vehB = createVehicleNavAgent(
    { ...route0, id: 'veh_B' },
    route0.totalLength * 0.36,
    occupancyMap
  );

  // Simulate 200 frames (10 seconds at dt = 0.05s) and verify both vehicles move continuously
  // along opposite lanes without deadlocking, spinning, or despawning
  const startDistA = vehA.distance;
  const startDistB = vehB.distance;
  let prevSampleA = sampleRouteAtDistance(vehA.route, vehA.distance);

  for (let frame = 0; frame < 200; frame++) {
    const sampleA = stepVehicleNavigationAgent(
      vehA,
      0.05,
      1.0,
      state.grid,
      occupancyMap
    );
    stepVehicleNavigationAgent(vehB, 0.05, 1.0, state.grid, occupancyMap);

    const frameStepDistA = Math.hypot(
      sampleA.x - prevSampleA.x,
      sampleA.z - prevSampleA.z
    );
    assert.ok(
      frameStepDistA < 1.0,
      `Vehicle A teleported ${frameStepDistA} units in a single 50ms frame`
    );
    prevSampleA = sampleA;
  }

  assert.equal(vehA.despawnedSafely, false);
  assert.equal(vehB.despawnedSafely, false);
  assert.notEqual(vehA.distance, startDistA);
  assert.notEqual(vehB.distance, startDistB);
});

test('17. Dynamic Camera Ambience Profile (Zone & Population Density) & End-of-Month Economic Advisor Briefing', () => {
  let state = createInitialGameState(true);
  state.treasury = 120;

  // 1. Camera over river/nature tiles (z = 11 is river_water) -> waterfront or nature ambience
  const riverProfile = computeCameraAmbienceProfile(state.grid, 8, 11, 0, 26);
  assert.ok(
    riverProfile.dominantZone === 'waterfront' ||
      riverProfile.dominantZone === 'nature'
  );
  assert.ok(riverProfile.natureWaterIntensity > 0.3);

  // 2. Build commercial & high-density residential cluster around (5, 4) and industrial FDI around (14, 6) next to highway (z = 7)
  for (let x = 3; x <= 15; x++) {
    state = applyToolToTile(state, x, 5, 'road_urban').nextState;
  }
  state = applyToolToTile(state, 4, 4, 'com_mall').nextState;
  state = applyToolToTile(state, 5, 4, 'com_market').nextState;
  state = applyToolToTile(state, 6, 4, 'res_high').nextState;
  state = applyToolToTile(state, 14, 6, 'ind_fdi').nextState;
  state = applyToolToTile(state, 15, 6, 'ind_factory').nextState;

  // Populate high-rise apartment to increase local & city population density
  state.grid[4][6].currentOccupants = 550;
  state.grid[4][4].currentOccupants = 280;
  state.grid[4][5].currentOccupants = 110;

  const commercialProfileNear = computeCameraAmbienceProfile(
    state.grid,
    5,
    4,
    940,
    20
  );
  const commercialProfileFar = computeCameraAmbienceProfile(
    state.grid,
    5,
    4,
    940,
    55
  );
  assert.ok(
    commercialProfileNear.dominantZone === 'commercial' ||
      commercialProfileNear.dominantZone === 'residential'
  );
  // Zooming in closer (distance 20 vs 55) yields higher population & commercial intensity
  assert.ok(
    commercialProfileNear.populationDensity >
      commercialProfileFar.populationDensity
  );
  assert.ok(commercialProfileNear.commercialIntensity > 0.25);

  const industrialProfile = computeCameraAmbienceProfile(
    state.grid,
    14,
    6,
    940,
    22
  );
  assert.equal(industrialProfile.dominantZone, 'industrial');
  assert.ok(industrialProfile.industryIntensity > 0.35);

  // 3. Step to End of Month (stepSimulationMonth) to generate latestSettlementReport
  state = stepSimulationMonth(state);
  assert.ok(state.latestSettlementReport);
  assert.equal(state.hasUnreadSettlement, true);

  const briefing = generateCityAdvisorBriefing(state);
  assert.ok(['A', 'B', 'C', 'D', 'Crisis'].includes(briefing.healthGrade));
  assert.ok(briefing.headline.length > 10);
  assert.ok(briefing.financialSummary.includes('Quyết toán'));
  assert.ok(briefing.diagnostics.length >= 1);
  assert.ok(briefing.recommendations.length >= 1);

  // Verify every recommendation has a valid decision action for the player
  for (const rec of briefing.recommendations) {
    assert.ok(rec.id.length > 0);
    assert.ok(rec.actionLabel.length > 0);
    assert.ok(
      ['select_tool', 'adjust_policy', 'open_drawer'].includes(rec.actionType)
    );
  }
});

test('18. Unified computeTileEconomics, sub_drainage Crisis PCI Fix, City Level 1-5 Feature Locks, and 5-Step Onboarding Quests', () => {
  let state = createInitialGameState(true);
  state.treasury = 250;

  // 1. Verify initial Level 1 & Onboarding Quest Step 1
  assert.equal(state.cityLevel, 1);
  assert.equal(state.onboardingStep, 1);
  assert.equal(state.onboardingCompleted, false);
  assert.equal(ONBOARDING_QUESTS.length, 5);

  // Verify Level 1 tool & policy locks when bypassLevelLock = false
  assert.equal(isToolUnlockedAtLevel('road_alley', 1), true);
  assert.equal(isToolUnlockedAtLevel('res_low', 1), true);
  assert.equal(isToolUnlockedAtLevel('com_market', 1), true);
  assert.equal(isToolUnlockedAtLevel('res_mid', 1), false);
  assert.equal(isToolUnlockedAtLevel('ind_fdi', 1), false);
  assert.equal(isToolUnlockedAtLevel('showbiz_stadium', 1), false);

  assert.equal(isPolicyUnlockedAtLevel('pit', 1), false);
  assert.equal(isPolicyUnlockedAtLevel('pit', 2), true);
  assert.equal(isPolicyUnlockedAtLevel('compensation', 2), false);
  assert.equal(isPolicyUnlockedAtLevel('compensation', 3), true);
  assert.equal(isPolicyUnlockedAtLevel('cit', 3), false);
  assert.equal(isPolicyUnlockedAtLevel('cit', 4), true);
  assert.equal(isPolicyUnlockedAtLevel('region_9x9', 4), false);
  assert.equal(isPolicyUnlockedAtLevel('region_9x9', 5), true);

  // Attempting to place a Level 4 building (ind_fdi) at Level 1 with bypassLevelLock = false is blocked
  state = applyToolToTile(state, 5, 5, 'road_urban').nextState;
  const lockedPlaceCheck = canPlaceToolAtTile(
    state,
    5,
    4,
    'ind_fdi',
    false
  );
  assert.equal(lockedPlaceCheck.allowed, false);
  assert.ok(lockedPlaceCheck.reason?.includes('Level 4'));

  // 2. Complete the 5 Onboarding Quests step by step:
  // Step 1: 3 road tiles (already have 1 at (5,5), build 2 more at (6,5) and (7,5))
  state = applyToolToTile(state, 6, 5, 'road_urban').nextState;
  state = applyToolToTile(state, 7, 5, 'road_urban').nextState;
  assert.ok(state.completedQuests.includes('quest_step_1_roads'));
  assert.equal(state.onboardingStep, 2);

  // Step 2: 3 low-density residential houses
  state = applyToolToTile(state, 5, 4, 'res_low').nextState;
  state = applyToolToTile(state, 6, 4, 'res_low').nextState;
  state = applyToolToTile(state, 7, 4, 'res_low').nextState;
  assert.ok(state.completedQuests.includes('quest_step_2_housing'));
  assert.equal(state.onboardingStep, 3);

  // Step 3: 1 local workplace (com_market)
  state = applyToolToTile(state, 5, 6, 'com_market').nextState;
  assert.ok(state.completedQuests.includes('quest_step_3_economy'));
  assert.equal(state.onboardingStep, 4);

  // Step 4: 2 underground drainage tiles (sub_drainage)
  state = applyToolToTile(state, 5, 4, 'sub_drainage').nextState;
  state = applyToolToTile(state, 6, 4, 'sub_drainage').nextState;
  assert.ok(state.completedQuests.includes('quest_step_4_drainage'));
  assert.equal(state.onboardingStep, 5);

  // Step 5: Reach 150 population (or City Level 2)
  const questEval = evaluateOnboardingProgress(
    state.grid,
    155,
    2,
    state.completedQuests
  );
  assert.equal(questEval.onboardingCompleted, true);
  assert.equal(questEval.completedQuests.length, 5);

  // 3. Verify sub_drainage during crisis preserves crisisMonthsElapsed PCI penalty
  state.isCrisis = true;
  state.crisisMonthsElapsed = 2; // -10 PCI penalty
  state.metrics = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );
  const pciBeforeDrainage = state.metrics.pci;
  const drainageRes = applyToolToTile(state, 7, 4, 'sub_drainage');
  assert.equal(drainageRes.success, true);
  // PCI should NOT jump up by +10 points when installing sub_drainage during crisis
  assert.equal(drainageRes.nextState.metrics.pci, pciBeforeDrainage);

  // 4. Verify unified computeTileEconomics across getTileDetailedReport, calculateMacroEconomy, and runEndOfMonthSettlement for FDI & Showbiz
  state.isCrisis = false;
  state.crisisMonthsElapsed = 0;
  state.treasury = 500;
  state = applyToolToTile(state, 8, 5, 'util_power_water').nextState;
  state = applyToolToTile(state, 7, 4, 'pub_admin').nextState;
  const fdiBuild = applyToolToTile(state, 6, 6, 'ind_fdi');
  assert.equal(fdiBuild.success, true);
  state = fdiBuild.nextState;
  // Finish construction and assign full workers
  const fdiTile = state.grid[6][6];
  fdiTile.constructionRemainingDays = 0;
  fdiTile.assignedWorkers = { ...fdiTile.requiredWorkers };
  const stadiumTile = state.grid[6][7];
  stadiumTile.constructionRemainingDays = 0;
  stadiumTile.assignedWorkers = { ...stadiumTile.requiredWorkers };

  state.activeConcertMonths = 1;
  state.metrics = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    state.activeConcertMonths,
    state.treasury,
    state.crisisMonthsElapsed
  );

  const fdiSharedEcon = computeTileEconomics(
    state.grid,
    fdiTile,
    state.policies,
    state.metrics.pci,
    state.metrics.supplyChainIndex,
    {
      unskilled: state.metrics.labor.unskilled,
      skilled: state.metrics.labor.skilled,
      educated: state.metrics.labor.educated,
    },
    state.activeConcertMonths
  );
  const fdiReport = getTileDetailedReport(
    state.grid,
    fdiTile,
    state.policies,
    state.metrics,
    state.month,
    state.year,
    state.activeConcertMonths
  );
  const settlement = runEndOfMonthSettlement(
    state.grid,
    state.policies,
    state.metrics,
    state.month,
    state.year,
    state.season,
    state.treasury,
    0,
    state.activeConcertMonths
  );
  const fdiSettlementRecord = settlement.entityBreakdown.find(
    (e) => e.x === 6 && e.z === 6
  );
  assert.ok(fdiSettlementRecord);
  assert.equal(fdiReport.corporateTaxRevenue, fdiSharedEcon.citRevenueBillion);
  assert.equal(fdiReport.taxCIT, fdiSettlementRecord?.taxCIT);
  assert.equal(fdiReport.revenue, fdiSettlementRecord?.revenue);

  // Verify City Level progression helper
  assert.equal(computeCityLevel(50, 50, 1), 1);
  assert.equal(computeCityLevel(160, 50, 1), 2);
  assert.equal(computeCityLevel(480, 50, 2), 3);
  assert.equal(computeCityLevel(920, 50, 3), 4);
  assert.equal(computeCityLevel(1250, 15, 4), 5);
});

test('19. Public Infrastructure Capacity (util_power_water), Admin Tax Leakage (pub_admin), Public Context Labels, and Split Upkeep (building vs infra)', () => {
  let state = createInitialGameState(true);
  state.treasury = 500;

  // Build urban road spine
  for (let x = 2; x <= 12; x++) {
    state = applyToolToTile(state, x, 5, 'road_urban').nextState;
  }

  // Place housing + commercial market + factory + power/water + pub_admin
  state = applyToolToTile(state, 3, 4, 'res_mid').nextState;
  state = applyToolToTile(state, 4, 4, 'res_high').nextState;
  state = applyToolToTile(state, 5, 4, 'com_market').nextState;
  state = applyToolToTile(state, 6, 4, 'ind_factory').nextState;
  state = applyToolToTile(state, 7, 4, 'util_power_water').nextState;
  state = applyToolToTile(state, 8, 4, 'pub_admin').nextState;
  state = applyToolToTile(state, 9, 4, 'sub_drainage').nextState;

  // Finish construction on all placed roads and buildings and populate housing so workers can staff facilities
  for (let x = 2; x <= 12; x++) {
    state.grid[5][x].constructionRemainingDays = 0;
  }
  for (let x = 3; x <= 8; x++) {
    state.grid[4][x].constructionRemainingDays = 0;
  }
  state.grid[4][3].currentOccupants = 120;
  state.grid[4][3].occupantsByTier = { unskilled: 50, skilled: 50, educated: 20 };
  state.grid[4][4].currentOccupants = 100;
  state.grid[4][4].occupantsByTier = { unskilled: 20, skilled: 40, educated: 40 };

  // 1. With 1 active util_power_water (capacity: 250 pop, 20 buildings) and 220 pop / 4 demand buildings -> NOT overloaded
  const metricsNormal = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    0,
    state.treasury,
    0
  );
  assert.equal(metricsNormal.utilityActiveStations, 1);
  assert.equal(metricsNormal.utilityCapacityPop, 250);
  assert.equal(metricsNormal.utilityCapacityBuildings, 20);
  assert.equal(metricsNormal.isUtilityOverloaded, false);
  assert.ok((metricsNormal.utilityLoadPercent ?? 0) <= 100);

  // Also verify pub_admin is active and tax collection efficiency is 100%
  assert.equal(metricsNormal.hasActivePublicAdmin, true);
  assert.equal(metricsNormal.taxCollectionEfficiencyPercent, 100);

  const marketGrossNormal = state.grid[4][5].revenue ?? 0;
  const marketCitNormal = state.grid[4][5].taxCIT ?? 0;
  assert.ok(marketGrossNormal > 0);
  assert.ok(marketCitNormal > 0);

  // Verify public building detailed report labels (no "Hiệu suất 0%" or "CIT")
  const utilReport = getTileDetailedReport(
    state.grid,
    state.grid[4][7],
    state.policies,
    metricsNormal,
    state.month,
    state.year
  );
  assert.equal(utilReport.isPublicUtilityOrService, true);
  assert.ok(utilReport.publicServiceSummaryLabel?.includes('Phục vụ:'));
  assert.ok(utilReport.publicServiceSummaryLabel?.includes('/20 công trình · Tải'));

  const adminReport = getTileDetailedReport(
    state.grid,
    state.grid[4][8],
    state.policies,
    metricsNormal,
    state.month,
    state.year
  );
  assert.equal(adminReport.isPublicUtilityOrService, true);
  assert.equal(
    adminReport.publicServiceSummaryLabel,
    'Hiệu lực thu thuế: 100% (Chống thất thoát)'
  );

  // 2. Disable pub_admin (set under construction) -> 12% administrative tax leakage (88% efficiency)
  state.grid[4][8].constructionRemainingDays = 2;
  const metricsNoAdmin = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    0,
    state.treasury,
    0
  );
  assert.equal(metricsNoAdmin.hasActivePublicAdmin, false);
  assert.equal(metricsNoAdmin.taxCollectionEfficiencyPercent, 88);
  const marketCitLeakage = state.grid[4][5].taxCIT ?? 0;
  assert.equal(
    marketCitLeakage,
    Number((marketCitNormal * 0.88).toFixed(3))
  );

  // Restore pub_admin and trigger Utility Overload (population > 250 for 1 station)
  state.grid[4][8].constructionRemainingDays = 0;
  state.grid[4][4].currentOccupants = 200;
  state.grid[4][4].occupantsByTier = { unskilled: 60, skilled: 80, educated: 60 };
  const metricsOverloaded = calculateMacroEconomy(
    state.grid,
    state.policies,
    state.season,
    0,
    state.treasury,
    0
  );
  assert.equal(metricsOverloaded.isUtilityOverloaded, true);
  assert.ok((metricsOverloaded.utilityLoadPercent ?? 0) > 100);
  // Output of commercial/industrial/agri drops by 35% (x0.65) and Happiness drops by 8 points
  const marketGrossOverloaded = state.grid[4][5].revenue ?? 0;
  assert.equal(
    marketGrossOverloaded,
    Number((marketGrossNormal * 0.65).toFixed(3))
  );
  assert.equal(metricsOverloaded.happiness, metricsNormal.happiness - 8);

  // 3. Verify split upkeep in runEndOfMonthSettlement
  const settlement = runEndOfMonthSettlement(
    state.grid,
    state.policies,
    metricsNormal,
    state.month,
    state.year,
    state.season,
    state.treasury,
    0,
    0
  );
  assert.ok(settlement.buildingMaintenanceCost > 0);
  assert.ok(settlement.infraMaintenanceCost > 0);
  assert.equal(
    settlement.buildingMaintenanceCost + settlement.infraMaintenanceCost,
    settlement.totalMaintenanceCost
  );
});
