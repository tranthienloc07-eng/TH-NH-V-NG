import React, { useCallback, useEffect, useState } from 'react';
import {
  CityViewport3D,
  GraphicQuality,
  HeatmapMode,
  HoverTileInfo,
} from './components/CityViewport3D';
import { BankModal } from './components/BankModal';
import { GameModals } from './components/GameModals';
import { MacroPolicyDrawer } from './components/MacroPolicyDrawer';
import {
  BuildingContextMenu,
  BuildingHoverTooltip,
  HowToPlayModal,
  MonthlySettlementModal,
  RegionMap9x9Modal,
} from './components/OverlaysAndGuides';
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
  getRegionName,
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

function renderMinimalistDockIcon(iconId: string): React.ReactNode {
  switch (iconId) {
    // Category tabs
    case 'cat_road':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19L8 5M16 5l4 14M12 6v2M12 11v2M12 16v2" />
        </svg>
      );
    case 'cat_zoning':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'cat_infra':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M12 9v4M10 11h4" />
        </svg>
      );
    case 'cat_special':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );

    // Road tools
    case 'road_alley':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 20L10 4M14 4l3 16M12 10v4" />
        </svg>
      );
    case 'road_urban':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20L7 4M17 4l3 16M12 5v3M12 11v3M12 17v2" />
        </svg>
      );
    case 'road_highway':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20L5 4M19 4l3 16M9 4v16M15 4v16M12 6v3M12 14v3" />
        </svg>
      );
    case 'road_ring':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );

    // Zoning tools
    case 'res_low':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z" />
          <path d="M9 21V13h6v8" />
        </svg>
      );
    case 'res_mid':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="4" width="14" height="17" rx="1" />
          <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" />
        </svg>
      );
    case 'res_high':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 21V3h12v18M3 21h18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
        </svg>
      );
    case 'com_market':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l2-5h14l2 5M3 9c0 1.66 1.34 3 3 3s3-1.34 3-3c0 1.66 1.34 3 3 3s3-1.34 3-3c0 1.66 1.34 3 3 3s3-1.34 3-3M5 12v8h14v-8" />
        </svg>
      );
    case 'com_mall':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'agr_farm':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V8M12 14c-3.5 0-6-2.5-6-6 3.5 0 6 2.5 6 6zM12 11c3.5 0 6-2.5 6-6-3.5 0-6 2.5-6 6zM4 20h16" />
        </svg>
      );
    case 'ind_factory':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20h20V9l-6 4V9l-6 4V4H4v16z" />
        </svg>
      );
    case 'ind_fdi':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
    case 'com_office':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M9 6h6M9 10h6M9 14h6M10 22v-4h4v4" />
        </svg>
      );
    case 'ind_food':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20h18V10l-5-4H8l-5 4v10z" />
          <path d="M9 14h6M12 11v6" />
        </svg>
      );

    // Infra tools
    case 'pub_admin':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M12 3l9 5H3l9-5z" />
        </svg>
      );
    case 'pub_edu_med':
    case 'pub_hospital':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'priv_hospital':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          <path d="M12 8v6M9 11h6" />
        </svg>
      );
    case 'pub_school':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      );
    case 'priv_school':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18" />
        </svg>
      );
    case 'pub_security':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'util_power_water':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'showbiz_stadium':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );

    // Special tools
    case 'sub_drainage':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );
    case 'act_clearance':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'act_reserve_land':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );

    // Utility & Policy icons
    case 'util_bank':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M2 18h20M12 3l9 5H3l9-5z" />
        </svg>
      );
    case 'util_economy':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'util_traffic':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="3" />
          <circle cx="12" cy="7" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="17" r="1.5" />
        </svg>
      );
    case 'util_ledger':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      );
    case 'util_inspect':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'util_collapse':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );
    case 'util_advisor':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 2 2.83V11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9.83A3 3 0 0 1 8 7V6a4 4 0 0 1 4-4z" />
          <path d="M9 17h6M10 21h4M12 13v4" />
        </svg>
      );
    case 'util_expand':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
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

  // Mặc định mở tab 'road' đầu tiên để người chơi dễ dàng xây đường nối liền ngay từ đầu
  const [dockCategory, setDockCategory] = useState<
    'road' | 'zoning' | 'infra' | 'special'
  >('road');
  const [activePolicyDrawer, setActivePolicyDrawer] = useState<
    'economy' | 'traffic' | null
  >(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [onboardingCollapsed, setOnboardingCollapsed] = useState(false);
  const [hoveredDockTooltip, setHoveredDockTooltip] = useState<{
    title: string;
    shortcut: string;
    meta?: string;
    financialPreview?: BuildingFinancialPreview;
  } | null>(null);
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
  const [graphicQuality, setGraphicQuality] = useState<GraphicQuality>('high');
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

  // Mỗi cuối tháng khi có Báo Cáo Quyết Toán mới, Trợ Lý Cố Vấn Kinh Tế đồng thời tự động xuất hiện ngay trên thanh HUD (không dùng pop-up che màn hình)
  useEffect(() => {
    const reportId = gameState.latestSettlementReport?.id ?? null;
    if (reportId && reportId !== lastAutoAdvisorReportId) {
      setLastAutoAdvisorReportId(reportId);
      setAdvisorHudOpen(true);
      soundEngine.playAdvisorAlert();
    }
  }, [gameState.latestSettlementReport?.id, lastAutoAdvisorReportId]);

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

  const filteredTools = TOOLS.filter((t) => t.category === dockCategory);

  const seasonLabel =
    gameState.season === 'dry'
      ? 'Mùa Khô'
      : gameState.season === 'monsoon'
      ? 'Mùa Mưa Bão'
      : 'Đỉnh Triều Cường';

  const categoryTabs: {
    id: typeof dockCategory;
    iconId: string;
    title: string;
    shortcut: string;
    tabKey: string;
  }[] = [
    {
      id: 'road',
      iconId: 'cat_road',
      title: 'Giao Thông & Đường',
      shortcut: 'F1 · 1-4',
      tabKey: 'F1',
    },
    {
      id: 'zoning',
      iconId: 'cat_zoning',
      title: 'Phân Lô Dân Cư & KT',
      shortcut: 'F2 · 1-0',
      tabKey: 'F2',
    },
    {
      id: 'infra',
      iconId: 'cat_infra',
      title: 'Hạ Tầng Công & Tư',
      shortcut: 'F3 · 1-8',
      tabKey: 'F3',
    },
    {
      id: 'special',
      iconId: 'cat_special',
      title: 'Giải Tỏa, Cống & Quỹ Đất',
      shortcut: 'F4 · 1-3',
      tabKey: 'F4',
    },
  ];

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

      {/* Lightweight Hover Name Badge (hiện [InstanceID], CustomName, cảnh báo va chạm đỏ rực, sức chứa 0/MaxCapacity) */}
      {gameState.mode === 'playing' && (
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

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-black/35 rounded-xl p-2.5 border border-amber-500/30">
              <div>
                <div className="text-amber-300/80 text-[10px]">Nhân sự thiếu hụt:</div>
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
                <div className="text-amber-300/80 text-[10px]">Thâm hụt dự kiến/tháng:</div>
                <div
                  data-testid="placement-risk-deficit"
                  className="font-mono font-extrabold text-rose-300"
                >
                  -{formatVnd(pendingPlacementRisk.risk.expectedMonthlyNetDeficit, true)}/tháng
                </div>
              </div>
            </div>

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
          <div className="w-full flex flex-wrap items-start justify-between gap-1">
            {/* Top-Left Cluster (.top-bar .hud-container) */}
            <div
              onMouseMove={stopHudPropagation}
              onMouseOver={stopHudPropagation}
              onClick={stopHudPropagation}
              onPointerDown={stopHudPropagation}
              onPointerMove={stopHudPropagation}
              onPointerUp={stopHudPropagation}
              onContextMenu={(e) => {
                e.preventDefault();
                stopHudPropagation(e);
              }}
              className="top-bar hud-container pointer-events-auto max-w-full flex flex-wrap items-center justify-start gap-1.5 text-xs rounded-lg border border-amber-500/35 bg-[#0d1722]/94 px-1.5 py-1 shadow-xl"
            >
              <div className="pr-1.5 border-r border-slate-700/80 shrink-0">
                <div className="flex items-center gap-1">
                  <span
                    data-testid="hud-city-level"
                    title={
                      nextLevelSpec
                        ? `${getRegionName(
                            gameState.activeRegion.rx,
                            gameState.activeRegion.rz
                          )} — Cấp hiện tại: Level ${currentLevelSpec.level} (${currentLevelSpec.title}). Lên Level ${nextLevelSpec.level} khi đạt ${nextLevelSpec.minPopulation} dân (${nextLevelSpec.unlockSummary})`
                        : `${getRegionName(
                            gameState.activeRegion.rx,
                            gameState.activeRegion.rz
                          )} — Đã đạt cấp tối đa: Level 5 (${currentLevelSpec.title})`
                    }
                    className="rounded bg-amber-400/20 border border-amber-400/60 px-1 py-0 text-[8px] leading-tight font-mono font-extrabold text-amber-200 whitespace-nowrap"
                  >
                    Lv.{gameState.cityLevel} {currentLevelSpec.title}
                  </span>
                </div>
                <div
                  data-testid="hud-date"
                  title="Chu kỳ 3 mùa: Mùa Khô · Mùa Mưa Bão · Đỉnh Triều Cường (Bấm vào tên mùa để chuyển thử nghiệm)"
                  className="text-[10px] leading-tight font-mono tabular-nums font-bold text-slate-100 whitespace-nowrap flex items-center gap-1 mt-0.5"
                >
                  <span>
                    N{gameState.day}/30·T{gameState.month}/{gameState.year}
                  </span>
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid="hud-season-badge"
                    title="Chu kỳ 3 mùa: Mùa Khô · Mùa Mưa Bão · Đỉnh Triều Cường"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.blur();
                      const nextSeason: SeasonType =
                        gameState.season === 'dry'
                          ? 'monsoon'
                          : gameState.season === 'monsoon'
                          ? 'high_tide'
                          : 'dry';
                      handleSwitchSeason(nextSeason);
                    }}
                    className="rounded bg-cyan-500/20 border border-cyan-400/40 px-1 py-0 text-[9px] leading-tight font-bold text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    {seasonLabel}
                  </button>
                </div>
              </div>

              <div
                data-testid="hud-treasury-card"
                className={`rounded-md px-0.5 py-0.5 transition-colors shrink-0 ${
                  isTreasuryShaking
                    ? 'hud-budget-shake bg-rose-500/25 border border-rose-400/70'
                    : ''
                }`}
              >
                <div className="text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
                  Ngân Sách ({gameState.metrics.netBalance >= 0 ? '+' : ''}
                  {Number(gameState.metrics.netBalance.toFixed(2))}B/th)
                </div>
                <div
                  data-testid="hud-treasury"
                  className={`hero-numeral text-xs leading-tight font-extrabold whitespace-nowrap ${
                    gameState.treasury < 0 ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  {formatVnd(gameState.treasury, true)}
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
                  Dân / Chỗ Ở
                </div>
                <div
                  data-testid="hud-population"
                  className="hero-numeral text-xs leading-tight font-extrabold text-emerald-300 whitespace-nowrap"
                >
                  {gameState.metrics.population.toLocaleString('vi-VN')}/
                  {gameState.metrics.housingCapacity.toLocaleString('vi-VN')}
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
                  Việc Làm
                </div>
                <div
                  data-testid="hud-jobs"
                  className="hero-numeral text-xs leading-tight font-extrabold text-cyan-300 whitespace-nowrap"
                >
                  {gameState.metrics.labor.totalEmployed}/
                  {gameState.metrics.labor.totalJobSlots}
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
                  PCI · Tốc Độ
                </div>
                <div
                  data-testid="hud-pci"
                  className="hero-numeral text-xs leading-tight font-extrabold text-sky-300 whitespace-nowrap"
                >
                  {Math.round(gameState.metrics.pci)}/100·
                  {Math.round(gameState.metrics.trafficSpeedIndex)}%
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
                  Hạnh Phúc · AS
                </div>
                <div
                  data-testid="hud-happiness-stability"
                  className={`hero-numeral text-xs leading-tight font-extrabold whitespace-nowrap ${
                    gameState.isCrisis ||
                    gameState.metrics.happiness < 35 ||
                    gameState.metrics.socialStability < 25
                      ? 'text-rose-400'
                      : 'text-amber-200'
                  }`}
                >
                  {Math.round(gameState.metrics.happiness)}%·
                  {Math.round(gameState.metrics.socialStability)}%
                </div>
              </div>

              {gameState.isCrisis && (
                <div
                  data-testid="hud-crisis-status"
                  className="rounded-md border border-rose-400 bg-rose-500/25 px-1.5 py-0.5 text-rose-100 shrink-0"
                >
                  <div className="text-[8px] leading-tight font-extrabold uppercase tracking-tight text-rose-300 whitespace-nowrap">
                    Khủng Hoảng ({gameState.crisisTimer}T)
                  </div>
                  <div className="text-[9px] leading-tight font-mono font-bold whitespace-nowrap">
                    PCI -{gameState.crisisMonthsElapsed * 5} · Di cư +
                    {gameState.metrics.emigrationRatePercent}%
                  </div>
                </div>
              )}
            </div>

            {/* Top-Right Cluster (.top-bar .hud-container): Gọn gàng 1 hàng ở 1280px, tự flex-wrap nếu hẹp hơn */}
            <div
              onMouseMove={stopHudPropagation}
              onMouseOver={stopHudPropagation}
              onClick={stopHudPropagation}
              onPointerDown={stopHudPropagation}
              onPointerMove={stopHudPropagation}
              onPointerUp={stopHudPropagation}
              onContextMenu={(e) => {
                e.preventDefault();
                stopHudPropagation(e);
              }}
              className="top-bar hud-container pointer-events-auto ml-auto max-w-full flex flex-wrap items-center justify-end gap-1 rounded-lg border border-slate-700/80 bg-[#0d1722]/94 px-1.5 py-1 shadow-xl"
            >
              <button
                type="button"
                tabIndex={-1}
                data-testid="region-9x9-btn"
                data-locked={!region9x9Unlocked ? 'true' : 'false'}
                title={
                  region9x9Unlocked
                    ? 'Bản đồ Mở rộng Vùng Đô thị 9×9 [E]'
                    : `🔒 ${getPolicyUnlockRequirementLabel('region_9x9')}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  if (!region9x9Unlocked) {
                    soundEngine.playError();
                    setGameState((prev) => ({
                      ...prev,
                      lastEventBanner: `🔒 ${getPolicyUnlockRequirementLabel('region_9x9')}`,
                    }));
                    return;
                  }
                  soundEngine.playClick();
                  setRegionMapOpen(true);
                }}
                className={`px-1.5 py-0.5 rounded-md font-bold text-[11px] whitespace-nowrap shrink-0 border ${
                  !region9x9Unlocked
                    ? 'bg-slate-900/80 text-slate-400 border-slate-700 cursor-not-allowed'
                    : gameState.metrics.canExpandRegion
                    ? 'bg-amber-400 text-slate-950 border-white shadow-md cursor-pointer'
                    : 'bg-[#152536] text-amber-300 border-amber-500/40 hover:bg-[#1c3148] cursor-pointer'
                }`}
              >
                🗺 9×9 ({gameState.unlockedRegions.length}/81)
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="heatmap-land-value-btn"
                title="Bật/Tắt Bản đồ nhiệt Giá đất [L]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  soundEngine.playClick();
                  setHeatmapMode((prev) =>
                    prev === 'land_value' ? 'none' : 'land_value'
                  );
                }}
                className={`px-1.5 py-0.5 rounded-md font-bold text-[11px] whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                  heatmapMode === 'land_value'
                    ? 'bg-orange-400 text-slate-950 border-white shadow-md'
                    : 'bg-[#152536] text-orange-200 border-orange-400/45 hover:bg-[#1c3148]'
                }`}
              >
                🗺 Giá đất [L]
              </button>

              {/* Nút xoay vòng nhịp độ thời gian: 6s → 5s → 8s → 6s */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-day-tick-selector"
                title="Nhịp độ thời gian (Bấm để chuyển vòng: 6s/N → 5s/N → 8s/N)"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  const cur = gameState.dayTickIntervalMs || 6000;
                  const nextMs = cur === 6000 ? 5000 : cur === 5000 ? 8000 : 6000;
                  handleChangeDayTickInterval(nextMs);
                }}
                className="px-1.5 py-0.5 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-amber-400/50 text-[11px] font-mono font-bold text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
              >
                ⏱ {Math.round((gameState.dayTickIntervalMs || 6000) / 1000)}s/N
              </button>

              {/* Biểu tượng Thông báo Báo Cáo Quyết Toán Tài Chính kèm Chấm đỏ cảnh báo (!) */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="settlement-notification-btn"
                title="Báo cáo Quyết toán Tài chính cuối tháng [B]"
                aria-label="Thông báo Báo cáo Quyết toán Tài chính cuối tháng [B]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleOpenSettlementModal();
                }}
                className={`relative px-1.5 py-0.5 rounded-md border font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 transition-all ${
                  gameState.hasUnreadSettlement
                    ? 'bg-amber-500/30 hover:bg-amber-500/40 text-amber-100 border-amber-400 shadow-lg ring-1 ring-rose-400/80'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/50'
                }`}
              >
                <span>Báo Cáo [{gameState.globalLedger.length}]</span>
                {gameState.hasUnreadSettlement && (
                  <span
                    data-testid="settlement-unread-badge"
                    aria-label="Có báo cáo quyết toán cuối tháng mới"
                    className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 border border-white text-[10px] leading-none font-extrabold text-white flex items-center justify-center shadow-md"
                  >
                    !
                  </span>
                )}
              </button>

              {/* Icon Trợ Lý Cố Vấn Kinh Tế trên HUD (Đồng bộ nhãn [C] với nút Ẩn [C]) */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-advisor-btn"
                data-grade={advisorBriefing.healthGrade}
                title={`Trợ Lý Cố Vấn Kinh Tế (Hạng ${advisorBriefing.healthGrade}) [C]`}
                aria-label="Trợ Lý Cố Vấn Kinh Tế [C]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleToggleAdvisorHud();
                }}
                className={`relative px-1.5 py-0.5 rounded-md border font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 transition-all ${
                  advisorHudOpen
                    ? 'bg-emerald-400 text-slate-950 border-white shadow-md'
                    : gameState.hasUnreadSettlement
                    ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border-emerald-400 shadow-lg'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                }`}
              >
                <span>Cố Vấn [C]</span>
                {gameState.hasUnreadSettlement && !advisorHudOpen && (
                  <span
                    data-testid="advisor-unread-badge"
                    className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 border border-white text-[10px] leading-none font-extrabold text-slate-950 flex items-center justify-center shadow-md"
                  >
                    {advisorBriefing.recommendations.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="graphic-quality-btn"
                title="Chuyển đổi Chất lượng Đồ họa 3D: Tả thực (Water Shader, Bloom, Đèn phố PBR) hoặc Mượt (Tối ưu FPS)"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleToggleGraphicQuality();
                }}
                className={`px-1.5 py-0.5 rounded-md border font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  graphicQuality === 'high'
                    ? 'bg-indigo-500/25 hover:bg-indigo-500/35 text-indigo-200 border-indigo-400/60'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
                }`}
              >
                {graphicQuality === 'high' ? '✨ Tả thực' : '⚡ Mượt'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-howtoplay-btn"
                title="Hướng dẫn [?]"
                aria-label="Hướng dẫn [?]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  soundEngine.playClick();
                  setHowToPlayOpen(true);
                }}
                className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-extrabold text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                ?
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-advance-day-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleAdvanceDayManual();
                }}
                className="px-1.5 py-0.5 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                +1 Ngày
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-advance-month-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleAdvanceMonthManual();
                }}
                className="px-1.5 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                +1 Tháng
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Đặt lại góc nhìn Camera"
                title="Đặt lại góc nhìn Camera"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  setCameraPresetTrigger((c) => c + 1);
                }}
                className="px-1.5 py-0.5 shrink-0 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] cursor-pointer whitespace-nowrap"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                  <path d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6 0 2.97-2.17 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93 0-4.42-3.58-8-8-8zm-6 8c0-1.65.67-3.15 1.76-4.24L6.34 7.34C4.9 8.79 4 10.79 4 13c0 4.08 3.05 7.44 7 7.93v-2.02c-2.83-.48-5-2.94-5-5.91z" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-mute-btn"
                aria-label={isMuted ? 'Bật âm thanh [M]' : 'Tắt âm thanh [M]'}
                title={isMuted ? 'Bật âm thanh [M]' : 'Tắt âm thanh [M]'}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleToggleMute();
                }}
                className="px-1.5 py-0.5 shrink-0 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] cursor-pointer whitespace-nowrap"
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current text-rose-400">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current text-amber-300">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-pause-btn"
                aria-label="Tạm dừng [Space / P]"
                title="Tạm dừng [Space / P]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleTogglePause();
                }}
                className="px-1.5 py-0.5 shrink-0 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] cursor-pointer whitespace-nowrap"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Widget Nhiệm Vụ Tân Thủ 5 Bước (Onboarding Quests) — Nằm gọn bên trái, tự ẩn khi mở BuildingContextMenu để không bao giờ đè lên Top Bar hay Bottom Dock */}
          {!contextMenu && !activePolicyDrawer && (
            <aside
              data-testid="onboarding-quest-widget"
              onMouseMove={stopHudPropagation}
              onMouseOver={stopHudPropagation}
              onClick={stopHudPropagation}
              onPointerDown={stopHudPropagation}
              onPointerMove={stopHudPropagation}
              onPointerUp={stopHudPropagation}
              className="fixed top-[56px] left-2 z-[1002] hud-container pointer-events-auto w-[276px] max-w-[calc(100vw-16px)] rounded-xl border border-amber-400/55 bg-[#0b1520]/94 p-2.5 text-slate-100 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-1.5 border-b border-slate-700/80 pb-1.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 truncate">
                    Nhiệm Vụ Khởi Nghiệp ({gameState.completedQuests.length}/
                    {ONBOARDING_QUESTS.length})
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Lv.{gameState.cityLevel} {currentLevelSpec.title}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="onboarding-toggle-btn"
                  title="Thu gọn / Mở Nhiệm vụ [Q]"
                  onClick={() => setOnboardingCollapsed((c) => !c)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] font-bold text-slate-200 cursor-pointer shrink-0"
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
              className="hud-container pointer-events-auto self-end mt-1 mb-14 w-full max-w-[350px] max-h-[46vh] overflow-y-auto custom-scrollbar rounded-xl border border-emerald-400/55 bg-[#0b1520]/95 p-2.5 text-slate-100 shadow-2xl toast-fade-in"
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

          {/* Xếp tầng Flex dọc (flex-col) chung cho Chú thích Heatmap [L], Hộp 5 chỉ số tài chính và Thanh tên công trình ngay phía trên Bottom Icon Dock:
              - Chung 1 container flex-col items-center gap-1.5 nên KHÔNG BAO GIỜ đè lên nhau
              - Tự động thu gọn & dịch vùng an toàn sang trái khi bảng Cố vấn (AdvisorHud) đang mở ở cạnh phải trên màn hình 1280x720 */}
          {!activePolicyDrawer &&
            (heatmapMode === 'land_value' ||
              (!dockCollapsed &&
                (hoveredDockTooltip || selectedToolFinancialPreview))) && (
              <div
                data-testid="bottom-hud-tooltip-stack"
                className={`fixed bottom-[62px] z-[1045] pointer-events-none flex flex-col items-center gap-1.5 px-2 transition-all ${
                  advisorHudOpen
                    ? 'left-1/2 -translate-x-1/2 lg:left-[calc((100vw-370px)/2)] w-full max-w-[min(760px,92vw)] lg:max-w-[min(720px,calc(100vw-390px))]'
                    : 'left-1/2 -translate-x-1/2 w-full max-w-[min(760px,92vw)]'
                }`}
              >
                {/* Thanh Chú Thích Bản Đồ Nhiệt Giá Đất (xếp gọn trên cùng trong flex-col, không bao giờ đè lên hộp 5 chỉ số) */}
                {heatmapMode === 'land_value' && (
                  <div
                    data-testid="land-value-heatmap-legend"
                    onMouseMove={stopHudPropagation}
                    onMouseOver={stopHudPropagation}
                    onClick={stopHudPropagation}
                    className="hud-container pointer-events-auto w-fit max-w-full rounded-lg border border-orange-400/60 bg-[#0b1520]/95 px-2.5 py-1 shadow-2xl flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-100"
                  >
                    <span className="font-extrabold text-orange-300 whitespace-nowrap">
                      🗺 Giá đất [L]:
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 border border-slate-300/50" />
                      &lt;1 Tỷ (Xám)
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-200/60" />
                      1–5 Tỷ (Xanh)
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 border border-amber-100/60" />
                      5–15 Tỷ (Vàng)
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-sm bg-orange-600 border border-orange-200/60" />
                      &gt;15 Tỷ (Đỏ cam)
                    </span>
                    <button
                      type="button"
                      aria-label="Tắt bản đồ nhiệt giá đất"
                      onClick={() => {
                        soundEngine.playClick();
                        setHeatmapMode('none');
                      }}
                      className="ml-0.5 px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Tầng giữa: Hộp 5 chỉ số tài chính (1. Vốn | 2. Upkeep | 3. Nhân sự | 4. Kỳ vọng | 5. Hoàn vốn) */}
                {!dockCollapsed &&
                  (hoveredDockTooltip?.financialPreview ??
                    selectedToolFinancialPreview) && (
                  <div
                    data-testid="build-financial-preview-bar"
                    className="w-fit max-w-full rounded-xl border border-amber-400/60 bg-[#09131e]/96 px-3 py-1.5 shadow-2xl flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-mono"
                  >
                    {(() => {
                      const fp =
                        hoveredDockTooltip?.financialPreview ??
                        selectedToolFinancialPreview!;
                      return (
                        <>
                          <span className="whitespace-nowrap">
                            <strong className="text-slate-400 font-sans">
                              1. Vốn:
                            </strong>{' '}
                            <span className="text-amber-300 font-bold">
                              {fp.costLabel}
                            </span>
                          </span>
                          <span className="text-slate-700">|</span>
                          <span className="whitespace-nowrap">
                            <strong className="text-slate-400 font-sans">
                              2. Upkeep:
                            </strong>{' '}
                            <span className="text-rose-300 font-bold">
                              {fp.upkeepLabel}
                            </span>
                          </span>
                          <span className="text-slate-700">|</span>
                          <span className="whitespace-nowrap">
                            <strong className="text-slate-400 font-sans">
                              3. Nhân sự:
                            </strong>{' '}
                            <span className="text-sky-300 font-bold">
                              {fp.workersLabel}
                            </span>
                          </span>
                          <span className="text-slate-700">|</span>
                          <span className="whitespace-nowrap">
                            <strong className="text-slate-400 font-sans">
                              4. Kỳ vọng:
                            </strong>{' '}
                            <span className="text-emerald-300 font-bold">
                              {fp.expectedTaxOrOutputLabel}
                            </span>
                          </span>
                          <span className="text-slate-700">|</span>
                          <span className="whitespace-nowrap">
                            <strong className="text-slate-400 font-sans">
                              5. Hoàn vốn:
                            </strong>{' '}
                            <span className="text-cyan-300 font-bold">
                              {fp.paybackLabel}
                            </span>
                          </span>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Tầng dưới: Thanh tên & trạng thái công trình (CC Cao Cấp... / Mở khóa ở Level...) */}
                {hoveredDockTooltip && (
                  <div
                    data-testid="dock-active-tooltip"
                    className="w-fit max-w-full rounded-lg border border-amber-400/75 bg-[#09121b]/96 px-3 py-1 shadow-2xl flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center toast-fade-in"
                  >
                    <span className="text-xs font-extrabold text-amber-300 whitespace-nowrap">
                      {hoveredDockTooltip.title}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-amber-500/40 text-amber-200 whitespace-nowrap">
                      [{hoveredDockTooltip.shortcut}]
                    </span>
                    {hoveredDockTooltip.meta && (
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          hoveredDockTooltip.meta.includes('🔒')
                            ? 'text-rose-300'
                            : 'text-emerald-300'
                        }`}
                      >
                        {hoveredDockTooltip.meta}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* MINIMALIST ICON HUD DOCK:
              - Cố định tại bottom: 15px; left: 50%; transform: translateX(-50%);
              - 1 hàng ngang duy nhất (display: flex; flex-wrap: nowrap;)
              - Toàn bộ menu & công cụ là Icon SVG 36x36px nhỏ gọn, ẩn nhãn chữ trên bề mặt chính */}
          {dockCollapsed ? (
            <div
              onMouseMove={stopHudPropagation}
              onMouseOver={stopHudPropagation}
              onClick={stopHudPropagation}
              onPointerDown={stopHudPropagation}
              onPointerMove={stopHudPropagation}
              onPointerUp={stopHudPropagation}
              className="bottom-dock hud-container pointer-events-auto rounded-xl border border-amber-500/40 bg-[#0d1722]/95 p-1 shadow-2xl"
            >
              <button
                type="button"
                data-testid="dock-expand-btn"
                aria-label="Mở Bảng Quy Hoạch [H]"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playClick();
                  setDockCollapsed(false);
                }}
                className="dock-icon-btn bg-amber-400/20 border border-amber-400 text-amber-300 cursor-pointer"
              >
                {renderMinimalistDockIcon('util_expand')}
              </button>
            </div>
          ) : (
            <div
              data-testid="minimalist-bottom-dock"
              onMouseMove={stopHudPropagation}
              onMouseOver={stopHudPropagation}
              onMouseLeave={() => setHoveredDockTooltip(null)}
              onClick={stopHudPropagation}
              onPointerDown={stopHudPropagation}
              onPointerMove={stopHudPropagation}
              onPointerUp={stopHudPropagation}
              onContextMenu={(e) => {
                e.preventDefault();
                stopHudPropagation(e);
              }}
              className="bottom-dock hud-container pointer-events-auto rounded-xl border border-amber-500/40 bg-[#0d1722]/95 px-2 py-1.5 shadow-2xl custom-scrollbar"
            >
              <div className="dock-icon-row">
                {/* 1. Nhóm Icon Phân Loại Menu Chính (4 Icon 36x36px · F1-F4) */}
                {categoryTabs.map((tab) => {
                  const isActive = dockCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`cat-btn-${tab.id}`}
                      aria-label={`${tab.title} [${tab.shortcut}]`}
                      title={`${tab.title} [${tab.shortcut}]`}
                      onMouseEnter={() =>
                        setHoveredDockTooltip({
                          title: tab.title,
                          shortcut: tab.shortcut,
                        })
                      }
                      onFocus={() =>
                        setHoveredDockTooltip({
                          title: tab.title,
                          shortcut: tab.shortcut,
                        })
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        soundEngine.playClick();
                        setDockCategory(tab.id);
                      }}
                      className={`dock-icon-btn relative border cursor-pointer ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 border-white shadow-md'
                          : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {renderMinimalistDockIcon(tab.iconId)}
                      <span
                        data-testid={`cat-hotkey-badge-${tab.id}`}
                        className="absolute -bottom-1 -right-1 rounded bg-slate-950/95 border border-slate-600 px-0.5 text-[7px] font-mono font-bold text-amber-300 leading-tight pointer-events-none"
                      >
                        {tab.tabKey}
                      </span>
                    </button>
                  );
                })}

                <div className="h-5 w-[1px] bg-slate-700/90 mx-0.5 shrink-0" />

                {/* 2. Nhóm Icon Công Trình Trong Phân Mục Đang Chọn (36x36px, ánh xạ tự động 1-9, 0 theo thứ tự trong Tab đang mở) */}
                {filteredTools.map((tool, idx) => {
                  const slotKey = idx === 9 ? '0' : String(idx + 1);
                  const isSelected = gameState.selectedTool === tool.id;
                  const unlocked = isToolUnlockedAtLevel(
                    tool.id,
                    gameState.cityLevel
                  );
                  const lockRequirement = !unlocked
                    ? getToolUnlockRequirementLabel(tool.id)
                    : null;
                  const displayCost =
                    tool.id === 'act_clearance'
                      ? activeClearanceInfo?.canClear
                        ? formatVnd(activeClearanceInfo.compensationCost)
                        : '500k - Theo giá đất'
                      : tool.id === 'act_reserve_land'
                      ? '100% giá đất hiện tại'
                      : tool.cost > 0
                      ? formatVnd(tool.cost)
                      : 'Miễn phí';

                  const toolFinancialPreview =
                    tool.id !== 'inspect' &&
                    tool.id !== 'act_clearance' &&
                    tool.id !== 'sub_drainage'
                      ? getBuildingFinancialPreview(
                          tool.id,
                          gameState.policies,
                          gameState.difficulty
                        )
                      : undefined;

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      data-testid={`tool-btn-${tool.id}`}
                      data-slot-key={slotKey}
                      data-locked={!unlocked ? 'true' : 'false'}
                      aria-label={`${tool.shortName} [${slotKey}]`}
                      title={`${tool.shortName} [${slotKey}]`}
                      onMouseEnter={() =>
                        setHoveredDockTooltip({
                          title: tool.shortName,
                          shortcut: slotKey,
                          meta: unlocked
                            ? `${displayCost} · ${tool.constructionDays}N`
                            : `🔒 ${lockRequirement}`,
                          financialPreview: toolFinancialPreview,
                        })
                      }
                      onFocus={() =>
                        setHoveredDockTooltip({
                          title: tool.shortName,
                          shortcut: slotKey,
                          meta: unlocked
                            ? `${displayCost} · ${tool.constructionDays}N`
                            : `🔒 ${lockRequirement}`,
                          financialPreview: toolFinancialPreview,
                        })
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!unlocked) {
                          soundEngine.playError();
                          setGameState((prev) => ({
                            ...prev,
                            lastEventBanner: `🔒 ${lockRequirement}`,
                          }));
                          return;
                        }
                        soundEngine.playClick();
                        setGameState((prev) => ({
                          ...prev,
                          selectedTool: tool.id as ToolId,
                        }));
                      }}
                      className={`dock-icon-btn relative border ${
                        !unlocked
                          ? 'bg-slate-900/75 border-slate-800 text-slate-500 cursor-not-allowed opacity-65'
                          : isSelected
                          ? 'bg-amber-400/25 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-300/60 cursor-pointer'
                          : 'bg-[#142230] border-slate-700/80 text-slate-200 hover:border-amber-400/60 hover:text-amber-200 cursor-pointer'
                      }`}
                    >
                      {renderMinimalistDockIcon(tool.id)}
                      <span
                        data-testid={`tool-hotkey-badge-${tool.id}`}
                        className="absolute -bottom-1 -right-1 rounded bg-slate-950/95 border border-amber-500/50 px-0.5 text-[7px] font-mono font-extrabold text-amber-200 leading-tight pointer-events-none"
                      >
                        [{slotKey}]
                      </span>
                      {!unlocked && (
                        <span
                          data-testid={`tool-lock-badge-${tool.id}`}
                          className="absolute -top-1 -right-1 rounded-full bg-slate-950 border border-amber-400/70 px-1 text-[8px] font-mono font-bold text-amber-300 leading-tight"
                        >
                          🔒
                        </span>
                      )}
                    </button>
                  );
                })}

                <div className="h-5 w-[1px] bg-slate-700/90 mx-0.5 shrink-0" />

                {/* 3. Nhóm Icon Điều Hành Vĩ Mô & Sổ Cái (Thuế [T], Giao Thông & Lương Thực [G], Sổ Cái Quyết Toán [B], Cố Vấn [C], Khảo Sát [ESC], Thu Gọn [H]) */}
                <button
                  type="button"
                  data-testid="policy-economy-btn"
                  aria-label="Kinh Tế & Thuế [T]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Kinh Tế & Thuế',
                      shortcut: 'T',
                      meta: 'PIT · CIT · An Sinh',
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playClick();
                    setActivePolicyDrawer((prev) =>
                      prev === 'economy' ? null : 'economy'
                    );
                  }}
                  className={`dock-icon-btn border cursor-pointer ${
                    activePolicyDrawer === 'economy'
                      ? 'bg-cyan-400 text-slate-950 border-cyan-200 shadow-md'
                      : 'bg-[#152536] text-cyan-300 border-cyan-500/40 hover:bg-[#1c3147]'
                  }`}
                >
                  {renderMinimalistDockIcon('util_economy')}
                </button>

                <button
                  type="button"
                  data-testid="policy-traffic-btn"
                  aria-label="Giao Thông & Lương Thực [G]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Giao Thông & Lương Thực',
                      shortcut: 'G',
                      meta: 'Metro · Kinh tế vỉa hè · An ninh lương thực',
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playClick();
                    setActivePolicyDrawer((prev) =>
                      prev === 'traffic' ? null : 'traffic'
                    );
                  }}
                  className={`dock-icon-btn border cursor-pointer ${
                    activePolicyDrawer === 'traffic'
                      ? 'bg-emerald-400 text-slate-950 border-emerald-200 shadow-md'
                      : 'bg-[#152536] text-emerald-300 border-emerald-500/40 hover:bg-[#1c3147]'
                  }`}
                >
                  {renderMinimalistDockIcon('util_traffic')}
                </button>

                <button
                  type="button"
                  data-testid="dock-bank-btn"
                  aria-label="Ngân Hàng Đô Thị [K]"
                  title="Ngân Hàng Đô Thị — Vay vốn & Gửi tiết kiệm [K]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Ngân Hàng Đô Thị',
                      shortcut: 'K',
                      meta: isPolicyUnlockedAtLevel('bank', gameState.cityLevel)
                        ? `${(gameState.loans ?? []).length} khoản vay · ${(gameState.deposits ?? []).length} sổ TK`
                        : '🔒 Mở khóa ở Level 2 (150 dân)',
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playClick();
                    setBankModalOpen((v) => !v);
                  }}
                  className={`dock-icon-btn relative border cursor-pointer ${
                    bankModalOpen
                      ? 'bg-sky-400 text-slate-950 border-white shadow-md'
                      : 'bg-[#152536] text-sky-300 border-sky-500/40 hover:bg-[#1c3147]'
                  }`}
                >
                  {renderMinimalistDockIcon('util_bank')}
                  {!isPolicyUnlockedAtLevel('bank', gameState.cityLevel) && (
                    <span className="absolute -top-1 -right-1 rounded-full bg-slate-950 border border-amber-400/70 px-1 text-[8px] font-mono font-bold text-amber-300 leading-tight">
                      🔒
                    </span>
                  )}
                  {isPolicyUnlockedAtLevel('bank', gameState.cityLevel) &&
                    ((gameState.loans ?? []).length > 0 ||
                      (gameState.deposits ?? []).length > 0) && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-sky-500 border border-white text-[8px] font-extrabold text-slate-950 flex items-center justify-center">
                        {(gameState.loans ?? []).length +
                          (gameState.deposits ?? []).length}
                      </span>
                    )}
                </button>

                <button
                  type="button"
                  data-testid="open-settlement-dock-btn"
                  aria-label="Báo Cáo Quyết Toán & Sổ Cái [B]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Quyết Toán Cuối Tháng & Sổ Cái',
                      shortcut: 'B',
                      meta: `${gameState.globalLedger.length} bút toán`,
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (settlementModalOpen) {
                      handleCloseSettlementModal();
                    } else {
                      handleOpenSettlementModal();
                    }
                  }}
                  className={`dock-icon-btn border cursor-pointer ${
                    settlementModalOpen
                      ? 'bg-amber-400 text-slate-950 border-white shadow-md'
                      : 'bg-[#152536] text-amber-300 border-amber-500/40 hover:bg-[#1c3147]'
                  }`}
                >
                  {renderMinimalistDockIcon('util_ledger')}
                  {gameState.hasUnreadSettlement && (
                    <span
                      data-testid="dock-settlement-unread-badge"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-600 border border-white text-[9px] font-extrabold text-white flex items-center justify-center"
                    >
                      !
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="dock-advisor-btn"
                  aria-label="Trợ Lý Cố Vấn Kinh Tế [C]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Trợ Lý Cố Vấn Kinh Tế',
                      shortcut: 'C',
                      meta: `Hạng ${advisorBriefing.healthGrade} · ${advisorBriefing.recommendations.length} gợi ý`,
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleAdvisorHud();
                  }}
                  className={`dock-icon-btn border cursor-pointer ${
                    advisorHudOpen
                      ? 'bg-emerald-400 text-slate-950 border-white shadow-md'
                      : 'bg-[#152536] text-emerald-300 border-emerald-500/40 hover:bg-[#1c3147]'
                  }`}
                >
                  {renderMinimalistDockIcon('util_advisor')}
                  {gameState.hasUnreadSettlement && !advisorHudOpen && (
                    <span
                      data-testid="dock-advisor-unread-badge"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white text-[9px] font-extrabold text-slate-950 flex items-center justify-center"
                    >
                      {advisorBriefing.recommendations.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="release-tool-btn"
                  aria-label="Khảo Sát / Hủy Ghost [ESC · Shift]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Khảo Sát / Hủy Ghost',
                      shortcut: 'ESC · Shift',
                      meta: 'Lia bản đồ tự do',
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReleaseToolToFreePan();
                  }}
                  className={`dock-icon-btn border cursor-pointer ${
                    gameState.selectedTool === 'inspect'
                      ? 'bg-amber-300 text-slate-950 border-white shadow-md'
                      : 'bg-slate-800/90 text-amber-200 border-amber-400/40 hover:bg-slate-700'
                  }`}
                >
                  {renderMinimalistDockIcon('util_inspect')}
                </button>

                <button
                  type="button"
                  data-testid="dock-collapse-btn"
                  aria-label="Thu Gọn HUD [H]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Thu Gọn Thanh HUD',
                      shortcut: 'H',
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playClick();
                    setHoveredDockTooltip(null);
                    setDockCollapsed(true);
                  }}
                  className="dock-icon-btn border border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
                >
                  {renderMinimalistDockIcon('util_collapse')}
                </button>
              </div>
            </div>
          )}
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
