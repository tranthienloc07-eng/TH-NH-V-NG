import React, { useCallback, useEffect, useState } from 'react';
import { CityViewport3D, HoverTileInfo } from './components/CityViewport3D';
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
  ALLOWED_DAY_TICK_MS,
  applyToolToTile,
  calculateLandClearanceCost,
  calculateMacroEconomy,
  CITY_LEVEL_SPECS,
  clearSavedGameState,
  createInitialGameState,
  evaluateOnboardingProgress,
  formatVnd,
  generateCityAdvisorBriefing,
  getPolicyUnlockRequirementLabel,
  getRegionName,
  getToolUnlockRequirementLabel,
  isBuiltStructure,
  isPolicyUnlockedAtLevel,
  isToolUnlockedAtLevel,
  loadGameStateFromLocalStorage,
  markSettlementReportRead,
  ONBOARDING_QUESTS,
  renameBuildingCustomName,
  saveGameStateToLocalStorage,
  selectOrUnlockRegion,
  setDayTickInterval,
  stepSimulationDay,
  stepSimulationMonth,
  TOOLS,
  triggerShowbizConcert,
} from './game/rules';
import {
  AdvisorRecommendation,
  CityGameState,
  MacroPolicies,
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

    // Utility & Policy icons
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
    if (!autostart && !fresh) {
      const saved = loadGameStateFromLocalStorage();
      if (saved) return saved;
    }
    const initial = createInitialGameState(autostart);
    const ts = saveGameStateToLocalStorage(initial);
    return ts ? { ...initial, lastSavedAt: ts } : initial;
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
  const [advisorHudOpen, setAdvisorHudOpen] = useState(false);
  const [lastAutoAdvisorReportId, setLastAutoAdvisorReportId] = useState<
    string | null
  >(null);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState(0);
  const [pulseEventCount, setPulseEventCount] = useState(0);
  const [budgetToast, setBudgetToast] = useState<string | null>(null);
  const [budgetToastClosing, setBudgetToastClosing] = useState(false);
  const [isTreasuryShaking, setIsTreasuryShaking] = useState(false);

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

  // Kéo giãn bộ đếm thời gian (Time Tick System): 1 ngày trong game = 5 đến 8 giây thực tế (mặc định 6000ms = 6s/ngày)
  useEffect(() => {
    if (gameState.mode !== 'playing') return;
    const intervalMs = gameState.dayTickIntervalMs || 6000;
    const timer = window.setInterval(() => {
      setGameState((prev) => stepSimulationDay(prev));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [gameState.mode, gameState.dayTickIntervalMs]);

  const handleStartGame = useCallback(() => {
    soundEngine.playBuild();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setGameState((prev) => {
      const next: CityGameState = {
        ...prev,
        mode: 'playing',
        snapshot: null,
      };
      const ts = saveGameStateToLocalStorage(next);
      return ts ? { ...next, lastSavedAt: ts } : next;
    });
  }, []);

  const handleRestartGame = useCallback(() => {
    soundEngine.playBuild();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActivePolicyDrawer(null);
    setContextMenu(null);
    setRegionMapOpen(false);
    setSettlementModalOpen(false);
    setAdvisorHudOpen(false);
    setLastAutoAdvisorReportId(null);
    setBudgetToast(null);
    setBudgetToastClosing(false);
    clearSavedGameState();
    const freshState = createInitialGameState(true);
    const ts = saveGameStateToLocalStorage(freshState);
    setGameState(ts ? { ...freshState, lastSavedAt: ts } : freshState);
  }, []);

  const handleReturnTitle = useCallback(() => {
    soundEngine.playClick();
    setActivePolicyDrawer(null);
    setContextMenu(null);
    setRegionMapOpen(false);
    setSettlementModalOpen(false);
    setAdvisorHudOpen(false);
    setLastAutoAdvisorReportId(null);
    setBudgetToast(null);
    setBudgetToastClosing(false);
    clearSavedGameState();
    setGameState(createInitialGameState(false));
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
        isBuiltStructure(clickedTile.type)
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
      executeToolOnTile(x, z);
    },
    [executeToolOnTile, gameState.grid, gameState.selectedTool]
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
          prev.crisisMonthsElapsed
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
        prev.crisisMonthsElapsed
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
        if (settlementModalOpen) {
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
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        if (settlementModalOpen) {
          handleCloseSettlementModal();
        } else {
          handleOpenSettlementModal();
        }
      } else if (e.code === 'Slash' || e.code === 'KeyK') {
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
        setDockCollapsed((c) => !c);
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
        setDockCategory('special');
        setGameState((prev) => ({ ...prev, selectedTool: 'act_clearance' }));
      } else if (e.code === 'KeyV') {
        e.preventDefault();
        setDockCategory('special');
        setGameState((prev) => ({ ...prev, selectedTool: 'sub_drainage' }));
      } else {
        const matchedTool = TOOLS.find(
          (t) => `Digit${t.keyHint}` === e.code || `Key${t.keyHint}` === e.code
        );
        if (matchedTool) {
          if (!isToolUnlockedAtLevel(matchedTool.id, gameState.cityLevel)) {
            soundEngine.playError();
            setGameState((prev) => ({
              ...prev,
              lastEventBanner: `🔒 ${getToolUnlockRequirementLabel(matchedTool.id)}`,
            }));
            return;
          }
          setDockCategory(matchedTool.category);
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
        gameState.policies.compensationLevel
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
  }[] = [
    {
      id: 'road',
      iconId: 'cat_road',
      title: 'Giao Thông & Đường',
      shortcut: '1-3',
    },
    {
      id: 'zoning',
      iconId: 'cat_zoning',
      title: 'Phân Lô Dân Cư & KT',
      shortcut: '4-0, F',
    },
    {
      id: 'infra',
      iconId: 'cat_infra',
      title: 'Hạ Tầng Công & Tư',
      shortcut: 'U, Y, O, N, Z, P, I, J',
    },
    {
      id: 'special',
      iconId: 'cat_special',
      title: 'Giải Tỏa & Cống Ngầm',
      shortcut: 'V, B',
    },
  ];

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none bg-[#0c141d]">
      {/* Isolated 3D WebGL Canvas */}
      <CityViewport3D
        gameState={gameState}
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

      {/* Playing HUD Overlay (z-index: 1000) — Thích nghi & tự co giãn trên cả Desktop lẫn Mobile */}
      {gameState.mode === 'playing' && (
        <div className="fixed inset-0 hud-overlay-layer z-[1000] pointer-events-none flex flex-col justify-between p-1.5 sm:p-2">
          <div className="w-full flex flex-col xl:flex-row items-stretch xl:items-start justify-between gap-1">
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
              className="top-bar hud-container pointer-events-auto max-w-full flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-x-2 gap-y-0.5 sm:gap-2 rounded-lg border border-amber-500/35 bg-[#0d1722]/94 px-2 py-1 shadow-xl overflow-x-auto custom-scrollbar"
            >
              <div className="pr-1.5 sm:pr-2 border-r border-slate-700/80 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] sm:text-[9px] leading-tight font-bold uppercase tracking-wider text-amber-400 whitespace-nowrap">
                    {getRegionName(
                      gameState.activeRegion.rx,
                      gameState.activeRegion.rz
                    )}
                  </span>
                  <span
                    data-testid="hud-city-level"
                    title={
                      nextLevelSpec
                        ? `Cấp hiện tại: Level ${currentLevelSpec.level} (${currentLevelSpec.title}). Lên Level ${nextLevelSpec.level} khi đạt ${nextLevelSpec.minPopulation} dân (${nextLevelSpec.unlockSummary})`
                        : `Đã đạt cấp tối đa: Level 5 (${currentLevelSpec.title})`
                    }
                    className="rounded bg-amber-400/20 border border-amber-400/60 px-1 py-0.2 text-[8px] sm:text-[9px] font-mono font-extrabold text-amber-200 whitespace-nowrap"
                  >
                    Lv.{gameState.cityLevel} · {currentLevelSpec.title}
                  </span>
                </div>
                <div
                  data-testid="hud-date"
                  className="text-[10px] sm:text-[11px] leading-tight font-mono tabular-nums font-bold text-slate-100 whitespace-nowrap"
                >
                  N{gameState.day}/30 · T{gameState.month}/{gameState.year} ·{' '}
                  {seasonLabel}
                </div>
              </div>

              <div
                data-testid="hud-treasury-card"
                className={`rounded-md px-1 py-0.5 transition-colors shrink-0 ${
                  isTreasuryShaking
                    ? 'hud-budget-shake bg-rose-500/25 border border-rose-400/70'
                    : ''
                }`}
              >
                <div className="text-[8px] sm:text-[9px] leading-tight font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Ngân Sách ({gameState.metrics.netBalance >= 0 ? '+' : ''}
                  {formatVnd(gameState.metrics.netBalance)}/th)
                </div>
                <div
                  data-testid="hud-treasury"
                  className={`hero-numeral text-xs sm:text-sm leading-tight font-extrabold whitespace-nowrap ${
                    gameState.treasury < 0 ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  {formatVnd(gameState.treasury)}
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] sm:text-[9px] leading-tight font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Dân Số / Chỗ Ở
                </div>
                <div
                  data-testid="hud-population"
                  className="hero-numeral text-xs sm:text-sm leading-tight font-extrabold text-emerald-300 whitespace-nowrap"
                >
                  {gameState.metrics.population.toLocaleString('vi-VN')} /{' '}
                  {gameState.metrics.housingCapacity.toLocaleString('vi-VN')}
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] sm:text-[9px] leading-tight font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Việc Làm
                </div>
                <div
                  data-testid="hud-jobs"
                  className="hero-numeral text-xs sm:text-sm leading-tight font-extrabold text-cyan-300 whitespace-nowrap"
                >
                  {gameState.metrics.labor.totalEmployed} /{' '}
                  {gameState.metrics.labor.totalJobSlots}
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] sm:text-[9px] leading-tight font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  PCI · Giao Thông
                </div>
                <div
                  data-testid="hud-pci"
                  className="hero-numeral text-xs sm:text-sm leading-tight font-extrabold text-sky-300 whitespace-nowrap"
                >
                  {Math.round(gameState.metrics.pci)}/100 ·{' '}
                  {Math.round(gameState.metrics.trafficSpeedIndex)}%
                </div>
              </div>

              <div className="shrink-0">
                <div className="text-[8px] sm:text-[9px] leading-tight font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Hạnh Phúc · An Sinh
                </div>
                <div
                  data-testid="hud-happiness-stability"
                  className={`hero-numeral text-xs sm:text-sm leading-tight font-extrabold whitespace-nowrap ${
                    gameState.isCrisis ||
                    gameState.metrics.happiness < 35 ||
                    gameState.metrics.socialStability < 25
                      ? 'text-rose-400'
                      : 'text-amber-200'
                  }`}
                >
                  {Math.round(gameState.metrics.happiness)}% ·{' '}
                  {Math.round(gameState.metrics.socialStability)}%
                </div>
              </div>

              {gameState.isCrisis && (
                <div
                  data-testid="hud-crisis-status"
                  className="rounded-md border border-rose-400 bg-rose-500/25 px-2 py-0.5 text-rose-100 shrink-0"
                >
                  <div className="text-[9px] leading-tight font-extrabold uppercase tracking-wider text-rose-300 whitespace-nowrap">
                    Cảnh Báo Khủng Hoảng ({gameState.crisisTimer} tháng)
                  </div>
                  <div className="text-[10px] leading-tight font-mono font-bold whitespace-nowrap">
                    PCI -{gameState.crisisMonthsElapsed * 5} · Di cư +
                    {gameState.metrics.emigrationRatePercent}%
                  </div>
                </div>
              )}
            </div>

            {/* Top-Right Cluster (.top-bar .hud-container): 9x9 Region Expansion, Sổ Cái Quyết Toán, How to Play, Season & Utilities */}
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
              className="top-bar hud-container pointer-events-auto max-w-full flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-1 rounded-lg border border-slate-700/80 bg-[#0d1722]/94 px-1.5 sm:px-2 py-1 shadow-xl overflow-x-auto custom-scrollbar"
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
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md font-bold text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                  !region9x9Unlocked
                    ? 'bg-slate-900/80 text-slate-400 border-slate-700 cursor-not-allowed'
                    : gameState.metrics.canExpandRegion
                    ? 'bg-amber-400 text-slate-950 border-white shadow-md cursor-pointer'
                    : 'bg-[#152536] text-amber-300 border-amber-500/40 hover:bg-[#1c3148] cursor-pointer'
                }`}
              >
                {!region9x9Unlocked ? '🔒 ' : ''}Vùng 9×9 [{gameState.unlockedRegions.length}/81]
              </button>

              {/* Bộ chọn nhịp độ thời gian (5s - 8s / ngày) */}
              <div
                data-testid="hud-day-tick-selector"
                className="flex items-center gap-0.5 rounded-md bg-slate-900/90 border border-slate-700 px-1 py-0.5 shrink-0"
                title="Tốc độ trôi qua của 1 ngày trong game (5 - 8 giây/ngày)"
              >
                {ALLOWED_DAY_TICK_MS.map((ms) => {
                  const sec = ms / 1000;
                  const active = gameState.dayTickIntervalMs === ms;
                  return (
                    <button
                      key={ms}
                      type="button"
                      tabIndex={-1}
                      data-testid={`day-tick-${sec}s-btn`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        handleChangeDayTickInterval(ms);
                      }}
                      className={`px-1 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${
                        active
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {sec}s/N
                    </button>
                  );
                })}
              </div>

              {/* Biểu tượng Thông báo Báo Cáo Quyết Toán Tài Chính ở góc trên cùng bên phải kèm Chấm đỏ cảnh báo (!) */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="settlement-notification-btn"
                aria-label="Thông báo Báo cáo Quyết toán Tài chính cuối tháng [L]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleOpenSettlementModal();
                }}
                className={`relative px-2 py-0.5 sm:py-1 rounded-md border font-bold text-[10px] sm:text-[11px] cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 transition-all ${
                  gameState.hasUnreadSettlement
                    ? 'bg-amber-500/30 hover:bg-amber-500/40 text-amber-100 border-amber-400 shadow-lg ring-1 ring-rose-400/80'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/50'
                }`}
              >
                {renderMinimalistDockIcon('util_ledger')}
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

              {/* Icon Trợ Lý Cố Vấn Kinh Tế trên HUD (Đồng thời xuất hiện mỗi cuối tháng để phân tích báo cáo quyết toán & gợi ý hành động, không dùng pop-up) */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-advisor-btn"
                aria-label="Trợ Lý Cố Vấn Kinh Tế [C]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleToggleAdvisorHud();
                }}
                className={`relative px-2 py-0.5 sm:py-1 rounded-md border font-bold text-[10px] sm:text-[11px] cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 transition-all ${
                  advisorHudOpen
                    ? 'bg-emerald-400 text-slate-950 border-white shadow-md'
                    : gameState.hasUnreadSettlement
                    ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border-emerald-400 shadow-lg'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                }`}
              >
                {renderMinimalistDockIcon('util_advisor')}
                <span>Cố Vấn [{advisorBriefing.healthGrade}]</span>
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
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  soundEngine.playClick();
                  setHowToPlayOpen(true);
                }}
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold text-[10px] sm:text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                Hướng Dẫn
              </button>

              <div className="hidden 2xl:flex items-center gap-0.5 px-1 border-x border-slate-700 shrink-0">
                {(
                  [
                    ['dry', 'Mùa Khô'],
                    ['monsoon', 'Mưa Bão'],
                    ['high_tide', 'Triều Cường'],
                  ] as [SeasonType, string][]
                ).map(([s, label]) => (
                  <button
                    key={s}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.blur();
                      handleSwitchSeason(s);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
                      gameState.season === s
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleAdvanceDayManual();
                }}
                className="px-1.5 py-0.5 sm:py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[10px] sm:text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                +1 Ngày
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleAdvanceMonthManual();
                }}
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px] sm:text-[11px] cursor-pointer whitespace-nowrap shrink-0"
              >
                +1 Tháng
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Đặt lại góc nhìn Camera"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  setCameraPresetTrigger((c) => c + 1);
                }}
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                  <path d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6 0 2.97-2.17 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93 0-4.42-3.58-8-8-8zm-6 8c0-1.65.67-3.15 1.76-4.24L6.34 7.34C4.9 8.79 4 10.79 4 13c0 4.08 3.05 7.44 7 7.93v-2.02c-2.83-.48-5-2.94-5-5.91z" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={isMuted ? 'Bật âm thanh [M]' : 'Tắt âm thanh [M]'}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleToggleMute();
                }}
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
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
                aria-label="Tạm dừng [Esc]"
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  handleTogglePause();
                }}
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
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
                  onClick={() => setOnboardingCollapsed((c) => !c)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] font-bold text-slate-200 cursor-pointer shrink-0"
                >
                  {onboardingCollapsed ? 'Mở' : 'Thu gọn'}
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

          {/* Bảng Trợ Lý Cố Vấn Kinh Tế tích hợp trực tiếp trên HUD (Không dùng Pop-up che màn hình; tự động xuất hiện mỗi cuối tháng cùng thông báo Quyết toán) */}
          {advisorHudOpen && (
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

          {/* Macro Policy Drawer (nằm phía trên thanh Icon Dock khi được bật bằng [T] hoặc [G]) */}
          <div className="fixed bottom-[64px] left-1/2 -translate-x-1/2 z-[1050] w-full max-w-[820px] px-2 pointer-events-none flex flex-col items-center">
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

          {/* Mobile-only Floating Hover Tooltip Banner (trên Desktop mỗi nút 36x36px đã có .dock-icon-tooltip trượt lên trực tiếp phía trên nút đó) */}
          {hoveredDockTooltip && !dockCollapsed && (
            <div
              data-testid="dock-active-tooltip"
              className="fixed sm:hidden bottom-[60px] left-1/2 -translate-x-1/2 z-[1200] pointer-events-none rounded-lg border border-amber-400/75 bg-[#09121b]/96 px-3 py-1 shadow-2xl flex items-center gap-2 whitespace-nowrap toast-fade-in"
            >
              <span className="text-xs font-extrabold text-amber-300">
                {hoveredDockTooltip.title}
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-amber-500/40 text-amber-200">
                [{hoveredDockTooltip.shortcut}]
              </span>
              {hoveredDockTooltip.meta && (
                <span className="text-[11px] font-mono font-semibold text-emerald-300">
                  {hoveredDockTooltip.meta}
                </span>
              )}
            </div>
          )}

          {/* MINIMALIST ICON HUD DOCK:
              - Cố định tại bottom: 15px; left: 50%; transform: translateX(-50%);
              - 1 hàng ngang duy nhất (display: flex; flex-wrap: nowrap;)
              - Toàn bộ menu & công cụ là Icon SVG 36x36px nhỏ gọn, ẩn nhãn chữ trên bề mặt chính
              - Khi Hover tự động trượt Tooltip tên + phím tắt lên mượt mà */}
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
                <div className="dock-icon-tooltip rounded-md border border-amber-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-amber-200 shadow-xl">
                  Mở Bảng Quy Hoạch <span className="font-mono text-amber-400">[H]</span>
                </div>
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
                {/* 1. Nhóm Icon Phân Loại Menu Chính (4 Icon 36x36px) */}
                {categoryTabs.map((tab) => {
                  const isActive = dockCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`cat-btn-${tab.id}`}
                      aria-label={`${tab.title} [${tab.shortcut}]`}
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
                      className={`dock-icon-btn border cursor-pointer ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 border-white shadow-md'
                          : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {renderMinimalistDockIcon(tab.iconId)}
                      <div className="dock-icon-tooltip rounded-md border border-amber-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-slate-100 shadow-xl">
                        {tab.title}{' '}
                        <span className="font-mono text-amber-300">
                          [{tab.shortcut}]
                        </span>
                      </div>
                    </button>
                  );
                })}

                <div className="h-5 w-[1px] bg-slate-700/90 mx-0.5 shrink-0" />

                {/* 2. Nhóm Icon Công Trình Trong Phân Mục Đang Chọn (36x36px, chỉ hiện Icon, Hover trượt Tooltip, Khóa theo Level 1-5) */}
                {filteredTools.map((tool) => {
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
                      : tool.cost > 0
                      ? formatVnd(tool.cost)
                      : 'Miễn phí';

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      data-testid={`tool-btn-${tool.id}`}
                      data-locked={!unlocked ? 'true' : 'false'}
                      aria-label={`${tool.shortName} [${tool.keyHint}]`}
                      onMouseEnter={() =>
                        setHoveredDockTooltip({
                          title: tool.shortName,
                          shortcut: tool.keyHint,
                          meta: unlocked
                            ? `${displayCost} · ${tool.constructionDays}N`
                            : `🔒 ${lockRequirement}`,
                        })
                      }
                      onFocus={() =>
                        setHoveredDockTooltip({
                          title: tool.shortName,
                          shortcut: tool.keyHint,
                          meta: unlocked
                            ? `${displayCost} · ${tool.constructionDays}N`
                            : `🔒 ${lockRequirement}`,
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
                      {!unlocked && (
                        <span
                          data-testid={`tool-lock-badge-${tool.id}`}
                          className="absolute -top-1 -right-1 rounded-full bg-slate-950 border border-amber-400/70 px-1 text-[8px] font-mono font-bold text-amber-300 leading-tight"
                        >
                          🔒
                        </span>
                      )}
                      <div className="dock-icon-tooltip rounded-md border border-amber-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-slate-100 shadow-xl">
                        <span>{tool.shortName}</span>{' '}
                        <span className="font-mono text-amber-300">
                          [{tool.keyHint}]
                        </span>{' '}
                        {unlocked ? (
                          <span className="font-mono text-emerald-300">
                            · {displayCost}
                          </span>
                        ) : (
                          <span className="font-mono text-rose-300">
                            · 🔒 {lockRequirement}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                <div className="h-5 w-[1px] bg-slate-700/90 mx-0.5 shrink-0" />

                {/* 3. Nhóm Icon Điều Hành Vĩ Mô & Sổ Cái (Thuế [T], Giao Thông [G], Sổ Cái Quyết Toán [L], Khảo Sát [ESC], Thu Gọn [H]) */}
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
                  <div className="dock-icon-tooltip rounded-md border border-cyan-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-cyan-200 shadow-xl">
                    Kinh Tế &amp; Thuế <span className="font-mono text-amber-300">[T]</span>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="policy-traffic-btn"
                  aria-label="Giao Thông & Vỉa Hè [G]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Giao Thông & Vỉa Hè',
                      shortcut: 'G',
                      meta: 'Metro · Kinh tế vỉa hè',
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
                  <div className="dock-icon-tooltip rounded-md border border-emerald-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-emerald-200 shadow-xl">
                    Giao Thông &amp; Vỉa Hè <span className="font-mono text-amber-300">[G]</span>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="open-settlement-dock-btn"
                  aria-label="Báo Cáo Quyết Toán & Sổ Cái [L]"
                  onMouseEnter={() =>
                    setHoveredDockTooltip({
                      title: 'Quyết Toán Cuối Tháng & Sổ Cái',
                      shortcut: 'L',
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
                  <div className="dock-icon-tooltip rounded-md border border-amber-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-amber-200 shadow-xl">
                    Quyết Toán &amp; Sổ Cái <span className="font-mono text-amber-300">[L]</span>
                  </div>
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
                  <div className="dock-icon-tooltip rounded-md border border-emerald-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-emerald-200 shadow-xl">
                    Cố Vấn Kinh Tế <span className="font-mono text-amber-300">[C]</span>
                  </div>
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
                  <div className="dock-icon-tooltip rounded-md border border-amber-400/70 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-amber-200 shadow-xl">
                    Khảo Sát / Hủy Ghost <span className="font-mono text-amber-300">[ESC]</span>
                  </div>
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
                  <div className="dock-icon-tooltip rounded-md border border-slate-500 bg-[#09121b]/95 px-2.5 py-1 text-[11px] font-bold text-slate-200 shadow-xl">
                    Thu Gọn HUD <span className="font-mono text-amber-300">[H]</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bảng Báo Cáo Quyết Toán Tài Chính Cuối Tháng (Chỉ mở khi người chơi bấm vào Biểu tượng Thông báo Báo Cáo (!) hoặc phím [L]) */}
      <MonthlySettlementModal
        open={settlementModalOpen}
        gameState={gameState}
        onClose={handleCloseSettlementModal}
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
        onStartGame={handleStartGame}
        onOpenHowToPlay={() => setHowToPlayOpen(true)}
        onResumeGame={handleTogglePause}
        onRestartGame={handleRestartGame}
        onReturnTitle={handleReturnTitle}
      />
    </main>
  );
}
