import React, { useState } from 'react';
import {
  calculateLandClearanceCost,
  detectGhostCollision,
  detectRoadProximitySnap,
  EXPANSION_POP_TARGET,
  EXPANSION_TREASURY_TARGET,
  formatVnd,
  getRegionName,
  getTileDetailedReport,
  isBuiltStructure,
  isPolicyUnlockedAtLevel,
  isResidentialTile,
  isRoadTile,
  isWorkplaceTile,
  REGION_GRID_SIZE,
  runEndOfMonthSettlement,
  TILE_LABELS,
} from '../game/rules';
import {
  CityGameState,
  LedgerEntry,
  MacroPolicies,
  TileData,
  TileType,
  ToolId,
} from '../game/types';
import { HoverTileInfo } from './CityViewport3D';

/**
 * 1. Hover Name Tooltip:
 * - Khi lia chuột vào công trình: hiện gọn Tên Công Trình + Tiến độ thi công (nếu đang xây) + Sức chứa "CurrentOccupants / MaxCapacity người"
 * - Khi mô hình mờ (Ghost Preview) đè lên một công trình khác: cảnh báo đỏ rực rỡ "⛔ Va chạm công trình · Không thể đặt tại đây"
 * - Khi đang cầm công cụ Xây Đường lia vào ô đất trống: hiện trực quan chế độ Snapping (T-Junction / Cross-Intersection)
 */
export const BuildingHoverTooltip: React.FC<{
  hoverInfo: HoverTileInfo | null;
  grid: TileData[][];
  selectedTool?: ToolId;
  hasContextMenuOpen: boolean;
}> = ({ hoverInfo, grid, selectedTool, hasContextMenuOpen }) => {
  if (!hoverInfo || hasContextMenuOpen) return null;
  const tile = grid[hoverInfo.z]?.[hoverInfo.x];
  if (!tile) return null;

  const built = isBuiltStructure(tile.type);
  if (selectedTool === 'inspect' && !built) return null;

  const isPlacingRoad =
    !built && selectedTool && isRoadTile(selectedTool as TileType);
  const roadSnap = isPlacingRoad
    ? detectRoadProximitySnap(
        grid,
        hoverInfo.x,
        hoverInfo.z,
        selectedTool as TileType
      )
    : null;
  const collisionInfo = selectedTool
    ? detectGhostCollision(grid, hoverInfo.x, hoverInfo.z, selectedTool)
    : { isColliding: false };

  const reqWorkers =
    tile.requiredWorkers.unskilled +
    tile.requiredWorkers.skilled +
    tile.requiredWorkers.educated;
  const assWorkers =
    tile.assignedWorkers.unskilled +
    tile.assignedWorkers.skilled +
    tile.assignedWorkers.educated;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const tx = Math.max(8, Math.min(vw - 252, hoverInfo.clientX + 14));
  const ty = Math.max(52, Math.min(vh - 150, hoverInfo.clientY - 42));

  return (
    <div
      data-testid="building-hover-tooltip"
      data-colliding={collisionInfo.isColliding ? 'true' : 'false'}
      style={{
        transform: `translate3d(${tx}px, ${ty}px, 0)`,
      }}
      className={`fixed top-0 left-0 z-[1005] pointer-events-none rounded-lg border px-3 py-1.5 shadow-xl max-w-[244px] ${
        collisionInfo.isColliding
          ? 'border-rose-500 bg-rose-950/96 shadow-rose-950/60'
          : 'border-amber-400/50 bg-[#0b141e]/95'
      }`}
    >
      {collisionInfo.isColliding && (
        <div
          data-testid="ghost-collision-badge"
          className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300 mb-0.5 whitespace-nowrap"
        >
          ⛔ Va chạm công trình · Không thể đặt tại đây
        </div>
      )}

      <div className="flex items-center justify-between gap-1.5">
        <div className="text-xs font-bold text-amber-300 truncate">
          {built && tile.customName ? tile.customName : TILE_LABELS[tile.type]}
        </div>
        {built && tile.instanceId && (
          <span className="text-[9px] font-mono text-cyan-300 shrink-0">
            #{tile.instanceId}
          </span>
        )}
      </div>

      {built && tile.customName && (
        <div className="text-[10px] text-slate-400 truncate">
          {TILE_LABELS[tile.type]}
        </div>
      )}

      {tile.constructionRemainingDays > 0 && (
        <div className="text-[10px] font-semibold text-cyan-300 whitespace-nowrap">
          Đang xây dựng: Còn {tile.constructionRemainingDays}/
          {tile.constructionTotalDays} ngày
        </div>
      )}

      {isResidentialTile(tile.type) && (
        <div className="text-[10px] font-mono text-emerald-300 whitespace-nowrap">
          Cư dân: {tile.currentOccupants} / {tile.maxCapacity} người
        </div>
      )}

      {isWorkplaceTile(tile.type) && (
        <div className="text-[10px] font-mono text-sky-300 whitespace-nowrap">
          Nhân sự: {assWorkers} / {reqWorkers} người
        </div>
      )}

      {roadSnap && (
        <div className="text-[10px] font-semibold text-amber-200 whitespace-nowrap">
          Khớp nối: {roadSnap.junctionLabel}
        </div>
      )}

      {tile.isReservedPublicLand && (
        <div className="text-[10px] font-bold text-cyan-300 whitespace-nowrap">
          Đã khoanh quỹ đất công · Đất: {formatVnd(tile.landValue, true)}
        </div>
      )}

      {built && (
        <div className="text-[10px] text-slate-300 whitespace-nowrap">
          Chuột phải / Chạm: Xem thuế &amp; nhân sự
        </div>
      )}
    </div>
  );
};

/**
 * 2. Thanh Thông Tin Công Trình Nằm Ngang 3 Cột (Horizontal Zero-Scroll BuildingContextMenu):
 * - Gộp 3 cột song song: (1) Nhân Sự & Cư Dân, (2) Thuế & CIT, (3) Giải Tỏa & Cống Ngầm
 * - Không cần cuộn (Zero-Scroll), không che nút +1 Ngày / +1 Tháng ở Top Bar hay Bottom Dock trên màn hình 1280×720
 * - Hiển thị nút "Thả Chuột / Lia" nguyên vẹn không bị cắt chữ ở góc phải
 */
interface BuildingContextMenuProps {
  contextMenu: { x: number; z: number; clientX: number; clientY: number } | null;
  gameState: CityGameState;
  onUpdatePolicy: <K extends keyof MacroPolicies>(
    key: K,
    value: MacroPolicies[K]
  ) => void;
  onApplyToolOnTile: (x: number, z: number, tool: ToolId) => void;
  onUnreservePublicLand?: (x: number, z: number) => void;
  onMortgageReservedLand?: (x: number, z: number) => void;
  onRenameBuilding?: (x: number, z: number, newName: string) => void;
  onReleaseToPan?: () => void;
  onClose: () => void;
}

export const BuildingContextMenu: React.FC<BuildingContextMenuProps> = ({
  contextMenu,
  gameState,
  onUpdatePolicy,
  onApplyToolOnTile,
  onUnreservePublicLand,
  onMortgageReservedLand,
  onRenameBuilding,
  onReleaseToPan,
  onClose,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  if (!contextMenu) return null;
  const tile = gameState.grid[contextMenu.z]?.[contextMenu.x];
  if (!tile) return null;

  const citUnlocked = isPolicyUnlockedAtLevel('cit', gameState.cityLevel ?? 1);
  const isPrivateEduMed =
    tile.type === 'priv_hospital' || tile.type === 'priv_school';
  const isAlreadyMortgaged = (gameState.loans ?? []).some(
    (loan) =>
      loan.collateralTile &&
      loan.collateralTile.x === tile.x &&
      loan.collateralTile.z === tile.z
  );

  const report = getTileDetailedReport(
    gameState.grid,
    tile,
    gameState.policies,
    gameState.metrics,
    gameState.month,
    gameState.year,
    gameState.activeConcertMonths,
    gameState.difficulty
  );
  const clearance = calculateLandClearanceCost(
    tile,
    gameState.policies.compensationLevel,
    gameState.difficulty
  );

  const stopMenuEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      role="dialog"
      data-testid="building-context-menu"
      aria-label={`Menu chi tiết công trình ${report.customName}`}
      onMouseMove={stopMenuEvent}
      onMouseOver={stopMenuEvent}
      onClick={stopMenuEvent}
      onPointerDown={stopMenuEvent}
      onPointerMove={stopMenuEvent}
      onPointerUp={stopMenuEvent}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed top-[58px] left-1/2 -translate-x-1/2 z-[1010] hud-container pointer-events-auto w-[min(920px,calc(100vw-20px))] rounded-xl border border-amber-400/60 bg-[#0d1824]/98 px-3 py-2 text-slate-100 shadow-2xl"
    >
      {/* Thanh Tiêu Đề Ngang: Định danh + 5 chỉ số tài chính rút gọn + Nút Thả Chuột / Lia + Đóng */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            data-testid="context-instance-id"
            className="font-mono text-[11px] font-extrabold text-amber-300 shrink-0"
          >
            [{report.instanceId}]
          </span>

          {editingName && onRenameBuilding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nameDraft.trim()) {
                  onRenameBuilding(tile.x, tile.z, nameDraft.trim());
                }
                setEditingName(false);
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                aria-label="Đặt tên công trình"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-36 rounded bg-slate-900 border border-amber-400/60 px-2 py-0.5 text-xs font-bold text-amber-200 focus:outline-none"
              />
              <button
                type="submit"
                className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold cursor-pointer"
              >
                Lưu
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <h3
                data-testid="context-custom-name"
                className="text-xs sm:text-sm font-extrabold text-amber-300 truncate max-w-[180px] sm:max-w-[240px]"
              >
                {report.customName}
              </h3>
              {isBuiltStructure(tile.type) && onRenameBuilding && (
                <button
                  type="button"
                  aria-label="Đổi tên công trình"
                  onClick={() => {
                    setNameDraft(report.customName);
                    setEditingName(true);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] font-semibold text-slate-300 hover:text-amber-300 cursor-pointer shrink-0"
                >
                  Đổi tên
                </button>
              )}
            </div>
          )}

          <span className="text-[10px] text-slate-400 whitespace-nowrap">
            Ô ({tile.x + 1},{tile.z + 1}) · {report.title}
          </span>

          {report.isUnderConstruction && (
            <span className="rounded bg-amber-500/20 border border-amber-400/50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300 whitespace-nowrap">
              Đang xây: {report.constructionRemainingDays}/
              {report.constructionTotalDays}N
            </span>
          )}
        </div>

        {/* Chỉ số Tài chính / Phục vụ thực thể nằm ngang trên Header */}
        {isBuiltStructure(tile.type) && (
          <div
            data-testid="context-entity-financials"
            className="flex items-center gap-2 rounded-lg bg-[#09131d] border border-slate-700/80 px-2.5 py-1 font-mono text-[10px]"
          >
            {report.isPublicUtilityOrService ? (
              <>
                <div>
                  <span className="text-slate-400 font-sans mr-1">Công suất:</span>
                  <span className="font-bold text-sky-300">
                    {report.publicServiceBadgeLabel}
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 font-sans mr-1">Phí:</span>
                  <span className="font-bold text-rose-300">
                    -{formatVnd(report.maintenanceCost)}
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 font-sans mr-1">Ròng:</span>
                  <span className="font-extrabold text-rose-400">
                    {report.netIncome >= 0 ? '+' : ''}
                    {formatVnd(report.netIncome)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-slate-400 font-sans mr-1">DT:</span>
                  <span className="font-bold text-slate-100">
                    {formatVnd(report.revenue)}
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 font-sans mr-1">CIT:</span>
                  <span className="font-bold text-emerald-300">
                    +{formatVnd(report.taxCIT)}
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 font-sans mr-1">PIT:</span>
                  <span className="font-bold text-cyan-300">
                    +{formatVnd(report.taxPIT)}
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 font-sans mr-1">Phí:</span>
                  <span className="font-bold text-rose-300">
                    -{formatVnd(report.maintenanceCost)}
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 font-sans mr-1">Ròng:</span>
                  <span
                    className={`font-extrabold ${
                      report.netIncome >= 0 ? 'text-amber-300' : 'text-rose-400'
                    }`}
                  >
                    {report.netIncome >= 0 ? '+' : ''}
                    {formatVnd(report.netIncome)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Nút bên phải: Thả Chuột / Lia [ESC] (đóng bảng và trả về chế độ lia bản đồ) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="context-release-pan-btn"
            onClick={() => {
              if (onReleaseToPan) onReleaseToPan();
              onClose();
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-400/50 text-[11px] font-bold text-amber-200 cursor-pointer whitespace-nowrap shrink-0"
          >
            Thả Chuột / Lia [ESC]
          </button>
        </div>
      </div>

      {/* Bố cục Nằm Ngang 3 Cột (Zero-Scroll): 1. Nhân Sự & Dân · 2. Thuế & CIT · 3. Giải Tỏa & Cống Ngầm */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
        {/* CỘT 1: NHÂN SỰ & CƯ DÂN */}
        <div className="rounded-lg bg-[#142333] p-2 border border-slate-700/80 flex flex-col justify-between space-y-1.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
              <span className="font-extrabold text-amber-300 uppercase tracking-wide text-[10px]">
                1. Nhân Sự &amp; Cư Dân
              </span>
              {report.maxCapacity > 0 ? (
                <span
                  data-testid="context-occupants"
                  className="font-mono tabular-nums font-bold text-emerald-300"
                >
                  {report.currentOccupants} / {report.maxCapacity} người
                </span>
              ) : report.requiredWorkersTotal > 0 ? (
                <span
                  data-testid="context-workers"
                  className="font-mono tabular-nums font-bold text-sky-300"
                >
                  {report.assignedWorkersTotal} / {report.requiredWorkersTotal} người
                </span>
              ) : (
                <span className="font-mono tabular-nums text-slate-400">
                  0 / 0 người
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] pt-0.5">
              <div className="rounded bg-[#0d1824] px-1.5 py-1 border border-slate-800">
                <div className="text-slate-400">Phổ thông</div>
                <div className="font-mono font-bold text-emerald-300">
                  {report.requiredWorkersTotal > 0
                    ? `${report.assignedWorkers.unskilled}/${report.requiredWorkers.unskilled}`
                    : tile.type === 'res_high'
                    ? '0 (Khu cao cấp)'
                    : `${report.unskilledCount}`}
                </div>
              </div>
              <div className="rounded bg-[#0d1824] px-1.5 py-1 border border-slate-800">
                <div className="text-slate-400">Trung cấp</div>
                <div className="font-mono font-bold text-sky-300">
                  {report.requiredWorkersTotal > 0
                    ? `${report.assignedWorkers.skilled}/${report.requiredWorkers.skilled}`
                    : `${report.skilledCount}`}
                </div>
              </div>
              <div className="rounded bg-[#0d1824] px-1.5 py-1 border border-slate-800">
                <div className="text-slate-400">Bằng cấp</div>
                <div className="font-mono font-bold text-amber-300">
                  {report.requiredWorkersTotal > 0
                    ? `${report.assignedWorkers.educated}/${report.requiredWorkers.educated}`
                    : `${report.educatedCount}`}
                </div>
              </div>
            </div>

            {report.missingWorkersWarning && (
              <div
                data-testid="worker-shortage-warning"
                className="rounded bg-rose-500/20 border border-rose-400/60 px-2 py-1 text-[10px] text-rose-200 font-medium leading-tight"
              >
                ⚠️ {report.missingWorkersWarning}
              </div>
            )}
          </div>

          <div className="rounded bg-[#0d1824] px-2 py-1.5 text-[10px] text-slate-300 border border-slate-800 flex flex-wrap items-center justify-between gap-1.5">
            <span className="leading-snug break-words flex-1 min-w-0">
              <strong className="text-cyan-300">Phân tầng:</strong>{' '}
              {report.dominantLaborLabel}
            </span>
            {report.sectorOwnership && (
              <span
                data-testid="context-sector-ownership"
                className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                  report.sectorOwnership === 'public'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {report.sectorOwnership === 'public' ? 'Công lập' : 'Tư nhân'}
              </span>
            )}
          </div>
        </div>

        {/* CỘT 2: CÔNG SUẤT PHỤC VỤ CÔNG HOẶC THUẾ TNDN (CIT) */}
        <div
          data-testid="cit-monthly-dashboard"
          className="rounded-lg bg-[#142333] p-2 border border-slate-700/80 flex flex-col justify-between space-y-1.5"
        >
          {report.isPublicUtilityOrService ? (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
                  <span className="font-extrabold text-amber-300 uppercase tracking-wide text-[10px]">
                    2. Công Suất Phục Vụ
                  </span>
                  <span
                    data-testid="public-service-badge"
                    className="font-mono text-[10px] font-bold text-sky-300"
                  >
                    {report.publicServiceBadgeLabel}
                  </span>
                </div>

                <div
                  data-testid="public-service-summary"
                  className="rounded bg-[#0d1824] px-2 py-1.5 border border-sky-500/30 text-[10px] font-bold text-emerald-300"
                >
                  {report.publicServiceSummaryLabel}
                </div>

                {report.publicServiceDetailLabel && (
                  <div
                    data-testid="public-service-detail"
                    className="text-[10px] text-slate-300 leading-snug"
                  >
                    {report.publicServiceDetailLabel}
                  </div>
                )}

                {tile.type === 'pub_admin' &&
                  !report.isUnderConstruction &&
                  gameState.metrics.hasActivePublicAdmin && (
                    <div
                      data-testid="pub-admin-city-labor-card"
                      className="rounded bg-slate-900/90 border border-emerald-500/40 px-2 py-1.5 space-y-1 text-[10px]"
                    >
                      <div className="font-bold text-emerald-300">
                        Thống kê Nhân lực Toàn Thành Phố
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
                        <div className="rounded bg-[#0d1824] p-1 border border-slate-800">
                          <div className="text-slate-400 font-sans">Phổ thông</div>
                          <div className="text-emerald-300 font-bold">
                            {gameState.metrics.labor.employedUnskilled} có việc
                          </div>
                          <div className="text-amber-300">
                            {Math.max(
                              0,
                              gameState.metrics.labor.unskilled -
                                gameState.metrics.labor.employedUnskilled
                            )}{' '}
                            thất nghiệp
                          </div>
                        </div>
                        <div className="rounded bg-[#0d1824] p-1 border border-slate-800">
                          <div className="text-slate-400 font-sans">Trung cấp</div>
                          <div className="text-sky-300 font-bold">
                            {gameState.metrics.labor.employedSkilled} có việc
                          </div>
                          <div className="text-amber-300">
                            {Math.max(
                              0,
                              gameState.metrics.labor.skilled -
                                gameState.metrics.labor.employedSkilled
                            )}{' '}
                            thất nghiệp
                          </div>
                        </div>
                        <div className="rounded bg-[#0d1824] p-1 border border-slate-800">
                          <div className="text-slate-400 font-sans">Bằng cấp</div>
                          <div className="text-cyan-300 font-bold">
                            {gameState.metrics.labor.employedEducated} có việc
                          </div>
                          <div className="text-amber-300">
                            {Math.max(
                              0,
                              gameState.metrics.labor.educated -
                                gameState.metrics.labor.employedEducated
                            )}{' '}
                            thất nghiệp
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              <div className="rounded bg-[#0d1824] px-2 py-1 border border-slate-800 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Phí duy trì vận hành:</span>
                <span className="font-mono font-bold text-rose-300">
                  -{formatVnd(report.maintenanceCost, true)}/tháng
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
                  <span className="font-extrabold text-amber-300 uppercase tracking-wide text-[10px]">
                    2. Thuế &amp; Hiệu Suất CIT
                  </span>
                  <span className="font-mono text-[10px] font-bold text-emerald-300">
                    Hiệu suất {report.economicEfficiencyPercent}% · Cung {tile.localSupplyIndex ?? 0}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-300">
                    {isPrivateEduMed
                      ? `CIT thực thu (${report.corporateTaxRate}% · Ưu đãi XHH):`
                      : `CIT thực thu (${report.corporateTaxRate}%):`}
                  </span>
                  <span
                    data-testid="cit-current-revenue"
                    className="font-mono tabular-nums font-bold text-emerald-300"
                  >
                    +{formatVnd(report.corporateTaxRevenue, true)}/tháng
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-300">Thuế PIT · Đóng góp ròng:</span>
                  <span className="font-mono tabular-nums font-bold text-cyan-300">
                    +{formatVnd(report.pitTaxRevenue, true)} ·{' '}
                    <span
                      className={
                        report.netEconomicContribution >= 0
                          ? 'text-amber-300'
                          : 'text-rose-300'
                      }
                    >
                      {report.netEconomicContribution >= 0 ? '+' : ''}
                      {formatVnd(report.netEconomicContribution, true)}
                    </span>
                  </span>
                </div>

                {/* Dòng CIT theo tháng (Zero-Scroll: 2 kỳ gần nhất nằm ngang) */}
                <div
                  data-testid="cit-quick-summary"
                  className="grid grid-cols-2 gap-1 pt-0.5"
                >
                  {report.monthlyCitBreakdown.slice(0, 2).map((item) => (
                    <div
                      key={item.monthLabel}
                      data-testid="cit-monthly-row"
                      className="rounded bg-[#0d1824] px-1.5 py-1 border border-slate-800 flex items-center justify-between text-[10px]"
                    >
                      <span className="text-slate-300 font-semibold truncate">
                        {item.monthLabel}:
                      </span>
                      <span className="font-mono font-bold text-emerald-300 shrink-0">
                        +{formatVnd(item.citRevenueBillion, true)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {report.corporateTaxKey ? (
                <div className="rounded bg-[#0d1824] px-2 py-1 border border-slate-800 space-y-0.5">
                  <label className="flex justify-between gap-1 text-[10px] text-amber-200 font-semibold">
                    <span className="truncate">{report.corporateTaxLabel}</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {isPrivateEduMed
                        ? `${report.corporateTaxRate}% (TM ${gameState.policies.citMarket}%)`
                        : `${report.corporateTaxRate}%`}
                    </span>
                  </label>
                  <input
                    data-testid="context-cit-slider"
                    type="range"
                    min={5}
                    max={30}
                    disabled={!citUnlocked}
                    value={Number(gameState.policies[report.corporateTaxKey] ?? report.corporateTaxRate)}
                    onChange={(e) =>
                      citUnlocked &&
                      onUpdatePolicy(
                        report.corporateTaxKey!,
                        Number(e.target.value) as never
                      )
                    }
                    className={`w-full h-1.5 accent-amber-400 ${
                      citUnlocked
                        ? 'cursor-pointer'
                        : 'cursor-not-allowed opacity-50'
                    }`}
                  />
                  {!citUnlocked && (
                    <div
                      data-testid="context-cit-lock-note"
                      className="text-[10px] font-semibold text-amber-300"
                    >
                      🔒 Mở khóa chỉnh thuế CIT ở Level 4 (900 dân)
                    </div>
                  )}
                  {isPrivateEduMed && (
                    <div className="text-[9px] text-emerald-300">
                      Chính sách ưu đãi XHH: Áp 50% thuế Thương mại, trần tối đa 10% (không bị áp 30%).
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded bg-[#0d1824] px-2 py-1 border border-slate-800 text-[10px] text-slate-400">
                  Sản lượng: {formatVnd(report.grossOutputBillion, true)}/tháng
                </div>
              )}
            </>
          )}
        </div>

        {/* CỘT 3: GIẢI TỎA MẶT BẰNG & CỐNG NGẦM THOÁT NƯỚC */}
        <div className="rounded-lg bg-[#142333] p-2 border border-slate-700/80 flex flex-col justify-between space-y-1.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
              <span className="font-extrabold text-amber-300 uppercase tracking-wide text-[10px]">
                3. Giải Tỏa &amp; Quỹ Đất
              </span>
              <span
                data-testid="context-land-value"
                className="font-mono text-[10px] font-bold text-amber-200"
              >
                Đất: {formatVnd(tile.landValue, true)}
              </span>
            </div>

            {tile.isReservedPublicLand && (
              <div
                data-testid="context-reserved-land-badge"
                className="rounded bg-cyan-950/80 border border-cyan-400/50 px-2 py-1 text-[10px] font-bold text-cyan-200 flex items-center justify-between"
              >
                <span>Đã khoanh quỹ đất công</span>
                <span className="font-mono text-cyan-300">
                  Cọc: {formatVnd(tile.reservedCostPaid ?? tile.landValue, true)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300">Hệ thống thoát nước:</span>
              <span className="font-semibold text-cyan-300">
                {tile.hasDrainage
                  ? 'Đã hoàn thiện'
                  : tile.drainageRemainingDays && tile.drainageRemainingDays > 0
                  ? `Đang lắp (${tile.drainageRemainingDays}N)`
                  : 'Chưa lắp đặt'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300">Chi phí giải phóng MB:</span>
              <span className="font-mono font-bold text-rose-300">
                {clearance.canClear
                  ? `-${formatVnd(clearance.compensationCost, true)}`
                  : 'Không thể giải tỏa'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-0.5">
            {tile.isReservedPublicLand && (
              <div className="flex flex-wrap items-center gap-1.5">
                {onUnreservePublicLand && (
                  <button
                    type="button"
                    data-testid="context-unreserve-land-btn"
                    disabled={isAlreadyMortgaged}
                    onClick={() => {
                      onUnreservePublicLand(tile.x, tile.z);
                      onClose();
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-extrabold text-[10px] whitespace-nowrap ${
                      isAlreadyMortgaged
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer'
                    }`}
                  >
                    Nhả đất &amp; Hoàn cọc (85%)
                  </button>
                )}
                {onMortgageReservedLand && (
                  <button
                    type="button"
                    data-testid="context-mortgage-land-btn"
                    disabled={isAlreadyMortgaged}
                    onClick={() => {
                      onMortgageReservedLand(tile.x, tile.z);
                      onClose();
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-extrabold text-[10px] whitespace-nowrap ${
                      isAlreadyMortgaged
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                    }`}
                  >
                    {isAlreadyMortgaged
                      ? 'Đang thế chấp NH'
                      : 'Cầm cố đất vay 70% (0,6%/th)'}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              {!tile.hasDrainage && tile.type !== 'river_water' && (
                <button
                  type="button"
                  data-testid="context-drainage-btn"
                  onClick={() => {
                    onApplyToolOnTile(tile.x, tile.z, 'sub_drainage');
                    onClose();
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-[10px] cursor-pointer whitespace-nowrap"
                >
                  Lắp Cống (-15Tr)
                </button>
              )}

              {clearance.canClear && (
                <button
                  type="button"
                  data-testid="context-clearance-btn"
                  onClick={() => {
                    onApplyToolOnTile(tile.x, tile.z, 'act_clearance');
                    onClose();
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-[10px] cursor-pointer whitespace-nowrap"
                >
                  Đền Bù Giải Tỏa (-{formatVnd(clearance.compensationCost, true)})
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 3. Bảng Hướng Dẫn Chơi & Cài Đặt Lưu Tự Động (How to Play & Auto-Save Settings Modal)
 */
export const HowToPlayModal: React.FC<{
  open: boolean;
  lastSavedAt?: string | null;
  onClearAutoSave?: () => void;
  onClose: () => void;
}> = ({ open, lastSavedAt, onClearAutoSave, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hướng dẫn cách chơi Thịnh Vượng"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#060c13]/85 p-4"
    >
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-amber-400/50 bg-[#0e1925] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Cẩm Nang Thị Trưởng &amp; Cài Đặt Hệ Thống
            </div>
            <h2 className="text-xl font-extrabold text-white">
              Hướng Dẫn Cách Chơi &amp; Lưu Tiến Trình Tự Động
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer"
          >
            Đã Hiểu · Đóng [Esc]
          </button>
        </div>

        {/* Trạng thái Auto-Save thầm lặng vào localStorage */}
        <div
          data-testid="settings-autosave-status"
          className="mb-4 rounded-xl bg-[#132638] border border-emerald-500/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-bold text-emerald-300">
              Lưu Tự Động (Silent Auto-Save):
            </span>
            <span data-testid="autosave-timestamp" className="font-mono text-slate-200">
              {lastSavedAt
                ? `Đã lưu lúc ${lastSavedAt} (Tự động sau mỗi ngày/tháng)`
                : 'Đang chờ nhịp lưu tự động đầu tiên...'}
            </span>
          </div>
          {onClearAutoSave && (
            <button
              type="button"
              data-testid="clear-autosave-btn"
              onClick={onClearAutoSave}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/80 border border-slate-600 hover:border-rose-400 text-[11px] font-semibold text-slate-300 hover:text-rose-200 cursor-pointer"
            >
              Xóa Dữ Liệu Lưu Tạm
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
          <div className="rounded-xl bg-[#142334] p-4 border border-slate-700/80 space-y-2">
            <h3 className="text-sm font-bold text-amber-300">
              1. Cấp Độ Đô Thị (Level 1–5) &amp; Mở Khóa Dần
            </h3>
            <p className="text-slate-300">
              • <strong>Ngân sách khởi điểm:</strong> <strong>50 Tỷ VNĐ</strong>. Thành phố khởi đầu ở <strong>Level 1 (Phường Khởi Nghiệp)</strong> với nhóm công trình nền tảng (Đường xá, Nhà ống, Chợ, Nông trại, Điện/Nước) và thuế suất cố định.
            </p>
            <p className="text-slate-300">
              • <strong>Mở khóa theo Dân số:</strong> Đạt <strong>150 dân (Lv.2)</strong> mở Y tế/Giáo dục công &amp; Thuế PIT; <strong>450 dân (Lv.3)</strong> mở Nhà máy, Y tế/Giáo dục tư &amp; Đền bù; <strong>900 dân (Lv.4)</strong> mở Cao ốc, FDI &amp; Thuế CIT; <strong>1.200 dân (Lv.5)</strong> mở Showbiz &amp; Bản đồ vùng 9×9.
            </p>
          </div>

          <div className="rounded-xl bg-[#142334] p-4 border border-slate-700/80 space-y-2">
            <h3 className="text-sm font-bold text-cyan-300">
              2. Di Cư Tự Nhiên &amp; Phân Tầng Bất Động Sản
            </h3>
            <p className="text-slate-300">
              • <strong>Tách biệt Vỏ &amp; Lõi (0 / MaxCapacity):</strong> Khi vừa xây xong nhà ở hoặc bệnh viện, số người là <strong>0 / Sức chứa tối đa</strong> (Nhà ống: 0/8 người, Chung cư mini: 0/120 người, Chung cư cao cấp: 0/600 người).
            </p>
            <p className="text-slate-300">
              • <strong>Hệ thống Di cư:</strong> Mỗi ngày trong game, người dân sẽ di cư từ từ từng nhóm vào các khu dân cư còn chỗ trống khi có đường nối và điện nước.
            </p>
            <p className="text-slate-300">
              • <strong>Phân tầng Bất động sản:</strong> Lao động phổ thông chỉ ở Nhà ống/Chung cư mini. <strong>Chung Cư Cao Cấp</strong> yêu cầu <strong>Phân tầng Thu nhập Cao</strong>, chỉ có Lao động trung cấp và Có bằng cấp sinh sống!
            </p>
          </div>

          <div className="rounded-xl bg-[#142334] p-4 border border-slate-700/80 space-y-2">
            <h3 className="text-sm font-bold text-emerald-300">
              3. Liên Kết Việc Làm &amp; Bảng Điều Khiển CIT Theo Tháng
            </h3>
            <p className="text-slate-300">
              • <strong>Vòng lặp Cung – Cầu Nhân sự:</strong> Các công trình cần <strong>20 – 50 nhân sự</strong> theo đúng trình độ học vấn (Bệnh viện &amp; Trường học cần 35 người gồm 20 Bác sĩ/Giảng viên có bằng cấp; Chợ cần 30 người chủ yếu phổ thông).
            </p>
            <p className="text-slate-300">
              • <strong>Thanh thông tin công trình 3 cột:</strong> Click Chuột Phải vào công trình để xem đồng thời Nhân sự, Thuế CIT theo tháng và Giải tỏa trên cùng một thanh ngang không cần cuộn.
            </p>
          </div>

          <div className="rounded-xl bg-[#142334] p-4 border border-slate-700/80 space-y-2">
            <h3 className="text-sm font-bold text-rose-300">
              4. Cơ Chế Khủng Hoảng 3 Tháng (Grace Period) &amp; Cứu Vãn
            </h3>
            <p className="text-slate-300">
              • <strong>Kích hoạt Cảnh báo (Cuối tháng):</strong> Nếu <strong>Hạnh phúc &lt; 30%</strong>, <strong>An sinh &lt; 20%</strong>, hoặc <strong>Ngân sách âm 2 tháng liên tiếp</strong>, thành phố bước vào trạng thái <strong>Khủng hoảng (3 tháng)</strong> thay vì thua ngay lập tức.
            </p>
            <p className="text-slate-300">
              • <strong>Hậu quả &amp; Cứu vãn:</strong> Mỗi tháng khủng hoảng làm <strong>PCI -5 điểm</strong> và <strong>Di cư +10%</strong>. Hãy tăng <strong>Trợ cấp An sinh</strong>, giảm <strong>Thuế TNCN (PIT)</strong> hoặc chọn đền bù <strong>Cao 135%</strong> để đưa Hạnh phúc &gt; 40% và xóa bỏ khủng hoảng!
            </p>
          </div>
        </div>

        {/* Bảng Hệ thống Phím Tắt Chuẩn Hóa (Zero-Collision Hotkeys) */}
        <div
          data-testid="howtoplay-hotkeys-card"
          className="mt-4 rounded-xl bg-[#111f2e] border border-cyan-500/40 p-4 text-xs space-y-2"
        >
          <div className="font-extrabold text-cyan-300 uppercase tracking-wider text-[11px]">
            5. Hệ Thống Phím Tắt Chuẩn Hóa (Zero-Collision · Không Trùng W/A/S/D)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-200 font-mono">
            <div>
              • <strong className="text-amber-300">F1–F4:</strong> Chuyển 4 Tab công trình (Đường · Phân lô · Hạ tầng · Đặc biệt)
            </div>
            <div>
              • <strong className="text-amber-300">Phím số 1–9, 0:</strong> Chọn nhanh công trình theo thứ tự trong Tab đang mở
            </div>
            <div>
              • <strong className="text-emerald-300">W/A/S/D · ↑↓←→:</strong> Di chuyển Camera
            </div>
            <div>
              • <strong className="text-emerald-300">T / G / C / B:</strong> Thuế [T] · Giao thông [G] · Cố vấn [C] · Báo cáo [B]
            </div>
            <div>
              • <strong className="text-sky-300">E / Q / V / J:</strong> Vùng 9×9 [E] · Nhiệm vụ [Q] · Cống ngầm [V] · Concert [J]
            </div>
            <div>
              • <strong className="text-sky-300">H / Space·P / R / Esc:</strong> Ẩn HUD [H] · Pause [Space/P] · Reset [R] · Đóng/Thả [Esc]
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 4. Bản Đồ Mở Rộng Đại Đô Thị 9x9 Thành Phố (RegionMap9x9Modal)
 */
export const RegionMap9x9Modal: React.FC<{
  open: boolean;
  gameState: CityGameState;
  onSelectRegion: (rx: number, rz: number) => void;
  onClose: () => void;
}> = ({ open, gameState, onSelectRegion, onClose }) => {
  if (!open) return null;

  const popReady = gameState.metrics.population >= EXPANSION_POP_TARGET;
  const cashReady = gameState.treasury >= EXPANSION_TREASURY_TARGET;
  const canUnlockNew = popReady && cashReady;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bản đồ vùng đại đô thị 9x9"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#060c13]/85 p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-amber-400/50 bg-[#0e1925] p-5 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Quy Hoạch Vùng Liên Tỉnh (81 Đô Thị Vệ Tinh)
            </div>
            <h2 className="text-lg font-extrabold text-white">
              Bản Đồ Mở Rộng Vùng Đô Thị 9×9
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-600 cursor-pointer"
          >
            Đóng Bản Đồ [Esc]
          </button>
        </div>

        {/* Điều kiện mở khóa vùng mới */}
        <div className="mb-4 rounded-xl bg-[#142334] p-3 border border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-bold text-amber-300">
              Điều kiện mở rộng sang thành phố mới:
            </span>{' '}
            Đạt dân số{' '}
            <strong className="text-white">
              &ge; {EXPANSION_POP_TARGET.toLocaleString('vi-VN')} người
            </strong>{' '}
            và ngân sách nguyên dương{' '}
            <strong className="text-white">
              &ge; {EXPANSION_TREASURY_TARGET} Tỷ VNĐ
            </strong>
            .
          </div>
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span
              className={
                popReady ? 'text-emerald-300 font-bold' : 'text-rose-300'
              }
            >
              Dân số: {gameState.metrics.population.toLocaleString('vi-VN')} /{' '}
              {EXPANSION_POP_TARGET.toLocaleString('vi-VN')}
            </span>
            <span>·</span>
            <span
              className={
                cashReady ? 'text-emerald-300 font-bold' : 'text-rose-300'
              }
            >
              Ngân sách: {formatVnd(gameState.treasury)} /{' '}
              {EXPANSION_TREASURY_TARGET} Tỷ
            </span>
          </div>
        </div>

        {/* Lưới 9x9 Vùng Thành Phố */}
        <div className="grid grid-cols-9 gap-1.5 bg-[#091119] p-3 rounded-xl border border-slate-800">
          {Array.from({ length: REGION_GRID_SIZE }).map((_, rz) =>
            Array.from({ length: REGION_GRID_SIZE }).map((__, rx) => {
              const key = `${rx},${rz}`;
              const isUnlocked = gameState.unlockedRegions.includes(key);
              const isActive =
                gameState.activeRegion.rx === rx &&
                gameState.activeRegion.rz === rz;

              return (
                <button
                  key={key}
                  type="button"
                  title={getRegionName(rx, rz)}
                  onClick={() => onSelectRegion(rx, rz)}
                  className={`h-11 rounded-lg border text-[10px] font-mono font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 border-white shadow-lg scale-105'
                      : isUnlocked
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60 hover:bg-emerald-500/40'
                      : canUnlockNew
                      ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40 hover:bg-cyan-500/30'
                      : 'bg-slate-900/90 text-slate-500 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>
                    {rx + 1},{rz + 1}
                  </span>
                  <span className="text-[8px] font-sans">
                    {isActive
                      ? 'Đang ở'
                      : isUnlocked
                      ? 'Đã mở'
                      : canUnlockNew
                      ? '+Mở'
                      : 'Khóa'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 5. Báo Cáo Quyết Toán Tài Chính Cuối Tháng (End-of-Month Settlement Pop-up) & Hệ Thống Sổ Cái (GlobalLedger)
 * Hiển thị tự động vào Ngày 30 hàng tháng (hoặc khi người chơi bấm icon Sổ Cái [L] trên thanh HUD):
 * - Thuế Doanh Nghiệp (CIT): Sản lượng thực tế × Thuế suất từng doanh nghiệp/chợ
 * - Thuế Người Dân (PIT): Quét nhân khẩu & phân tầng lao động tại các khu dân cư (Nhà ống, Chung cư)
 * - Phí Duy Trì (Upkeep): Đường bộ, cống ngầm, công trình công cộng & an sinh
 * - Sổ Cái Chi Tiết Từng Thực Thể (InstanceID, CustomName, revenue, taxPIT, taxCIT, maintenanceCost, netIncome)
 * - Lịch Sử Dòng Tiền Toàn Cục (GlobalLedger)
 */
export const MonthlySettlementModal: React.FC<{
  open: boolean;
  gameState: CityGameState;
  onClose: () => void;
}> = ({ open, gameState, onClose }) => {
  const [activeTab, setActiveTab] = useState<'entities' | 'history'>('entities');

  if (!open) return null;

  // Nếu đã có báo cáo chốt cuối tháng (Ngày 30) thì hiển thị báo cáo đó; nếu mở xem trước trong tháng thì tính toán trực tiếp từ thực thể trên bản đồ
  const report: LedgerEntry =
    gameState.latestSettlementReport ??
    runEndOfMonthSettlement(
      gameState.grid,
      gameState.policies,
      gameState.metrics,
      gameState.month,
      gameState.year,
      gameState.season,
      gameState.treasury,
      0,
      gameState.activeConcertMonths,
      gameState.difficulty
    );

  const ledgerHistory = [...(gameState.globalLedger ?? [])].reverse();

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="monthly-settlement-modal"
      aria-label="Báo cáo quyết toán tài chính cuối tháng và Sổ cái GlobalLedger"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-[#060c13]/85 p-3 sm:p-4 pointer-events-auto"
    >
      <div className="w-full max-w-4xl max-h-[82vh] overflow-y-auto info-panel-scroll custom-scrollbar rounded-2xl border border-amber-400/60 bg-[#0d1824]/98 p-4 sm:p-5 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-700/80 pb-3 mb-3.5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Hệ Thống Sổ Cái (GlobalLedger) · Chu Kỳ Quyết Toán Ngày 30
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              Báo Cáo Quyết Toán Tài Chính Kỳ T{report.month}/{report.year}
            </h2>
          </div>

          <button
            type="button"
            data-testid="close-settlement-modal-btn"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer"
          >
            Đóng Báo Cáo [Esc]
          </button>
        </div>

        {/* 4 Hạng mục Quyết toán Chính (CIT, PIT, Upkeep, Net Income) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div
            data-testid="settlement-cit-card"
            className="rounded-xl bg-[#122436] border border-emerald-500/40 p-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              1. Thuế Doanh Nghiệp (CIT)
            </div>
            <div
              data-testid="settlement-total-cit"
              className="mt-1 font-mono tabular-nums text-base sm:text-lg font-extrabold text-emerald-300"
            >
              +{formatVnd(report.totalTaxCIT, true)}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-300">
              Sản lượng gộp: {formatVnd(report.totalRevenue, true)}
            </div>
          </div>

          <div
            data-testid="settlement-pit-card"
            className="rounded-xl bg-[#122436] border border-cyan-500/40 p-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              2. Thuế Người Dân (PIT)
            </div>
            <div
              data-testid="settlement-total-pit"
              className="mt-1 font-mono tabular-nums text-base sm:text-lg font-extrabold text-cyan-300"
            >
              +{formatVnd(report.totalTaxPIT, true)}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-300">
              Nhân khẩu: {gameState.metrics.population.toLocaleString('vi-VN')} dân ·{' '}
              <span
                data-testid="settlement-tax-efficiency-status"
                className={
                  gameState.metrics.hasActivePublicAdmin
                    ? 'text-emerald-300 font-bold'
                    : 'text-amber-300 font-bold'
                }
              >
                {gameState.metrics.hasActivePublicAdmin
                  ? 'Hiệu lực thu thuế: 100% (Chống thất thoát)'
                  : 'Thất thoát hành chính 12% (Chưa có UBND đủ nhân sự)'}
              </span>
            </div>
          </div>

          <div
            data-testid="settlement-upkeep-card"
            className="rounded-xl bg-[#122436] border border-rose-500/40 p-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
              3. Phí Duy Trì (Upkeep)
            </div>
            <div
              data-testid="settlement-total-upkeep"
              className="mt-1 font-mono tabular-nums text-base sm:text-lg font-extrabold text-rose-300"
            >
              -{formatVnd(report.totalMaintenanceCost + report.welfareAndFloodCost, true)}
            </div>
            <div
              data-testid="settlement-upkeep-breakdown"
              className="mt-0.5 text-[10px] text-slate-300"
            >
              Vận hành công trình: -{formatVnd(report.buildingMaintenanceCost ?? 0)} · Đường/Cống ({report.roadAndDrainageTileCount} ô): -{formatVnd(report.infraMaintenanceCost ?? 0)} · An sinh: -{formatVnd(report.welfareAndFloodCost)}
            </div>
          </div>

          <div
            data-testid="settlement-net-card"
            className="rounded-xl bg-[#122436] border border-amber-400/50 p-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              4. Cân Đối Ròng Tháng
            </div>
            <div
              data-testid="settlement-net-income"
              className={`mt-1 font-mono tabular-nums text-base sm:text-lg font-extrabold ${
                report.netIncome >= 0 ? 'text-amber-300' : 'text-rose-400'
              }`}
            >
              {report.netIncome >= 0 ? '+' : ''}
              {formatVnd(report.netIncome, true)}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-300">
              Quỹ kho bạc: <strong className="text-white">{formatVnd(report.treasuryAfter, true)}</strong>
            </div>
          </div>
        </div>

        {/* Chuyển đổi giữa Chi tiết từng Thực thể (Entity Breakdown) và Sổ cái Lịch sử (GlobalLedger) */}
        <div className="flex items-center justify-between gap-2 mb-2.5 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('entities')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'entities'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Chi Tiết Từng Thực Thể ({report.entityBreakdown.length} công trình)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'history'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Sổ Cái Lịch Sử GlobalLedger ({ledgerHistory.length} bản ghi)
            </button>
          </div>
          <div className="hidden sm:block text-[11px] text-slate-400">
            Mỗi công trình có <span className="text-amber-300 font-mono">InstanceID</span> &amp; <span className="text-amber-300">CustomName</span> riêng
          </div>
        </div>

        {activeTab === 'entities' ? (
          <div className="rounded-xl border border-slate-800 bg-[#09121b] overflow-x-auto max-h-[38vh] overflow-y-auto custom-scrollbar">
            {report.entityBreakdown.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Chưa có công trình nào được xây dựng trên bản đồ. Hãy đặt Đường hoặc Công trình để hệ thống tự động cấp <span className="text-amber-300 font-mono">InstanceID</span> &amp; <span className="text-amber-300">CustomName</span>!
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#101e2d] text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="py-2 px-2.5">InstanceID</th>
                    <th className="py-2 px-2.5">Tên Công Trình (CustomName)</th>
                    <th className="py-2 px-2.5">Quy Mô</th>
                    <th className="py-2 px-2.5 text-right">Doanh Thu</th>
                    <th className="py-2 px-2.5 text-right">Thuế CIT</th>
                    <th className="py-2 px-2.5 text-right">Thuế PIT</th>
                    <th className="py-2 px-2.5 text-right">Phí Duy Trì</th>
                    <th className="py-2 px-2.5 text-right">Thu Nhập Ròng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                  {report.entityBreakdown.map((ent) => (
                    <tr
                      key={`${ent.instanceId}-${ent.x}-${ent.z}`}
                      data-testid="settlement-entity-row"
                      className="hover:bg-slate-800/40"
                    >
                      <td className="py-1.5 px-2.5 text-amber-300 font-bold whitespace-nowrap">
                        {ent.instanceId}
                      </td>
                      <td className="py-1.5 px-2.5 font-sans font-semibold text-slate-100 whitespace-nowrap">
                        {ent.customName}{' '}
                        <span className="text-[10px] text-slate-400">
                          ({ent.x + 1},{ent.z + 1})
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 font-sans text-slate-300 whitespace-nowrap">
                        {ent.occupantsOrWorkers}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-slate-200 whitespace-nowrap">
                        {formatVnd(ent.revenue)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-emerald-300 whitespace-nowrap">
                        +{formatVnd(ent.taxCIT)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-cyan-300 whitespace-nowrap">
                        +{formatVnd(ent.taxPIT)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-rose-300 whitespace-nowrap">
                        -{formatVnd(ent.maintenanceCost)}
                      </td>
                      <td
                        className={`py-1.5 px-2.5 text-right font-bold whitespace-nowrap ${
                          ent.netIncome >= 0 ? 'text-amber-300' : 'text-rose-400'
                        }`}
                      >
                        {ent.netIncome >= 0 ? '+' : ''}
                        {formatVnd(ent.netIncome)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[38vh] overflow-y-auto custom-scrollbar pr-1">
            {ledgerHistory.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-[#09121b] p-6 text-center text-xs text-slate-400">
                Sổ cái GlobalLedger chưa có giao dịch nào.
              </div>
            ) : (
              ledgerHistory.map((item) => (
                <div
                  key={item.id}
                  data-testid="global-ledger-entry"
                  className="rounded-lg border border-slate-800 bg-[#09121b] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-amber-300">
                        N{item.day}/T{item.month}/{item.year}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          item.entryType === 'monthly_settlement'
                            ? 'text-emerald-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {item.entryType === 'monthly_settlement'
                          ? 'Quyết Toán Cuối Tháng'
                          : 'Đầu Tư Xây Dựng'}
                      </span>
                    </div>
                    <div className="text-slate-200 font-medium mt-0.5">
                      {item.summary}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div
                      className={`font-bold ${
                        item.netIncome >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {item.netIncome >= 0 ? '+' : ''}
                      {formatVnd(item.netIncome, true)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Số dư: {formatVnd(item.treasuryAfter, true)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

