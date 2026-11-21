import { useEffect } from 'react';
import { soundEngine } from '../game/audio';
import {
  getPolicyUnlockRequirementLabel,
  getToolUnlockRequirementLabel,
  isPolicyUnlockedAtLevel,
  isToolUnlockedAtLevel,
  TOOLS,
} from '../game/rules';
import { CityGameState } from '../game/types';
import { HeatmapMode } from '../components/CityViewport3D';

export type DockCategory = 'road' | 'zoning' | 'infra' | 'special';

export interface UseGameHotkeysParams {
  gameState: CityGameState;
  setGameState: React.Dispatch<React.SetStateAction<CityGameState>>;
  dockCategory: DockCategory;
  setDockCategory: React.Dispatch<React.SetStateAction<DockCategory>>;
  setDockCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setOnboardingCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  pendingPlacementRisk: unknown;
  setPendingPlacementRisk: (val: null) => void;
  bankModalOpen: boolean;
  setBankModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  settlementModalOpen: boolean;
  howToPlayOpen: boolean;
  setHowToPlayOpen: React.Dispatch<React.SetStateAction<boolean>>;
  regionMapOpen: boolean;
  setRegionMapOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contextMenu: unknown;
  setContextMenu: (val: null) => void;
  activePolicyDrawer: 'economy' | 'traffic' | null;
  setActivePolicyDrawer: React.Dispatch<
    React.SetStateAction<'economy' | 'traffic' | null>
  >;
  setHeatmapMode: React.Dispatch<React.SetStateAction<HeatmapMode>>;
  handleStartGame: () => void;
  handleRestartGame: () => void;
  handleTogglePause: () => void;
  handleToggleMute: () => void;
  handleReleaseToolToFreePan: () => void;
  handleToggleAdvisorHud: () => void;
  handleOpenSettlementModal: () => void;
  handleCloseSettlementModal: () => void;
  handleTriggerConcert: () => void;
}

export function useGameHotkeys({
  gameState,
  setGameState,
  dockCategory,
  setDockCategory,
  setDockCollapsed,
  setOnboardingCollapsed,
  pendingPlacementRisk,
  setPendingPlacementRisk,
  bankModalOpen,
  setBankModalOpen,
  settlementModalOpen,
  howToPlayOpen,
  setHowToPlayOpen,
  regionMapOpen,
  setRegionMapOpen,
  contextMenu,
  setContextMenu,
  activePolicyDrawer,
  setActivePolicyDrawer,
  setHeatmapMode,
  handleStartGame,
  handleRestartGame,
  handleTogglePause,
  handleToggleMute,
  handleReleaseToolToFreePan,
  handleToggleAdvisorHud,
  handleOpenSettlementModal,
  handleCloseSettlementModal,
  handleTriggerConcert,
}: UseGameHotkeysParams): void {
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
        setHeatmapMode((prev) =>
          prev === 'land_value' ? 'none' : 'land_value'
        );
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
    setGameState,
    setDockCategory,
    setDockCollapsed,
    setOnboardingCollapsed,
    setPendingPlacementRisk,
    setBankModalOpen,
    setHowToPlayOpen,
    setRegionMapOpen,
    setContextMenu,
    setActivePolicyDrawer,
    setHeatmapMode,
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
}
