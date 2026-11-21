import React from 'react';
import { soundEngine } from '../game/audio';
import {
  formatVnd,
  getPolicyUnlockRequirementLabel,
  getRegionName,
} from '../game/rules';
import {
  AdvisorBriefing,
  CityGameState,
  CityLevelSpec,
  SeasonType,
} from '../game/types';
import { GraphicQuality, HeatmapMode } from './CityViewport3D';

export interface TopHudBarProps {
  gameState: CityGameState;
  currentLevelSpec: CityLevelSpec;
  nextLevelSpec: CityLevelSpec | null;
  seasonLabel: string;
  isTreasuryShaking: boolean;
  region9x9Unlocked: boolean;
  heatmapMode: HeatmapMode;
  advisorBriefing: AdvisorBriefing;
  advisorHudOpen: boolean;
  graphicQuality: GraphicQuality;
  isMuted: boolean;
  stopHudPropagation: (e: React.SyntheticEvent) => void;
  onSwitchSeason: (season: SeasonType) => void;
  onOpenRegionMap: () => void;
  onLockedRegionClick: () => void;
  onToggleHeatmap: () => void;
  onCycleDayTickInterval: () => void;
  onOpenSettlementModal: () => void;
  onToggleAdvisorHud: () => void;
  onToggleGraphicQuality: () => void;
  onOpenHowToPlay: () => void;
  onAdvanceDayManual: () => void;
  onAdvanceMonthManual: () => void;
  onResetCamera: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
}

export const TopHudBar: React.FC<TopHudBarProps> = ({
  gameState,
  currentLevelSpec,
  nextLevelSpec,
  seasonLabel,
  isTreasuryShaking,
  region9x9Unlocked,
  heatmapMode,
  advisorBriefing,
  advisorHudOpen,
  graphicQuality,
  isMuted,
  stopHudPropagation,
  onSwitchSeason,
  onOpenRegionMap,
  onLockedRegionClick,
  onToggleHeatmap,
  onCycleDayTickInterval,
  onOpenSettlementModal,
  onToggleAdvisorHud,
  onToggleGraphicQuality,
  onOpenHowToPlay,
  onAdvanceDayManual,
  onAdvanceMonthManual,
  onResetCamera,
  onToggleMute,
  onTogglePause,
}) => {
  // Mobile (<900px / lg): nút tối thiểu 40px chiều cao, chữ tối thiểu 12px (text-xs), cuộn ngang gọn gàng không chồng lấn.
  // Desktop (lg+): giữ nguyên kích thước gọn sắc nét vừa trọn 1 hàng ở 1280px.
  const toolbarBtnBase =
    'min-h-[40px] lg:min-h-0 px-2.5 lg:px-1.5 py-1.5 lg:py-0.5 rounded-md font-bold text-xs lg:text-[11px] whitespace-nowrap shrink-0 flex items-center justify-center transition-colors';

  return (
    <div className="w-full flex flex-col lg:flex-row lg:flex-wrap items-stretch lg:items-start justify-between gap-1">
      {/* Top-Left Cluster (.top-bar .hud-container): Cuộn ngang gọn trên Mobile, gọn trên Desktop */}
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
        className="top-bar hud-container pointer-events-auto max-w-full flex flex-nowrap lg:flex-wrap items-center justify-start gap-2 lg:gap-1.5 overflow-x-auto lg:overflow-visible custom-scrollbar text-xs rounded-lg border border-amber-500/35 bg-[#0d1722]/94 px-2 lg:px-1.5 py-1 shadow-xl"
      >
        <div className="pr-2 lg:pr-1.5 border-r border-slate-700/80 shrink-0 flex flex-row lg:flex-col items-center lg:items-start gap-1.5 lg:gap-0">
          <div className="flex flex-col">
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
                className="rounded bg-amber-400/20 border border-amber-400/60 px-1.5 lg:px-1 py-0 text-xs lg:text-[8px] leading-tight font-mono font-extrabold text-amber-200 whitespace-nowrap"
              >
                Lv.{gameState.cityLevel} {currentLevelSpec.title}
              </span>
            </div>
            <div
              data-testid="hud-date"
              title="Chu kỳ 3 mùa: Mùa Khô · Mùa Mưa Bão · Đỉnh Triều Cường (Bấm vào tên mùa để chuyển thử nghiệm)"
              className="text-xs lg:text-[10px] leading-tight font-mono tabular-nums font-bold text-slate-100 whitespace-nowrap flex items-center gap-1 mt-0.5"
            >
              <span>
                N{gameState.day}/30·T{gameState.month}/{gameState.year}
              </span>
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-season-badge-desktop"
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
                  onSwitchSeason(nextSeason);
                }}
                className="hidden lg:inline-flex rounded bg-cyan-500/20 border border-cyan-400/40 px-1 py-0 text-[9px] leading-tight font-bold text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
              >
                {seasonLabel}
              </button>
            </div>
          </div>
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
              onSwitchSeason(nextSeason);
            }}
            className="lg:hidden min-h-[40px] rounded bg-cyan-500/20 border border-cyan-400/40 px-2 py-1 text-xs leading-tight font-bold text-cyan-200 hover:bg-cyan-500/30 cursor-pointer whitespace-nowrap shrink-0"
          >
            {seasonLabel}
          </button>
        </div>

        <div
          data-testid="hud-treasury-card"
          className={`rounded-md px-0.5 py-0.5 transition-colors shrink-0 ${
            isTreasuryShaking
              ? 'hud-budget-shake bg-rose-500/25 border border-rose-400/70'
              : ''
          }`}
        >
          <div className="text-xs lg:text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
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
          <div className="text-xs lg:text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
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
          <div className="text-xs lg:text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
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
          <div className="text-xs lg:text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
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
          <div className="text-xs lg:text-[8px] leading-tight font-bold uppercase tracking-tight text-slate-400 whitespace-nowrap">
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
            <div className="text-xs lg:text-[8px] leading-tight font-extrabold uppercase tracking-tight text-rose-300 whitespace-nowrap">
              Khủng Hoảng ({gameState.crisisTimer}T)
            </div>
            <div className="text-xs lg:text-[9px] leading-tight font-mono font-bold whitespace-nowrap">
              PCI -{gameState.crisisMonthsElapsed * 5} · Di cư +
              {gameState.metrics.emigrationRatePercent}%
            </div>
          </div>
        )}
      </div>

      {/* Top-Right Cluster (.top-bar .hud-container): Cuộn ngang overflow-x-auto trên Mobile (nút >=40px, chữ >=12px), 1 hàng gọn trên Desktop 1280px */}
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
        className="top-bar hud-container pointer-events-auto lg:ml-auto max-w-full flex flex-nowrap lg:flex-wrap items-center justify-start lg:justify-end gap-1.5 lg:gap-1 overflow-x-auto lg:overflow-visible custom-scrollbar rounded-lg border border-slate-700/80 bg-[#0d1722]/94 px-1.5 py-1 shadow-xl"
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
              onLockedRegionClick();
              return;
            }
            soundEngine.playClick();
            onOpenRegionMap();
          }}
          className={`${toolbarBtnBase} border ${
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
            onToggleHeatmap();
          }}
          className={`${toolbarBtnBase} border cursor-pointer ${
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
            onCycleDayTickInterval();
          }}
          className={`${toolbarBtnBase} bg-slate-900/90 hover:bg-slate-800 border border-amber-400/50 font-mono text-amber-300 cursor-pointer`}
        >
          ⏱ {Math.round((gameState.dayTickIntervalMs || 6000) / 1000)}s/N
        </button>

        {/* Báo Cáo Quyết Toán Tài Chính */}
        <button
          type="button"
          tabIndex={-1}
          data-testid="settlement-notification-btn"
          title="Báo cáo Quyết toán Tài chính cuối tháng [B]"
          aria-label="Thông báo Báo cáo Quyết toán Tài chính cuối tháng [B]"
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            onOpenSettlementModal();
          }}
          className={`relative ${toolbarBtnBase} border cursor-pointer gap-1 ${
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

        {/* Trợ Lý Cố Vấn Kinh Tế */}
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
            onToggleAdvisorHud();
          }}
          className={`relative ${toolbarBtnBase} border cursor-pointer gap-1 ${
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
          title="Chuyển đổi Chất lượng Đồ họa 3D: Tả thực hoặc Mượt (Tối ưu FPS)"
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            onToggleGraphicQuality();
          }}
          className={`${toolbarBtnBase} border cursor-pointer ${
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
            onOpenHowToPlay();
          }}
          className={`${toolbarBtnBase} min-w-[40px] lg:min-w-0 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-extrabold cursor-pointer`}
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
            onAdvanceDayManual();
          }}
          className={`${toolbarBtnBase} bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer`}
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
            onAdvanceMonthManual();
          }}
          className={`${toolbarBtnBase} bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer`}
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
            onResetCamera();
          }}
          className={`${toolbarBtnBase} min-w-[40px] lg:min-w-0 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 lg:w-3.5 lg:h-3.5 fill-current">
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
            onToggleMute();
          }}
          className={`${toolbarBtnBase} min-w-[40px] lg:min-w-0 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer`}
        >
          {isMuted ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4 lg:w-3.5 lg:h-3.5 fill-current text-rose-400">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4 h-4 lg:w-3.5 lg:h-3.5 fill-current text-amber-300">
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
            onTogglePause();
          }}
          className={`${toolbarBtnBase} min-w-[40px] lg:min-w-0 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 lg:w-3.5 lg:h-3.5 fill-current">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
