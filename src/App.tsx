import React, { useCallback, useEffect, useState } from 'react';
import {
  CityViewport3D,
  GraphicQuality,
  HeatmapMode,
  HoverTileInfo,
} from './components/CityViewport3D';
import { BankModal } from './components/BankModal';
import { BottomBuildDock, DockTooltipInfo } from './components/BottomBuildDock';
import { renderMinimalistDockIcon } from './components/dockIcons';
import { GameModals } from './components/GameModals';
import { MacroPolicyDrawer } from './components/MacroPolicyDrawer';
import {
  BuildingContextMenu,
  BuildingHoverTooltip,
  HowToPlayModal,
  MonthlySettlementModal,
  RegionMap9x9Modal,
} from './components/OverlaysAndGuides';
import { TopHudBar } from './components/TopHudBar';
import { soundEngine } from './game/audio';
import {
  applyToolToTile,
  calculateLandClearanceCost,
  calculateMacroEconomy,
  canPlaceToolAtTile,
  CITY_LEVEL_SPECS,
  clearSavedGameState,
  continueEndlessAfterVictory,
  createBankDeposit,
  createInitialGameState,
  evaluateOnboardingProgress,
  evaluatePlacementRisk,
  formatVnd,
  generateCityAdvisorBriefing,
  getBuildingFinancialPreview,
  getPolicyUnlockRequirementLabel,
  getToolUnlockRequirementLabel,
  hasPlayerActuallyPlayed,
  isBuiltStructure,
  isPolicyUnlockedAtLevel,
  isToolUnlockedAtLevel,
  loadGameStateFromLocalStorage,
  markSettlementReportRead,
  mortgageReservedLand,
  ONBOARDING_QUESTS,
  renameBuildingCustomName,
  repayBankLoanEarly,
  saveGameStateToLocalStorage,
  selectOrUnlockRegion,
  setDayTickInterval,
  stepSimulationDay,
  stepSimulationMonth,
  takeBankLoan,
  TOOLS,
  triggerShowbizConcert,
  unreservePublicLand,
  withdrawDepositEarly,
} from './game/rules';
import {
  AdvisorRecommendation,
  BuildingFinancialPreview,
  CityGameState,
  DifficultyLevel,
  MacroPolicies,
  PlacementRiskEvaluation,
  SeasonType,
  ToolId,
} from './game/types';
import { DockCategory, useGameHotkeys } from './hooks/useGameHotkeys';

function detectTouchPointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

function detectCompactOrTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 900 || detectTouchPointer();
}

export default function App() {
  const [gameState, setGameState] = useState<CityGameState>(() => {
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';
    const fresh = params.get('fresh') === '1';
    if (fresh) {
      clearSavedGameState();
    } else if (!autostart) {
      const saved = loadGameStateFromLocalStorage();
      if (saved && hasPlayerActuallyPlayed(saved)) {
        return saved;
      }
    }
    return createInitialGameState(autostart);
  });

  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(detectTouchPointer);
  const [isCompactViewport, setIsCompactViewport] =
    useState<boolean>(detectCompactOrTouch);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const coarseMq = window.matchMedia('(pointer: coarse)');
    const syncViewportFlags = () => {
      const touch = coarseMq.matches;
      setIsTouchDevice(touch);
      setIsCompactViewport(window.innerWidth < 900 || touch);
    };
    syncViewportFlags();
    window.addEventListener('resize', syncViewportFlags);
    coarseMq.addEventListener?.('change', syncViewportFlags);
    return () => {
      window.removeEventListener('resize', syncViewportFlags);
      coarseMq.removeEventListener?.('change', syncViewportFlags);
    };
  }, []);

  // Mặc định mở tab 'road' đầu tiên để người chơi dễ dàng xây đường nối liền ngay từ đầu
  const [dockCategory, setDockCategory] = useState<DockCategory>('road');
  const [activePolicyDrawer, setActivePolicyDrawer] = useState<
    'economy' | 'traffic' | null
  >(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  // Trên Mobile (<900px) hoặc thiết bị cảm ứng: mặc định thu gọn Onboarding & đóng Cố vấn để giải phóng >75% màn hình 3D
  const [onboardingCollapsed, setOnboardingCollapsed] = useState<boolean>(
    detectCompactOrTouch
  );
  const [hoveredDockTooltip, setHoveredDockTooltip] =
    useState<DockTooltipInfo | null>(null);
  const [pendingPlacementRisk, setPendingPlacementRisk] = useState<{
    x: number;
    z: number;
    toolId: ToolId;
    risk: PlacementRiskEvaluation;
  } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverTileInfo | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    z: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [regionMapOpen, setRegionMapOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('none');
  const [advisorHudOpen, setAdvisorHudOpen] = useState(false);
  const [lastAutoAdvisorReportId, setLastAutoAdvisorReportId] = useState<
    string | null
  >(null);
  const [isMuted, setIsMuted] = useState(false);
  const [graphicQuality, setGraphicQuality] = useState<GraphicQuality>(() =>
    detectTouchPointer() ? 'medium' : 'high'
  );
  const [hasManualQualityOverride, setHasManualQualityOverride] =
    useState(false);
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState(0);
  const [pulseEventCount, setPulseEventCount] = useState(0);
  const [budgetToast, setBudgetToast] = useState<string | null>(null);
  const [budgetToastClosing, setBudgetToastClosing] = useState(false);
  const [isTreasuryShaking, setIsTreasuryShaking] = useState(false);

  const handleDetectSoftwareGl = useCallback(
    (isSoftwareGl: boolean) => {
      if (isSoftwareGl && !hasManualQualityOverride) {
        setGraphicQuality('medium');
      }
    },
    [hasManualQualityOverride]
  );

  const handleToggleGraphicQuality = useCallback(() => {
    soundEngine.playClick();
    setHasManualQualityOverride(true);
    setGraphicQuality((prev) => (prev === 'high' ? 'medium' : 'high'));
  }, []);

  // Mỗi cuối tháng khi có Báo Cáo Quyết Toán mới, tự động mở Trợ Lý Cố Vấn trên Desktop;
  // trên Mobile (<900px / touch) giữ đóng để không che >75% màn hình 3D (chỉ hiện badge số gợi ý).
  useEffect(() => {
    const reportId = gameState.latestSettlementReport?.id ?? null;
    if (reportId && reportId !== lastAutoAdvisorReportId) {
      setLastAutoAdvisorReportId(reportId);
      if (!isCompactViewport) {
        setAdvisorHudOpen(true);
      }
      soundEngine.playAdvisorAlert();
    }
  }, [
    gameState.latestSettlementReport?.id,
    lastAutoAdvisorReportId,
    isCompactViewport,
  ]);

  const handleToggleAdvisorHud = useCallback(() => {
    soundEngine.playClick();
    setAdvisorHudOpen((prev) => !prev);
  }, []);

  const handleOpenSettlementModal = useCallback(() => {
    soundEngine.playClick();
    setSettlementModalOpen(true);
  }, []);

  const handleCloseSettlementModal = useCallback(() => {
    soundEngine.playClick();
    setSettlementModalOpen(false);
    // Khi người chơi bấm "Đóng Báo Cáo", chấm đỏ cảnh báo (!) biến mất cho đến kỳ quyết toán tháng tiếp theo
    setGameState((prev) => markSettlementReportRead(prev));
  }, []);

  const handleChangeDayTickInterval = useCallback((intervalMs: number) => {
    soundEngine.playClick();
    setGameState((prev) => setDayTickInterval(prev, intervalMs));
  }, []);

  const triggerBudgetInsufficientFeedback = useCallback(() => {
    setBudgetToastClosing(false);
    setBudgetToast('Ngân sách không đủ');
    setIsTreasuryShaking(false);
    window.requestAnimationFrame(() => {
      setIsTreasuryShaking(true);
    });
  }, []);

  useEffect(() => {
    if (!budgetToast) return;
    const fadeOutTimer = window.setTimeout(() => {
      setBudgetToastClosing(true);
    }, 2400);
    const removeTimer = window.setTimeout(() => {
      setBudgetToast(null);
      setBudgetToastClosing(false);
    }, 2750);
    return () => {
      window.clearTimeout(fadeOutTimer);
      window.clearTimeout(removeTimer);
    };
  }, [budgetToast]);

  useEffect(() => {
    if (!isTreasuryShaking) return;
    const timer = window.setTimeout(() => {
      setIsTreasuryShaking(false);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [isTreasuryShaking]);

  useEffect(() => {
    document.body.dataset.state = gameState.mode;
  }, [gameState.mode]);

  // Vòng lặp requestAnimationFrame Accumulator (accumulator += Math.min(dt, 100)), tự động đóng băng khi document.visibilityState === 'hidden'
  useEffect(() => {
    if (gameState.mode !== 'playing') return;
    const intervalMs = gameState.dayTickIntervalMs || 6000;
    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = (now: number) => {
      if (document.visibilityState === 'hidden') {
        lastTime = now;
      } else {
        const dt = Math.max(0, now - lastTime);
        lastTime = now;
        accumulator += Math.min(dt, 100);
        if (accumulator >= intervalMs) {
          accumulator -= intervalMs;
          setGameState((prev) => stepSimulationDay(prev));
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, [gameState.mode, gameState.dayTickIntervalMs]);

  const handleSelectDifficulty = useCallback((diff: DifficultyLevel) => {
    soundEngine.playClick();
    setGameState((prev) => ({
      ...createInitialGameState(false, diff),
      lastSavedAt: prev.lastSavedAt,
    }));
  }, []);

  const handleContinueEndless = useCallback(() => {
    soundEngine.playBuild();
    setGameState((prev) => {
      const next = continueEndlessAfterVictory(prev);
      const ts = saveGameStateToLocalStorage(next);
      return ts ? { ...next, lastSavedAt: ts } : next;
    });
  }, []);

  const handleStartGame = useCallback(() => {
    soundEngine.playBuild();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setGameState((prev) => {
      const next = createInitialGameState(true, prev.difficulty);
      return next;
    });
  }, []);

  const handleContinueSavedSession = useCallback(() => {
    soundEngine.playBuild();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const saved = loadGameStateFromLocalStorage();
    if (saved && hasPlayerActuallyPlayed(saved)) {
      setGameState({ ...saved, mode: 'playing', snapshot: null });
    } else {
      setGameState((prev) => ({ ...prev, mode: 'playing', snapshot: null }));
    }
  }, []);

  const handleRestartGame = useCallback(() => {
    soundEngine.playBuild();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActivePolicyDrawer(null);
    setContextMenu(null);
    setPendingPlacementRisk(null);
    setRegionMapOpen(false);
    setSettlementModalOpen(false);
    setBankModalOpen(false);
    setHeatmapMode('none');
    setAdvisorHudOpen(false);
    setLastAutoAdvisorReportId(null);
    setBudgetToast(null);
    setBudgetToastClosing(false);
    clearSavedGameState();
    setGameState((prev) => createInitialGameState(true, prev.difficulty));
  }, []);

  const handleReturnTitle = useCallback(() => {
    soundEngine.playClick();
    setActivePolicyDrawer(null);
    setContextMenu(null);
    setPendingPlacementRisk(null);
    setRegionMapOpen(false);
    setSettlementModalOpen(false);
    setBankModalOpen(false);
    setHeatmapMode('none');
    setAdvisorHudOpen(false);
    setLastAutoAdvisorReportId(null);
    setBudgetToast(null);
    setBudgetToastClosing(false);
    setGameState((prev) => ({
      ...prev,
      mode: 'title',
    }));
  }, []);

  const handleClearAutoSave = useCallback(() => {
    soundEngine.playClick();
    clearSavedGameState();
    setGameState((prev) => ({
      ...prev,
      lastSavedAt: null,
    }));
  }, []);

  const handleTogglePause = useCallback(() => {
    soundEngine.playClick();
    setGameState((prev) => {
      if (prev.mode === 'playing') return { ...prev, mode: 'paused' };
      if (prev.mode === 'paused') return { ...prev, mode: 'playing' };
      return prev;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setIsMuted(nextMuted);
  }, []);

  const handleReleaseToolToFreePan = useCallback(() => {
    soundEngine.playClick();
    setHoverInfo(null);
    setGameState((prev) => ({
      ...prev,
      selectedTool: 'inspect',
      lastEventBanner:
        'Chế độ Khảo Sát / Lia Tự Do [ESC · Shift] — Chạm vào công trình đã xây để xem Nhân Sự & Thuế CIT.',
    }));
  }, []);

  const handleRenameBuilding = useCallback(
    (x: number, z: number, customName: string) => {
      soundEngine.playClick();
      setGameState((prev) => renameBuildingCustomName(prev, x, z, customName));
    },
    []
  );

  const executeToolOnTile = useCallback(
    (x: number, z: number, customTool?: ToolId) => {
      setContextMenu(null);
      setGameState((prev) => {
        const activeTool = customTool ?? prev.selectedTool;

        // Kiểm tra ngân sách < 0 trước khi xây công trình
        if (activeTool !== 'inspect' && prev.treasury < 0) {
          soundEngine.playError();
          triggerBudgetInsufficientFeedback();
          return {
            ...prev,
            selectedTile: { x, z },
            lastEventBanner:
              'Ngân sách không đủ! Không thể xây công trình khi ngân sách < 0.',
          };
        }

        const res = applyToolToTile(prev, x, z, customTool, false);
        if (res.success) {
          if (res.effectType === 'clearance') {
            soundEngine.playClearance();
            setPulseEventCount((c) => c + 1);
          } else if (res.effectType === 'drainage') {
            soundEngine.playDrainage();
            setPulseEventCount((c) => c + 1);
          } else if (res.effectType === 'build') {
            soundEngine.playBuild();
            setPulseEventCount((c) => c + 1);
          } else {
            soundEngine.playClick();
          }
          const savedAt = saveGameStateToLocalStorage(res.nextState);
          if (savedAt) {
            return { ...res.nextState, lastSavedAt: savedAt };
          }
        } else {
          soundEngine.playError();
          if (res.message.includes('Ngân sách') || prev.treasury < 0) {
            triggerBudgetInsufficientFeedback();
          }
        }
        return res.nextState;
      });
    },
    [triggerBudgetInsufficientFeedback]
  );

  const handleTileClick = useCallback(
    (x: number, z: number) => {
      // Ở chế độ Khảo Sát / Lia Tự Do (inspect), nếu chạm/click vào công trình đã xây thì mở bảng Chi Tiết Nhân Sự & Thuế CIT
      const clickedTile = gameState.grid[z]?.[x];
      if (
        gameState.selectedTool === 'inspect' &&
        clickedTile &&
        (isBuiltStructure(clickedTile.type) || clickedTile.isReservedPublicLand)
      ) {
        soundEngine.playClick();
        setHoverInfo(null);
        setContextMenu({
          x,
          z,
          clientX: Math.max(16, Math.round(window.innerWidth / 2 - 186)),
          clientY: 88,
        });
        setGameState((prev) => ({
          ...prev,
          selectedTile: { x, z },
        }));
        return;
      }

      // Pre-flight Check (evaluatePlacementRisk): Kiểm tra thiếu nhân sự hoặc Upkeep > 15% thu nhập dự kiến trước khi trừ tiền
      if (
        gameState.selectedTool !== 'inspect' &&
        gameState.selectedTool !== 'act_clearance' &&
        gameState.selectedTool !== 'act_reserve_land' &&
        gameState.selectedTool !== 'sub_drainage' &&
        gameState.treasury >= 0
      ) {
        const placeCheck = canPlaceToolAtTile(
          gameState,
          x,
          z,
          gameState.selectedTool,
          false
        );
        if (placeCheck.allowed) {
          const riskEval = evaluatePlacementRisk(
            gameState,
            gameState.selectedTool,
            x,
            z
          );
          if (riskEval.hasRisk) {
            soundEngine.playClick();
            setPendingPlacementRisk({
              x,
              z,
              toolId: gameState.selectedTool,
              risk: riskEval,
            });
            return;
          }
        }
      }

      executeToolOnTile(x, z);
    },
    [executeToolOnTile, gameState]
  );

  const handleTileRightClick = useCallback(
    (x: number, z: number, clientX: number, clientY: number) => {
      soundEngine.playClick();
      setHoverInfo(null);
      setContextMenu({ x, z, clientX, clientY });
      setGameState((prev) => ({
        ...prev,
        selectedTool: 'inspect',
        selectedTile: { x, z },
      }));
    },
    []
  );

  const handleUpdatePolicy = useCallback(
    <K extends keyof MacroPolicies>(key: K, value: MacroPolicies[K]) => {
      soundEngine.playClick();
      setGameState((prev) => {
        const nextPolicies = { ...prev.policies, [key]: value };
        const nextGrid = prev.grid.map((row) =>
          row.map((cell) => ({
            ...cell,
            occupantsByTier: { ...cell.occupantsByTier },
            requiredWorkers: { ...cell.requiredWorkers },
            assignedWorkers: { ...cell.assignedWorkers },
          }))
        );
        const nextMetrics = calculateMacroEconomy(
          nextGrid,
          nextPolicies,
          prev.season,
          prev.activeConcertMonths,
          prev.treasury,
          prev.crisisMonthsElapsed,
          prev.difficulty
        );
        return {
          ...prev,
          grid: nextGrid,
          policies: nextPolicies,
          metrics: nextMetrics,
          bestPci: Math.max(prev.bestPci, nextMetrics.pci),
        };
      });
    },
    []
  );

  const handleExecuteAdvisorAction = useCallback(
    (rec: AdvisorRecommendation) => {
      soundEngine.playClick();
      if (rec.actionType === 'select_tool' && rec.toolId) {
        const matched = TOOLS.find((t) => t.id === rec.toolId);
        if (matched) {
          setDockCategory(matched.category);
          setDockCollapsed(false);
        }
        setGameState((prev) => ({
          ...prev,
          selectedTool: rec.toolId!,
          lastEventBanner: `Trợ Lý Cố Vấn: Đã chọn công cụ "${rec.actionLabel}" — Hãy nhấp vào ô đất hợp lệ trên bản đồ 3D để thi công.`,
        }));
      } else if (
        rec.actionType === 'adjust_policy' &&
        rec.policyKey !== undefined &&
        rec.policyValue !== undefined
      ) {
        handleUpdatePolicy(rec.policyKey, rec.policyValue as never);
        setGameState((prev) => ({
          ...prev,
          lastEventBanner: `Trợ Lý Cố Vấn: Đã áp dụng quyết định "${rec.actionLabel}".`,
        }));
      } else if (rec.actionType === 'open_drawer' && rec.drawerTab) {
        setActivePolicyDrawer(rec.drawerTab);
      }
    },
    [handleUpdatePolicy]
  );

  const handleTriggerConcert = useCallback(() => {
    setGameState((prev) => {
      const res = triggerShowbizConcert(prev);
      if (res.success) {
        soundEngine.playConcert();
        setPulseEventCount((c) => c + 1);
      } else {
        soundEngine.playError();
      }
      return res.nextState;
    });
  }, []);

  const handleAdvanceDayManual = useCallback(() => {
    soundEngine.playClick();
    setGameState((prev) => stepSimulationDay(prev));
  }, []);

  const handleAdvanceMonthManual = useCallback(() => {
    soundEngine.playClick();
    setGameState((prev) => stepSimulationMonth(prev));
  }, []);

  const handleSwitchSeason = useCallback((season: SeasonType) => {
    soundEngine.playClick();
    setGameState((prev) => {
      const nextGrid = prev.grid.map((row) =>
        row.map((cell) => ({
          ...cell,
          occupantsByTier: { ...cell.occupantsByTier },
          requiredWorkers: { ...cell.requiredWorkers },
          assignedWorkers: { ...cell.assignedWorkers },
        }))
      );
      const nextMetrics = calculateMacroEconomy(
        nextGrid,
        prev.policies,
        season,
        prev.activeConcertMonths,
        prev.treasury,
        prev.crisisMonthsElapsed,
        prev.difficulty
      );
      return {
        ...prev,
        season,
        grid: nextGrid,
        metrics: nextMetrics,
        lastEventBanner:
          season === 'high_tide'
            ? `Đang mô phỏng Đỉnh Triều Cường: ${nextMetrics.floodedTileCount} phân khu ngập nước!`
            : season === 'monsoon'
            ? `Đang mô phỏng Mùa Mưa Bão: Kiểm tra hệ thống ống thoát nước ngầm.`
            : 'Thời tiết chuyển sang Mùa Khô nắng ráo.',
      };
    });
  }, []);

  const handleSelectRegion = useCallback((rx: number, rz: number) => {
    setGameState((prev) => {
      const res = selectOrUnlockRegion(prev, rx, rz);
      if (res.error) {
        soundEngine.playError();
        return {
          ...prev,
          lastEventBanner: res.error,
        };
      }
      soundEngine.playBuild();
      setRegionMapOpen(false);
      return res.nextState;
    });
  }, []);

  const handleTakeLoan = useCallback(
    (principal: number, termMonths: 6 | 12) => {
      setGameState((prev) => {
        const res = takeBankLoan(prev, principal, termMonths);
        if (res.success) {
          soundEngine.playBuild();
          const savedAt = saveGameStateToLocalStorage(res.nextState);
          return savedAt ? { ...res.nextState, lastSavedAt: savedAt } : res.nextState;
        }
        soundEngine.playError();
        return res.nextState;
      });
    },
    []
  );

  const handleRepayLoanEarly = useCallback((loanId: string) => {
    setGameState((prev) => {
      const res = repayBankLoanEarly(prev, loanId);
      if (res.success) {
        soundEngine.playClick();
        const savedAt = saveGameStateToLocalStorage(res.nextState);
        return savedAt ? { ...res.nextState, lastSavedAt: savedAt } : res.nextState;
      }
      soundEngine.playError();
      return res.nextState;
    });
  }, []);

  const handleCreateDeposit = useCallback(
    (principal: number, termMonths: 3 | 6) => {
      setGameState((prev) => {
        const res = createBankDeposit(prev, principal, termMonths);
        if (res.success) {
          soundEngine.playBuild();
          const savedAt = saveGameStateToLocalStorage(res.nextState);
          return savedAt ? { ...res.nextState, lastSavedAt: savedAt } : res.nextState;
        }
        soundEngine.playError();
        return res.nextState;
      });
    },
    []
  );

  const handleWithdrawDepositEarly = useCallback((depositId: string) => {
    setGameState((prev) => {
      const res = withdrawDepositEarly(prev, depositId);
      if (res.success) {
        soundEngine.playClick();
        const savedAt = saveGameStateToLocalStorage(res.nextState);
        return savedAt ? { ...res.nextState, lastSavedAt: savedAt } : res.nextState;
      }
      soundEngine.playError();
      return res.nextState;
    });
  }, []);

  const handleUnreservePublicLand = useCallback((x: number, z: number) => {
    setGameState((prev) => {
      const res = unreservePublicLand(prev, x, z);
      if (res.success) {
        soundEngine.playClearance();
        const savedAt = saveGameStateToLocalStorage(res.nextState);
        return savedAt ? { ...res.nextState, lastSavedAt: savedAt } : res.nextState;
      }
      soundEngine.playError();
      return res.nextState;
    });
  }, []);

  const handleMortgageReservedLand = useCallback((x: number, z: number) => {
    setGameState((prev) => {
      const res = mortgageReservedLand(prev, x, z);
      if (res.success) {
        soundEngine.playBuild();
        const savedAt = saveGameStateToLocalStorage(res.nextState);
        return savedAt ? { ...res.nextState, lastSavedAt: savedAt } : res.nextState;
      }
      soundEngine.playError();
      return res.nextState;
    });
  }, []);

  // Chặn lan truyền sự kiện chuột trên thanh HUD để không bị truyền ngược xuống lớp Three.js canvas phía sau
  const stopHudPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setHoverInfo(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(
          document.activeElement.tagName
        )
      ) {
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (pendingPlacementRisk) {
          setPendingPlacementRisk(null);
        } else if (bankModalOpen) {
          setBankModalOpen(false);
        } else if (settlementModalOpen) {
          handleCloseSettlementModal();
        } else if (howToPlayOpen) {
          setHowToPlayOpen(false);
        } else if (regionMapOpen) {
          setRegionMapOpen(false);
        } else if (contextMenu) {
          setContextMenu(null);
        } else if (activePolicyDrawer) {
          setActivePolicyDrawer(null);
        } else if (
          gameState.mode === 'playing' &&
          gameState.selectedTool !== 'inspect'
        ) {
          // Nhấn ESC khi đang chọn công trình: Hủy bỏ Ghost & đưa về con trỏ tự do
          handleReleaseToolToFreePan();
        } else if (gameState.mode === 'playing' || gameState.mode === 'paused') {
          handleTogglePause();
        }
        return;
      }

      if (gameState.mode === 'title' || gameState.mode === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (gameState.mode === 'title') handleStartGame();
          else handleRestartGame();
        }
        return;
      }

      // Phím Shift: Thả công cụ đang dính vào chuột sau khi xây xong để tự do lia map
      if (
        e.key === 'Shift' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        e.preventDefault();
        handleReleaseToolToFreePan();
        return;
      }

      // Chuyển nhanh 4 Tab nhóm công trình bằng F1 - F4
      if (e.code === 'F1') {
        e.preventDefault();
        soundEngine.playClick();
        setDockCategory('road');
        setDockCollapsed(false);
        return;
      }
      if (e.code === 'F2') {
        e.preventDefault();
        soundEngine.playClick();
        setDockCategory('zoning');
        setDockCollapsed(false);
        return;
      }
      if (e.code === 'F3') {
        e.preventDefault();
        soundEngine.playClick();
        setDockCategory('infra');
        setDockCollapsed(false);
        return;
      }
      if (e.code === 'F4') {
        e.preventDefault();
        soundEngine.playClick();
        setDockCategory('special');
        setDockCollapsed(false);
        return;
      }

      // Space hoặc P: Tạm dừng / Tiếp tục
      if (e.code === 'Space' || e.code === 'KeyP') {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (e.code === 'KeyE') {
        e.preventDefault();
        if (!isPolicyUnlockedAtLevel('region_9x9', gameState.cityLevel)) {
          soundEngine.playError();
          setGameState((prev) => ({
            ...prev,
            lastEventBanner: `🔒 ${getPolicyUnlockRequirementLabel('region_9x9')}`,
          }));
          return;
        }
        setRegionMapOpen((v) => !v);
      } else if (e.code === 'Slash') {
        e.preventDefault();
        setHowToPlayOpen((v) => !v);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleRestartGame();
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        soundEngine.playClick();
        setDockCollapsed((c) => !c);
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        soundEngine.playClick();
        setOnboardingCollapsed((c) => !c);
      } else if (e.code === 'KeyT') {
        e.preventDefault();
        setActivePolicyDrawer((prev) =>
          prev === 'economy' ? null : 'economy'
        );
      } else if (e.code === 'KeyG') {
        e.preventDefault();
        setActivePolicyDrawer((prev) =>
          prev === 'traffic' ? null : 'traffic'
        );
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        handleToggleAdvisorHud();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        if (settlementModalOpen) {
          handleCloseSettlementModal();
        } else {
          handleOpenSettlementModal();
        }
      } else if (e.code === 'KeyV') {
        e.preventDefault();
        soundEngine.playClick();
        setDockCategory('special');
        setDockCollapsed(false);
        setGameState((prev) => ({ ...prev, selectedTool: 'sub_drainage' }));
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        handleTriggerConcert();
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        soundEngine.playClick();
        setHeatmapMode((prev) => (prev === 'land_value' ? 'none' : 'land_value'));
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        soundEngine.playClick();
        setBankModalOpen((v) => !v);
      } else if (
        /^Digit[0-9]$/.test(e.code) ||
        /^Numpad[0-9]$/.test(e.code)
      ) {
        // Ánh xạ phím số 1..9, 0 theo đúng thứ tự công trình trong Tab đang mở
        const digitStr = e.code.replace('Digit', '').replace('Numpad', '');
        const slotIndex = digitStr === '0' ? 9 : Number(digitStr) - 1;
        const tabTools = TOOLS.filter((t) => t.category === dockCategory);
        const matchedTool = tabTools[slotIndex];
        if (matchedTool) {
          e.preventDefault();
          if (!isToolUnlockedAtLevel(matchedTool.id, gameState.cityLevel)) {
            soundEngine.playError();
            setGameState((prev) => ({
              ...prev,
              lastEventBanner: `🔒 ${getToolUnlockRequirementLabel(matchedTool.id)}`,
            }));
            return;
          }
          soundEngine.playClick();
          setDockCollapsed(false);
          setGameState((prev) => ({ ...prev, selectedTool: matchedTool.id }));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState.mode,
    gameState.selectedTool,
    gameState.cityLevel,
    dockCategory,
    pendingPlacementRisk,
    bankModalOpen,
    settlementModalOpen,
    howToPlayOpen,
    regionMapOpen,
    contextMenu,
    activePolicyDrawer,
    handleStartGame,
    handleRestartGame,
    handleTogglePause,
    handleToggleMute,
    handleReleaseToolToFreePan,
    handleToggleAdvisorHud,
    handleOpenSettlementModal,
    handleCloseSettlementModal,
    handleTriggerConcert,
  ]);

  const advisorBriefing = generateCityAdvisorBriefing(gameState);
  const currentLevelSpec =
    CITY_LEVEL_SPECS[gameState.cityLevel] ?? CITY_LEVEL_SPECS[1];
  const nextLevelSpec =
    gameState.cityLevel < 5
      ? CITY_LEVEL_SPECS[(gameState.cityLevel + 1) as 2 | 3 | 4 | 5]
      : null;
  const onboardingProgress = evaluateOnboardingProgress(
    gameState.grid,
    gameState.metrics.population,
    gameState.cityLevel,
    gameState.completedQuests
  );
  const activeOnboardingQuest =
    ONBOARDING_QUESTS.find((q) => q.step === onboardingProgress.onboardingStep) ??
    ONBOARDING_QUESTS[ONBOARDING_QUESTS.length - 1];
  const region9x9Unlocked = isPolicyUnlockedAtLevel(
    'region_9x9',
    gameState.cityLevel
  );

  const activeCoords = hoverInfo ?? gameState.selectedTile;
  const activeTile =
    activeCoords &&
    gameState.grid[activeCoords.z] &&
    gameState.grid[activeCoords.z][activeCoords.x]
      ? gameState.grid[activeCoords.z][activeCoords.x]
      : null;

  const activeClearanceInfo = activeTile
    ? calculateLandClearanceCost(
        activeTile,
        gameState.policies.compensationLevel,
        gameState.difficulty
      )
    : null;

  const selectedToolFinancialPreview: BuildingFinancialPreview | null =
    gameState.selectedTool !== 'inspect' &&
    gameState.selectedTool !== 'act_clearance' &&
    gameState.selectedTool !== 'sub_drainage'
      ? getBuildingFinancialPreview(
          gameState.selectedTool,
          gameState.policies,
          gameState.difficulty
        )
      : null;

  const seasonLabel =
    gameState.season === 'dry'
      ? 'Mùa Khô'
      : gameState.season === 'monsoon'
      ? 'Mùa Mưa Bão'
      : 'Đỉnh Triều Cường';

  const pendingPlacementFinancialPreview =
    pendingPlacementRisk &&
    pendingPlacementRisk.toolId !== 'inspect' &&
    pendingPlacementRisk.toolId !== 'act_clearance' &&
    pendingPlacementRisk.toolId !== 'sub_drainage'
      ? getBuildingFinancialPreview(
          pendingPlacementRisk.toolId,
          gameState.policies,
          gameState.difficulty
        )
      : null;

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none bg-[#0c141d]">
      {/* Isolated 3D WebGL Canvas */}
      <CityViewport3D
        gameState={gameState}
        graphicQuality={graphicQuality}
        heatmapMode={heatmapMode}
        onDetectSoftwareGl={handleDetectSoftwareGl}
        onTileClick={handleTileClick}
        onTileRightClick={handleTileRightClick}
        onTileHover={setHoverInfo}
        cameraPresetTrigger={cameraPresetTrigger}
        pulseEventCount={pulseEventCount}
      />

      {/* Lightweight Hover Name Badge (tự ẩn trên thiết bị cảm ứng để không cản trở thao tác vuốt) */}
      {gameState.mode === 'playing' && !isTouchDevice && (
        <BuildingHoverTooltip
          hoverInfo={hoverInfo}
          grid={gameState.grid}
          selectedTool={gameState.selectedTool}
          hasContextMenuOpen={Boolean(contextMenu)}
        />
      )}

      {/* Right-Click / Mobile Tap Building Context Menu (Thanh ngang 3 cột Zero-Scroll) */}
      {gameState.mode === 'playing' && (
        <BuildingContextMenu
          contextMenu={contextMenu}
          gameState={gameState}
          onUpdatePolicy={handleUpdatePolicy}
          onApplyToolOnTile={executeToolOnTile}
          onRenameBuilding={handleRenameBuilding}
          onUnreservePublicLand={handleUnreservePublicLand}
          onMortgageReservedLand={handleMortgageReservedLand}
          onReleaseToPan={handleReleaseToolToFreePan}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Toast thông báo Ngân sách không đủ — Góc dưới bên phải màn hình kèm hiệu ứng fade-in / fade-out */}
      {budgetToast && (
        <div
          role="alert"
          data-testid="budget-toast"
          data-fade-state={budgetToastClosing ? 'out' : 'in'}
          onMouseMove={stopHudPropagation}
          onMouseOver={stopHudPropagation}
          onClick={stopHudPropagation}
          className={`fixed bottom-4 right-4 z-[1100] hud-container rounded-xl border border-rose-400 bg-rose-600/95 px-3.5 py-2 text-xs font-extrabold text-white shadow-2xl flex items-center gap-2 ${
            budgetToastClosing ? 'toast-fade-out' : 'toast-fade-in'
          }`}
        >
          <span>⚠️ {budgetToast}</span>
        </div>
      )}

      {/* Hộp thoại Xác Nhận Rủi Ro Trước Khi Đặt Công Trình (Pre-flight Check — evaluatePlacementRisk) */}
      {gameState.mode === 'playing' && pendingPlacementRisk && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="placement-risk-dialog"
          onMouseMove={stopHudPropagation}
          onMouseOver={stopHudPropagation}
          onClick={stopHudPropagation}
          onPointerDown={stopHudPropagation}
          className="fixed inset-0 z-[1150] flex items-center justify-center bg-[#060c13]/75 p-4 pointer-events-auto"
        >
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-400 bg-[#1a1608]/98 p-4 text-amber-100 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-amber-500/40 pb-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                ⚠️ Cảnh Báo Rủi Ro Vận Hành Trước Khi Xây
              </div>
              <span className="font-mono text-[11px] font-bold text-amber-200">
                Ô ({pendingPlacementRisk.x + 1},{pendingPlacementRisk.z + 1})
              </span>
            </div>

            <p
              data-testid="placement-risk-message"
              className="text-xs text-amber-100 leading-relaxed font-medium"
            >
              {pendingPlacementRisk.risk.warningMessage}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs bg-black/35 rounded-xl p-2.5 border border-amber-500/30">
              <div>
                <div className="text-amber-300/80 text-xs">Nhân sự thiếu hụt:</div>
                <div
                  data-testid="placement-risk-missing-workers"
                  className="font-mono font-extrabold text-amber-200"
                >
                  {pendingPlacementRisk.risk.missingWorkersTotal > 0
                    ? `Thiếu ${pendingPlacementRisk.risk.missingWorkersTotal} người`
                    : 'Đủ nhân sự'}
                </div>
              </div>
              <div>
                <div className="text-amber-300/80 text-xs">Thâm hụt dự kiến/tháng:</div>
                <div
                  data-testid="placement-risk-deficit"
                  className="font-mono font-extrabold text-rose-300"
                >
                  -{formatVnd(pendingPlacementRisk.risk.expectedMonthlyNetDeficit, true)}/tháng
                </div>
              </div>
            </div>

            {pendingPlacementFinancialPreview && (
              <div
                data-testid="placement-risk-5-metrics"
                className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs font-mono bg-[#0b1520]/85 rounded-xl p-2.5 border border-amber-400/30"
              >
                <div>
                  <span className="text-slate-400 font-sans">1. Vốn: </span>
                  <span className="text-amber-300 font-bold">
                    {pendingPlacementFinancialPreview.costLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans">2. Upkeep: </span>
                  <span className="text-rose-300 font-bold">
                    {pendingPlacementFinancialPreview.upkeepLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans">3. Nhân sự: </span>
                  <span className="text-sky-300 font-bold">
                    {pendingPlacementFinancialPreview.workersLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans">4. Kỳ vọng: </span>
                  <span className="text-emerald-300 font-bold">
                    {pendingPlacementFinancialPreview.expectedTaxOrOutputLabel}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <span className="text-slate-400 font-sans">5. Hoàn vốn: </span>
                  <span className="text-cyan-300 font-bold">
                    {pendingPlacementFinancialPreview.paybackLabel}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                data-testid="cancel-risky-build-btn"
                onClick={() => {
                  soundEngine.playClick();
                  setPendingPlacementRisk(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                data-testid="confirm-risky-build-btn"
                onClick={() => {
                  const target = pendingPlacementRisk;
                  setPendingPlacementRisk(null);
                  executeToolOnTile(target.x, target.z, target.toolId);
                }}
                className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold cursor-pointer shadow-lg"
              >
                Vẫn Xây
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playing HUD Overlay (z-index: 1000) — Thích nghi & tự co giãn trên cả Desktop lẫn Mobile */}
      {gameState.mode === 'playing' && (
        <div className="fixed inset-0 hud-overlay-layer z-[1000] pointer-events-none flex flex-col justify-between p-1.5 sm:p-2">
          <div className="w-full flex flex-col gap-1.5 pointer-events-none">
            <TopHudBar
              gameState={gameState}
              currentLevelSpec={currentLevelSpec}
              nextLevelSpec={nextLevelSpec}
              seasonLabel={seasonLabel}
              isTreasuryShaking={isTreasuryShaking}
              region9x9Unlocked={region9x9Unlocked}
              heatmapMode={heatmapMode}
              advisorBriefing={advisorBriefing}
              advisorHudOpen={advisorHudOpen}
              graphicQuality={graphicQuality}
              isMuted={isMuted}
              stopHudPropagation={stopHudPropagation}
              onSwitchSeason={handleSwitchSeason}
              onOpenRegionMap={() => setRegionMapOpen(true)}
              onLockedRegionClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  lastEventBanner: `🔒 ${getPolicyUnlockRequirementLabel('region_9x9')}`,
                }));
              }}
              onToggleHeatmap={() =>
                setHeatmapMode((prev) =>
                  prev === 'land_value' ? 'none' : 'land_value'
                )
              }
              onCycleDayTickInterval={() => {
                const cur = gameState.dayTickIntervalMs || 6000;
                const nextMs = cur === 6000 ? 5000 : cur === 5000 ? 8000 : 6000;
                handleChangeDayTickInterval(nextMs);
              }}
              onOpenSettlementModal={handleOpenSettlementModal}
              onToggleAdvisorHud={handleToggleAdvisorHud}
              onToggleGraphicQuality={handleToggleGraphicQuality}
              onOpenHowToPlay={() => setHowToPlayOpen(true)}
              onAdvanceDayManual={handleAdvanceDayManual}
              onAdvanceMonthManual={handleAdvanceMonthManual}
              onResetCamera={() => setCameraPresetTrigger((c) => c + 1)}
              onToggleMute={handleToggleMute}
              onTogglePause={handleTogglePause}
            />

            <div className="w-full flex items-start justify-between gap-2 pointer-events-none">
              {/* Widget Nhiệm Vụ Tân Thủ 5 Bước (Onboarding Quests) — Nằm trong luồng flex ngay dưới Top HUD nên KHÔNG BAO GIỜ đè lên Top Bar */}
              {!contextMenu && !activePolicyDrawer ? (
                <aside
                  data-testid="onboarding-quest-widget"
                  data-collapsed={onboardingCollapsed ? 'true' : 'false'}
                  onMouseMove={stopHudPropagation}
                  onMouseOver={stopHudPropagation}
                  onClick={stopHudPropagation}
                  onPointerDown={stopHudPropagation}
                  onPointerMove={stopHudPropagation}
                  onPointerUp={stopHudPropagation}
                  className={`z-[1002] hud-container pointer-events-auto rounded-xl border border-amber-400/55 bg-[#0b1520]/94 text-slate-100 shadow-2xl ${
                    onboardingCollapsed
                      ? 'w-auto max-w-[calc(100vw-16px)] px-2 py-1'
                      : 'w-[276px] max-w-[calc(100vw-16px)] p-2.5'
                  }`}
                >
              <div
                className={`flex items-center justify-between gap-2 ${
                  onboardingCollapsed
                    ? ''
                    : 'border-b border-slate-700/80 pb-1.5'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs lg:text-[10px] font-extrabold uppercase tracking-wider text-amber-300 truncate">
                    Nhiệm Vụ ({gameState.completedQuests.length}/
                    {ONBOARDING_QUESTS.length})
                  </div>
                  {!onboardingCollapsed && (
                    <div className="text-xs lg:text-[10px] text-slate-400 truncate">
                      Lv.{gameState.cityLevel} {currentLevelSpec.title}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  data-testid="onboarding-toggle-btn"
                  title="Thu gọn / Mở Nhiệm vụ [Q]"
                  onClick={() => setOnboardingCollapsed((c) => !c)}
                  className="min-h-[40px] lg:min-h-0 px-2.5 lg:px-1.5 py-1 lg:py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs lg:text-[10px] font-bold text-slate-200 cursor-pointer shrink-0"
                >
                  {onboardingCollapsed ? 'Mở [Q]' : 'Thu gọn [Q]'}
                </button>
              </div>

              {!onboardingCollapsed && (
                <div className="mt-2 space-y-1.5 text-[11px]">
                  {/* Thanh tiến trình 5 bước */}
                  <div className="grid grid-cols-5 gap-1">
                    {ONBOARDING_QUESTS.map((q) => {
                      const done = gameState.completedQuests.includes(q.id);
                      const isCurrent =
                        !gameState.onboardingCompleted &&
                        q.step === onboardingProgress.onboardingStep;
                      return (
                        <div
                          key={q.id}
                          data-testid={`quest-step-pill-${q.step}`}
                          className={`rounded py-0.5 text-center font-mono text-[9px] font-bold border ${
                            done
                              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                              : isCurrent
                              ? 'bg-amber-400 text-slate-950 border-white'
                              : 'bg-slate-900/80 border-slate-700 text-slate-500'
                          }`}
                        >
                          {done ? `✓ B${q.step}` : `B${q.step}`}
                        </div>
                      );
                    })}
                  </div>

                  {gameState.onboardingCompleted ? (
                    <div
                      data-testid="onboarding-complete-banner"
                      className="rounded-lg bg-emerald-500/15 border border-emerald-400/50 p-2 text-[11px] text-emerald-200 space-y-1"
                    >
                      <div className="font-extrabold text-emerald-300">
                        🎉 Đã Hoàn Thành 5 Bước Khởi Nghiệp!
                      </div>
                      <p className="text-[10px] text-slate-200 leading-snug">
                        {nextLevelSpec
                          ? `Mục tiêu tiếp theo: Đạt ${nextLevelSpec.minPopulation} dân để thăng cấp Level ${nextLevelSpec.level} (${nextLevelSpec.title}) — Mở khóa: ${nextLevelSpec.unlockSummary}.`
                          : 'Đại đô thị của bạn đã mở khóa toàn bộ công trình và chính sách cấp cao nhất!'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <span
                          data-testid="active-quest-title"
                          className="font-extrabold text-amber-200 truncate"
                        >
                          {activeOnboardingQuest.title}
                        </span>
                        <span
                          data-testid="active-quest-progress"
                          className="font-mono text-[10px] font-bold text-emerald-300 shrink-0"
                        >
                          {onboardingProgress.currentQuestProgress.current}/
                          {onboardingProgress.currentQuestProgress.target}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-200 leading-snug">
                        {activeOnboardingQuest.objective}
                      </p>

                      <div className="rounded bg-[#132334] border border-cyan-500/35 px-2 py-1 text-[10px] text-cyan-200 leading-snug">
                        💡 {activeOnboardingQuest.mechanicExplanation}
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <span className="text-[10px] font-mono text-amber-300 truncate">
                          🎯 Mục tiêu: {onboardingProgress.currentQuestProgress.target}
                        </span>
                        <button
                          type="button"
                          data-testid="onboarding-select-tool-btn"
                          onClick={() => {
                            soundEngine.playClick();
                            if (activeOnboardingQuest.recommendedTool) {
                              const tool = TOOLS.find(
                                (t) => t.id === activeOnboardingQuest.recommendedTool
                              );
                              if (tool) {
                                setDockCategory(tool.category);
                                setGameState((prev) => ({
                                  ...prev,
                                  selectedTool: tool.id,
                                }));
                              }
                            } else {
                              handleAdvanceDayManual();
                            }
                          }}
                          className="px-2 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[10px] cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {activeOnboardingQuest.recommendedTool
                            ? 'Chọn Công Cụ'
                            : '+1 Ngày Chờ Dân'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              </aside>
              ) : (
                <div />
              )}

              {/* Bảng Trợ Lý Cố Vấn Kinh Tế tích hợp trực tiếp trên HUD (Tự động tạm ẩn khi mở MacroPolicyDrawer [T]/[G] để không bao giờ chồng lấn) */}
              {advisorHudOpen && !activePolicyDrawer && (
                <aside
                  data-testid="hud-advisor-panel"
                  onMouseMove={stopHudPropagation}
                  onMouseOver={stopHudPropagation}
                  onClick={stopHudPropagation}
                  onPointerDown={stopHudPropagation}
                  onPointerMove={stopHudPropagation}
                  onPointerUp={stopHudPropagation}
                  onWheel={(e) => e.stopPropagation()}
                  className="hud-container pointer-events-auto ml-auto w-full max-w-[350px] max-h-[46vh] overflow-y-auto custom-scrollbar rounded-xl border border-emerald-400/55 bg-[#0b1520]/95 p-2.5 text-slate-100 shadow-2xl toast-fade-in"
                >
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-700/80">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 flex items-center justify-center shrink-0">
                    {renderMinimalistDockIcon('util_advisor')}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 truncate">
                      Trợ Lý Cố Vấn Kinh Tế · T{advisorBriefing.month}/{advisorBriefing.year}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      Phân tích Quyết Toán &amp; Gợi ý Điều hành
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    data-testid="advisor-health-grade"
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold border ${
                      advisorBriefing.healthGrade === 'Crisis' ||
                      advisorBriefing.healthGrade === 'D'
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                        : advisorBriefing.healthGrade === 'C'
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                        : 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                    }`}
                  >
                    Hạng {advisorBriefing.healthGrade}
                  </span>
                  <button
                    type="button"
                    data-testid="advisor-close-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAdvisorHud();
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] font-bold text-slate-300 cursor-pointer"
                  >
                    Ẩn [C]
                  </button>
                </div>
              </div>

              <div className="mt-2 space-y-1.5">
                <div
                  data-testid="advisor-headline"
                  className="text-xs font-extrabold text-amber-200 leading-snug"
                >
                  {advisorBriefing.headline}
                </div>
                <div
                  data-testid="advisor-financial-summary"
                  className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/80 rounded-lg border border-slate-800 px-2 py-1.5"
                >
                  {advisorBriefing.financialSummary}
                </div>

                {(advisorBriefing.topTaxContributor ||
                  advisorBriefing.heaviestUpkeepEntity) && (
                  <div className="grid grid-cols-1 gap-1 text-[10px]">
                    {advisorBriefing.topTaxContributor && (
                      <div className="rounded-md bg-emerald-950/40 border border-emerald-500/30 px-2 py-1 text-emerald-200 truncate">
                        <span className="font-bold text-emerald-400">Đầu tàu CIT:</span>{' '}
                        {advisorBriefing.topTaxContributor}
                      </div>
                    )}
                    {advisorBriefing.heaviestUpkeepEntity && (
                      <div className="rounded-md bg-rose-950/40 border border-rose-500/30 px-2 py-1 text-rose-200 truncate">
                        <span className="font-bold text-rose-400">Chi phí lớn nhất:</span>{' '}
                        {advisorBriefing.heaviestUpkeepEntity}
                      </div>
                    )}
                  </div>
                )}

                {/* Chẩn đoán nhanh */}
                <div className="space-y-1 pt-0.5">
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                    Chẩn Đoán Vĩ Mô ({advisorBriefing.diagnostics.length})
                  </div>
                  {advisorBriefing.diagnostics.map((diag, idx) => (
                    <div
                      key={idx}
                      className="text-[10px] leading-snug text-slate-200 bg-slate-900/60 rounded px-2 py-1 border-l-2 border-amber-400"
                    >
                      {diag}
                    </div>
                  ))}
                </div>

                {/* Gợi ý hành động để người chơi quyết định */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-300">
                    Đề Xuất Hành Động Cho Thị Trưởng ({advisorBriefing.recommendations.length})
                  </div>
                  {advisorBriefing.recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      data-testid={`advisor-rec-${rec.id}`}
                      className={`rounded-lg border p-2 space-y-1 ${
                        rec.priority === 'urgent'
                          ? 'bg-rose-950/35 border-rose-500/50'
                          : rec.priority === 'high'
                          ? 'bg-amber-950/25 border-amber-500/40'
                          : 'bg-slate-900/75 border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-extrabold text-white">
                          {rec.title}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                            rec.priority === 'urgent'
                              ? 'bg-rose-500/30 text-rose-200'
                              : rec.priority === 'high'
                              ? 'bg-amber-500/30 text-amber-200'
                              : 'bg-emerald-500/25 text-emerald-200'
                          }`}
                        >
                          {rec.priority === 'urgent'
                            ? 'Khẩn cấp'
                            : rec.priority === 'high'
                            ? 'Ưu tiên'
                            : 'Cơ hội'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-snug">
                        {rec.analysis}
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          data-testid={`advisor-action-${rec.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExecuteAdvisorAction(rec);
                          }}
                          className="px-2 py-1 rounded-md bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-[10px] cursor-pointer whitespace-nowrap shrink-0 shadow"
                        >
                          {rec.actionLabel}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
                </aside>
              )}
            </div>
          </div>

          {/* Macro Policy Drawer (nằm phía trên thanh Icon Dock khi được bật bằng [T] hoặc [G], giới hạn max-w-[calc(100vw-380px)] khi Cố vấn đang mở) */}
          <div
            className={`fixed bottom-[64px] left-1/2 -translate-x-1/2 z-[1050] w-full px-2 pointer-events-none flex flex-col items-center ${
              advisorHudOpen
                ? 'max-w-[min(820px,calc(100vw-380px))]'
                : 'max-w-[min(820px,96vw)]'
            }`}
          >
            <MacroPolicyDrawer
              activeTab={activePolicyDrawer}
              policies={gameState.policies}
              metrics={gameState.metrics}
              activeConcertMonths={gameState.activeConcertMonths}
              cityLevel={gameState.cityLevel}
              onUpdatePolicy={handleUpdatePolicy}
              onTriggerConcert={handleTriggerConcert}
              onClose={() => setActivePolicyDrawer(null)}
            />
          </div>

          <BottomBuildDock
            gameState={gameState}
            dockCategory={dockCategory}
            setDockCategory={setDockCategory}
            dockCollapsed={dockCollapsed}
            setDockCollapsed={setDockCollapsed}
            activePolicyDrawer={activePolicyDrawer}
            setActivePolicyDrawer={setActivePolicyDrawer}
            heatmapMode={heatmapMode}
            setHeatmapMode={setHeatmapMode}
            advisorHudOpen={advisorHudOpen}
            advisorBriefing={advisorBriefing}
            bankModalOpen={bankModalOpen}
            setBankModalOpen={setBankModalOpen}
            settlementModalOpen={settlementModalOpen}
            hoveredDockTooltip={hoveredDockTooltip}
            setHoveredDockTooltip={setHoveredDockTooltip}
            selectedToolFinancialPreview={selectedToolFinancialPreview}
            activeClearanceInfo={activeClearanceInfo}
            isTouchDevice={isTouchDevice || isCompactViewport}
            stopHudPropagation={stopHudPropagation}
            onSelectTool={(toolId) =>
              setGameState((prev) => ({
                ...prev,
                selectedTool: toolId,
              }))
            }
            onLockedToolClick={(lockMessage) =>
              setGameState((prev) => ({
                ...prev,
                lastEventBanner: lockMessage,
              }))
            }
            onOpenSettlementModal={handleOpenSettlementModal}
            onCloseSettlementModal={handleCloseSettlementModal}
            onToggleAdvisorHud={handleToggleAdvisorHud}
            onReleaseToolToFreePan={handleReleaseToolToFreePan}
          />
        </div>
      )}

      {/* Bảng Báo Cáo Quyết Toán Tài Chính Cuối Tháng (Chỉ mở khi người chơi bấm vào Biểu tượng Thông báo Báo Cáo (!) hoặc phím [B]) */}
      <MonthlySettlementModal
        open={settlementModalOpen}
        gameState={gameState}
        onClose={handleCloseSettlementModal}
      />

      {/* Ngân Hàng Đô Thị: Vay Vốn Đầu Tư & Gửi Tiết Kiệm [K] */}
      <BankModal
        open={bankModalOpen}
        gameState={gameState}
        onTakeLoan={handleTakeLoan}
        onRepayLoanEarly={handleRepayLoanEarly}
        onCreateDeposit={handleCreateDeposit}
        onWithdrawDepositEarly={handleWithdrawDepositEarly}
        onClose={() => setBankModalOpen(false)}
      />

      {/* How to Play & Auto-Save Settings Modal */}
      <HowToPlayModal
        open={howToPlayOpen}
        lastSavedAt={gameState.lastSavedAt}
        onClearAutoSave={handleClearAutoSave}
        onClose={() => setHowToPlayOpen(false)}
      />

      {/* 9x9 Regional Expansion Map Modal */}
      <RegionMap9x9Modal
        open={regionMapOpen}
        gameState={gameState}
        onSelectRegion={handleSelectRegion}
        onClose={() => setRegionMapOpen(false)}
      />

      {/* Title, Pause & Outcome Modals */}
      <GameModals
        mode={gameState.mode}
        snapshot={gameState.snapshot}
        bestPci={gameState.bestPci}
        lastSavedAt={gameState.lastSavedAt}
        hasSavedSession={
          hasPlayerActuallyPlayed({ ...gameState, mode: 'playing' }) ||
          Boolean(loadGameStateFromLocalStorage())
        }
        difficulty={gameState.difficulty}
        onSelectDifficulty={handleSelectDifficulty}
        onStartGame={handleStartGame}
        onContinueSavedSession={handleContinueSavedSession}
        onOpenHowToPlay={() => setHowToPlayOpen(true)}
        onResumeGame={handleTogglePause}
        onRestartGame={handleRestartGame}
        onReturnTitle={handleReturnTitle}
        onContinueEndless={handleContinueEndless}
      />
    </main>
  );
}
