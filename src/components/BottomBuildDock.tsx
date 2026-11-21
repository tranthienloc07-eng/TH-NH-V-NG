import React from 'react';
import { soundEngine } from '../game/audio';
import {
  formatVnd,
  getBuildingFinancialPreview,
  getToolUnlockRequirementLabel,
  isPolicyUnlockedAtLevel,
  isToolUnlockedAtLevel,
  TOOLS,
} from '../game/rules';
import {
  AdvisorBriefing,
  BuildingFinancialPreview,
  CityGameState,
  ToolId,
} from '../game/types';
import { DockCategory } from '../hooks/useGameHotkeys';
import { HeatmapMode } from './CityViewport3D';
import { renderMinimalistDockIcon } from './dockIcons';

export interface DockTooltipInfo {
  title: string;
  shortcut: string;
  meta?: string;
  financialPreview?: BuildingFinancialPreview;
}

export interface BottomBuildDockProps {
  gameState: CityGameState;
  dockCategory: DockCategory;
  setDockCategory: (cat: DockCategory) => void;
  dockCollapsed: boolean;
  setDockCollapsed: (collapsed: boolean) => void;
  activePolicyDrawer: 'economy' | 'traffic' | null;
  setActivePolicyDrawer: React.Dispatch<
    React.SetStateAction<'economy' | 'traffic' | null>
  >;
  heatmapMode: HeatmapMode;
  setHeatmapMode: React.Dispatch<React.SetStateAction<HeatmapMode>>;
  advisorHudOpen: boolean;
  advisorBriefing: AdvisorBriefing;
  bankModalOpen: boolean;
  setBankModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  settlementModalOpen: boolean;
  hoveredDockTooltip: DockTooltipInfo | null;
  setHoveredDockTooltip: (val: DockTooltipInfo | null) => void;
  selectedToolFinancialPreview: BuildingFinancialPreview | null;
  activeClearanceInfo: { canClear: boolean; compensationCost: number } | null;
  isTouchDevice: boolean;
  stopHudPropagation: (e: React.SyntheticEvent) => void;
  onSelectTool: (toolId: ToolId) => void;
  onLockedToolClick: (lockMessage: string) => void;
  onOpenSettlementModal: () => void;
  onCloseSettlementModal: () => void;
  onToggleAdvisorHud: () => void;
  onReleaseToolToFreePan: () => void;
}

const CATEGORY_TABS: {
  id: DockCategory;
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

export const BottomBuildDock: React.FC<BottomBuildDockProps> = ({
  gameState,
  dockCategory,
  setDockCategory,
  dockCollapsed,
  setDockCollapsed,
  activePolicyDrawer,
  setActivePolicyDrawer,
  heatmapMode,
  setHeatmapMode,
  advisorHudOpen,
  advisorBriefing,
  bankModalOpen,
  setBankModalOpen,
  settlementModalOpen,
  hoveredDockTooltip,
  setHoveredDockTooltip,
  selectedToolFinancialPreview,
  activeClearanceInfo,
  isTouchDevice,
  stopHudPropagation,
  onSelectTool,
  onLockedToolClick,
  onOpenSettlementModal,
  onCloseSettlementModal,
  onToggleAdvisorHud,
  onReleaseToolToFreePan,
}) => {
  const filteredTools = TOOLS.filter((t) => t.category === dockCategory);

  // Trên thiết bị cảm ứng (isTouchDevice), ẩn tự động thanh Tooltip 5 chỉ số nổi phía trên Dock
  // để giải phóng tối đa tầm nhìn 3D (5 chỉ số vẫn hiển thị trong Pre-flight dialog và bảng chi tiết khi chạm chọn công trình).
  const showFinancialPreviewBar =
    !isTouchDevice &&
    !dockCollapsed &&
    Boolean(hoveredDockTooltip?.financialPreview ?? selectedToolFinancialPreview);
  const showHoverTitleTooltip = !isTouchDevice && Boolean(hoveredDockTooltip);
  const showTooltipStack =
    !activePolicyDrawer &&
    (heatmapMode === 'land_value' ||
      showFinancialPreviewBar ||
      showHoverTitleTooltip);

  // Trên Mobile: đảm bảo vùng chạm tối thiểu 40x40px; trên Desktop giữ 36x36px sắc gọn
  const dockBtnSizeClass =
    'min-w-[40px] min-h-[40px] w-10 h-10 lg:w-9 lg:h-9 lg:min-w-[36px] lg:min-h-[36px]';

  return (
    <>
      {showTooltipStack && (
        <div
          data-testid="bottom-hud-tooltip-stack"
          className={`fixed bottom-[66px] lg:bottom-[62px] z-[1045] pointer-events-none flex flex-col items-center gap-1.5 px-2 transition-all ${
            advisorHudOpen
              ? 'left-1/2 -translate-x-1/2 lg:left-[calc((100vw-370px)/2)] w-full max-w-[min(760px,92vw)] lg:max-w-[min(720px,calc(100vw-390px))]'
              : 'left-1/2 -translate-x-1/2 w-full max-w-[min(760px,92vw)]'
          }`}
        >
          {/* Thanh Chú Thích Bản Đồ Nhiệt Giá Đất */}
          {heatmapMode === 'land_value' && (
            <div
              data-testid="land-value-heatmap-legend"
              onMouseMove={stopHudPropagation}
              onMouseOver={stopHudPropagation}
              onClick={stopHudPropagation}
              className="hud-container pointer-events-auto w-fit max-w-full rounded-lg border border-orange-400/60 bg-[#0b1520]/95 px-2.5 py-1 shadow-2xl flex flex-wrap items-center justify-center gap-2 text-xs lg:text-[10px] text-slate-100"
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
                className="ml-0.5 min-w-[32px] min-h-[32px] lg:min-w-0 lg:min-h-0 px-1.5 lg:px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs lg:text-[10px] font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Tầng giữa: Hộp 5 chỉ số tài chính (chỉ hiện trên Desktop / không phải cảm ứng) */}
          {showFinancialPreviewBar && (
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

          {/* Tầng dưới: Thanh tên & trạng thái công trình khi Hover (chỉ hiện trên thiết bị có chuột) */}
          {showHoverTitleTooltip && hoveredDockTooltip && (
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

      {/* MINIMALIST ICON HUD DOCK: 1 hàng ngang cuộn mượt trên Mobile (nút >=40px) */}
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
            className={`dock-icon-btn ${dockBtnSizeClass} bg-amber-400/20 border border-amber-400 text-amber-300 cursor-pointer`}
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
          className="bottom-dock hud-container pointer-events-auto overflow-x-auto rounded-xl border border-amber-500/40 bg-[#0d1722]/95 px-2 py-1.5 shadow-2xl custom-scrollbar"
        >
          <div className="dock-icon-row">
            {/* 1. Nhóm Icon Phân Loại Menu Chính (F1-F4) */}
            {CATEGORY_TABS.map((tab) => {
              const isActive = dockCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`cat-btn-${tab.id}`}
                  aria-label={`${tab.title} [${tab.shortcut}]`}
                  title={`${tab.title} [${tab.shortcut}]`}
                  onMouseEnter={() => {
                    if (!isTouchDevice) {
                      setHoveredDockTooltip({
                        title: tab.title,
                        shortcut: tab.shortcut,
                      });
                    }
                  }}
                  onFocus={() => {
                    if (!isTouchDevice) {
                      setHoveredDockTooltip({
                        title: tab.title,
                        shortcut: tab.shortcut,
                      });
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playClick();
                    setDockCategory(tab.id);
                  }}
                  className={`dock-icon-btn ${dockBtnSizeClass} relative border cursor-pointer ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 border-white shadow-md'
                      : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {renderMinimalistDockIcon(tab.iconId)}
                  <span
                    data-testid={`cat-hotkey-badge-${tab.id}`}
                    className="hidden lg:inline-block absolute -bottom-1 -right-1 rounded bg-slate-950/95 border border-slate-600 px-0.5 text-[7px] font-mono font-bold text-amber-300 leading-tight pointer-events-none"
                  >
                    {tab.tabKey}
                  </span>
                </button>
              );
            })}

            <div className="h-5 w-[1px] bg-slate-700/90 mx-0.5 shrink-0" />

            {/* 2. Nhóm Icon Công Trình Trong Phân Mục Đang Chọn */}
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
                  onMouseEnter={() => {
                    if (!isTouchDevice) {
                      setHoveredDockTooltip({
                        title: tool.shortName,
                        shortcut: slotKey,
                        meta: unlocked
                          ? `${displayCost} · ${tool.constructionDays}N`
                          : `🔒 ${lockRequirement}`,
                        financialPreview: toolFinancialPreview,
                      });
                    }
                  }}
                  onFocus={() => {
                    if (!isTouchDevice) {
                      setHoveredDockTooltip({
                        title: tool.shortName,
                        shortcut: slotKey,
                        meta: unlocked
                          ? `${displayCost} · ${tool.constructionDays}N`
                          : `🔒 ${lockRequirement}`,
                        financialPreview: toolFinancialPreview,
                      });
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!unlocked) {
                      soundEngine.playError();
                      onLockedToolClick(`🔒 ${lockRequirement}`);
                      return;
                    }
                    soundEngine.playClick();
                    onSelectTool(tool.id as ToolId);
                  }}
                  className={`dock-icon-btn ${dockBtnSizeClass} relative border ${
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
                    className="hidden lg:inline-block absolute -bottom-1 -right-1 rounded bg-slate-950/95 border border-amber-500/50 px-0.5 text-[7px] font-mono font-extrabold text-amber-200 leading-tight pointer-events-none"
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

            {/* 3. Nhóm Icon Điều Hành Vĩ Mô & Sổ Cái */}
            <button
              type="button"
              data-testid="policy-economy-btn"
              aria-label="Kinh Tế & Thuế [T]"
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Kinh Tế & Thuế',
                    shortcut: 'T',
                    meta: 'PIT · CIT · An Sinh',
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.playClick();
                setActivePolicyDrawer((prev) =>
                  prev === 'economy' ? null : 'economy'
                );
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} border cursor-pointer ${
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
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Giao Thông & Lương Thực',
                    shortcut: 'G',
                    meta: 'Metro · Kinh tế vỉa hè · An ninh lương thực',
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.playClick();
                setActivePolicyDrawer((prev) =>
                  prev === 'traffic' ? null : 'traffic'
                );
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} border cursor-pointer ${
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
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Ngân Hàng Đô Thị',
                    shortcut: 'K',
                    meta: isPolicyUnlockedAtLevel('bank', gameState.cityLevel)
                      ? `${(gameState.loans ?? []).length} khoản vay · ${(gameState.deposits ?? []).length} sổ TK`
                      : '🔒 Mở khóa ở Level 2 (150 dân)',
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.playClick();
                setBankModalOpen((v) => !v);
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} relative border cursor-pointer ${
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
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Quyết Toán Cuối Tháng & Sổ Cái',
                    shortcut: 'B',
                    meta: `${gameState.globalLedger.length} bút toán`,
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (settlementModalOpen) {
                  onCloseSettlementModal();
                } else {
                  onOpenSettlementModal();
                }
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} border cursor-pointer ${
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
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Trợ Lý Cố Vấn Kinh Tế',
                    shortcut: 'C',
                    meta: `Hạng ${advisorBriefing.healthGrade} · ${advisorBriefing.recommendations.length} gợi ý`,
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleAdvisorHud();
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} border cursor-pointer ${
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
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Khảo Sát / Hủy Ghost',
                    shortcut: 'ESC · Shift',
                    meta: 'Lia bản đồ tự do',
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                onReleaseToolToFreePan();
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} border cursor-pointer ${
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
              onMouseEnter={() => {
                if (!isTouchDevice) {
                  setHoveredDockTooltip({
                    title: 'Thu Gọn Thanh HUD',
                    shortcut: 'H',
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.playClick();
                setHoveredDockTooltip(null);
                setDockCollapsed(true);
              }}
              className={`dock-icon-btn ${dockBtnSizeClass} border border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer`}
            >
              {renderMinimalistDockIcon('util_collapse')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
