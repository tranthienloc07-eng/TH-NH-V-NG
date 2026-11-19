import React from 'react';
import {
  getPolicyUnlockRequirementLabel,
  isPolicyUnlockedAtLevel,
} from '../game/rules';
import {
  CityLevel,
  CompensationLevel,
  MacroMetrics,
  MacroPolicies,
  SidewalkPolicy,
  TransitLevel,
} from '../game/types';

interface MacroPolicyDrawerProps {
  activeTab: 'economy' | 'traffic' | null;
  policies: MacroPolicies;
  metrics: MacroMetrics;
  activeConcertMonths: number;
  cityLevel?: CityLevel;
  onUpdatePolicy: <K extends keyof MacroPolicies>(
    key: K,
    value: MacroPolicies[K]
  ) => void;
  onTriggerConcert: () => void;
  onClose: () => void;
}

export const MacroPolicyDrawer: React.FC<MacroPolicyDrawerProps> = ({
  activeTab,
  policies,
  metrics,
  activeConcertMonths,
  cityLevel = 5,
  onUpdatePolicy,
  onTriggerConcert,
  onClose,
}) => {
  if (!activeTab) return null;

  const pitUnlocked = isPolicyUnlockedAtLevel('pit', cityLevel);
  const citUnlocked = isPolicyUnlockedAtLevel('cit', cityLevel);
  const compUnlocked = isPolicyUnlockedAtLevel('compensation', cityLevel);
  const welfareUnlocked = isPolicyUnlockedAtLevel('welfare', cityLevel);
  const concertUnlocked = isPolicyUnlockedAtLevel('concert', cityLevel);

  const stopDrawerEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <section
      aria-label={
        activeTab === 'economy'
          ? 'Bảng Điều Hành Kinh Tế Vĩ Mô & Thuế'
          : 'Bảng Điều Tiết Giao Thông & Hậu Cần'
      }
      style={{ maxHeight: '80vh', overflowY: 'auto' }}
      onMouseMove={stopDrawerEvent}
      onMouseOver={stopDrawerEvent}
      onClick={stopDrawerEvent}
      onPointerDown={stopDrawerEvent}
      onPointerMove={stopDrawerEvent}
      onPointerUp={stopDrawerEvent}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="hud-container info-panel-scroll custom-scrollbar pointer-events-auto w-full max-w-[920px] max-h-[80vh] overflow-y-auto mb-2 rounded-xl border border-amber-500/35 bg-[#0f1924]/95 p-3.5 text-slate-100 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-700/70 pb-2 mb-2.5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-amber-300">
            {activeTab === 'economy'
              ? 'Điều Hành Kinh Tế Vĩ Mô, 5 Sắc Thuế CIT/PIT & Đền Bù Giải Tỏa'
              : 'Điều Tiết Vận Tải Công Cộng (Bus/BRT), Vỉa Hè Cấp Phép & An Ninh Lương Thực'}
          </h2>
          <p className="text-xs text-slate-300">
            {activeTab === 'economy'
              ? 'PCI = Hạ tầng (40%) + Hành chính (30%) + Ưu đãi Thuế FDI (30%) · Cẩn trọng ngưỡng Thuế TNCN Bằng cấp > 25%'
              : 'Đầu tư Bus/BRT mở rộng bán kính việc làm, Trạm thu phí bù đắp đường bộ, Vỉa hè cấp phép & Chuỗi cung ứng lương thực'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 cursor-pointer whitespace-nowrap shrink-0"
        >
          Đóng Bảng [Esc]
        </button>
      </div>

      {activeTab === 'economy' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          {/* Column 1: Thuế TNCN Lũy tiến & Phân tầng Lao động */}
          <div
            data-testid="policy-col-pit"
            className={`rounded-lg bg-[#152231] p-3 border space-y-2 ${
              pitUnlocked
                ? 'border-slate-700/70'
                : 'border-slate-700/50 opacity-80'
            }`}
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between">
              <span>Thuế Thu Nhập Cá Nhân (PIT)</span>
              <span className="font-mono tabular-nums text-slate-300">
                {pitUnlocked ? '0%–35%' : '🔒 Lv.2'}
              </span>
            </div>

            {!pitUnlocked && (
              <div
                data-testid="pit-lock-banner"
                className="rounded bg-slate-900/90 border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 font-semibold"
              >
                🔒 {getPolicyUnlockRequirementLabel('pit')}
              </div>
            )}

            <div>
              <label
                htmlFor="pit-low-slider"
                className="flex justify-between gap-2 text-slate-300 mb-0.5"
              >
                <span>
                  {metrics.hasActivePublicAdmin
                    ? `Phổ thông: ${metrics.labor.unskilled} người (${metrics.labor.employedUnskilled} có việc · ${Math.max(0, metrics.labor.unskilled - metrics.labor.employedUnskilled)} chưa có việc)`
                    : `Lao động phổ thông (${metrics.labor.unskilled} người)`}
                </span>
                <span className="font-mono tabular-nums font-bold text-emerald-300 shrink-0">
                  {policies.pitLow}%
                </span>
              </label>
              <input
                id="pit-low-slider"
                type="range"
                min={0}
                max={35}
                disabled={!pitUnlocked}
                value={policies.pitLow}
                onChange={(e) =>
                  pitUnlocked &&
                  onUpdatePolicy('pitLow', Number(e.target.value))
                }
                className={`w-full accent-amber-400 ${
                  pitUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="pit-mid-slider"
                className="flex justify-between gap-2 text-slate-300 mb-0.5"
              >
                <span>
                  {metrics.hasActivePublicAdmin
                    ? `Trung cấp: ${metrics.labor.skilled} người (${metrics.labor.employedSkilled} có việc · ${Math.max(0, metrics.labor.skilled - metrics.labor.employedSkilled)} chưa có việc)`
                    : `Lao động trung cấp (${metrics.labor.skilled} người)`}
                </span>
                <span className="font-mono tabular-nums font-bold text-sky-300 shrink-0">
                  {policies.pitMid}%
                </span>
              </label>
              <input
                id="pit-mid-slider"
                type="range"
                min={0}
                max={35}
                disabled={!pitUnlocked}
                value={policies.pitMid}
                onChange={(e) =>
                  pitUnlocked &&
                  onUpdatePolicy('pitMid', Number(e.target.value))
                }
                className={`w-full accent-amber-400 ${
                  pitUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="pit-educated-slider"
                className="flex justify-between gap-2 text-slate-300 mb-0.5"
              >
                <span>
                  {metrics.hasActivePublicAdmin
                    ? `Bằng cấp: ${metrics.labor.educated} người (${metrics.labor.employedEducated} có việc · ${Math.max(0, metrics.labor.educated - metrics.labor.employedEducated)} chưa có việc)`
                    : `Lao động có bằng cấp (${metrics.labor.educated} người)`}
                </span>
                <span
                  className={`font-mono tabular-nums font-bold shrink-0 ${
                    policies.pitEducated > 25 ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  {policies.pitEducated}%
                </span>
              </label>
              <input
                id="pit-educated-slider"
                type="range"
                min={0}
                max={35}
                disabled={!pitUnlocked}
                value={policies.pitEducated}
                onChange={(e) =>
                  pitUnlocked &&
                  onUpdatePolicy('pitEducated', Number(e.target.value))
                }
                className={`w-full accent-amber-400 ${
                  pitUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
              {!metrics.hasActivePublicAdmin && (
                <p
                  data-testid="pit-admin-labor-hint"
                  className="mt-1 text-[11px] text-slate-400 italic"
                >
                  Xây UBND (đủ nhân sự) để mở thống kê việc làm chi tiết
                </p>
              )}
              {metrics.labor.brainDrainActive && (
                <p className="mt-1 text-[11px] font-semibold text-rose-400">
                  Cảnh báo: Thuế &gt; 25% đang gây Chảy máu chất xám (Brain Drain)!
                </p>
              )}
            </div>
          </div>

          {/* Column 2: 5 Thanh trượt Thuế TNDN (CIT) & Chỉ số PCI */}
          <div
            data-testid="policy-col-cit"
            className={`rounded-lg bg-[#152231] p-3 border space-y-1.5 ${
              citUnlocked
                ? 'border-slate-700/70'
                : 'border-slate-700/50 opacity-80'
            }`}
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between">
              <span>5 Sắc Thuế Doanh Nghiệp (CIT) & PCI</span>
              <span className="font-mono tabular-nums text-emerald-300">
                PCI {metrics.pci}/100
              </span>
            </div>

            {!citUnlocked && (
              <div
                data-testid="cit-lock-banner"
                className="rounded bg-slate-900/90 border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 font-semibold"
              >
                🔒 {getPolicyUnlockRequirementLabel('cit')}
              </div>
            )}

            <div>
              <label
                htmlFor="cit-fdi-slider"
                className="flex justify-between text-slate-300 text-[11px]"
              >
                <span>1. FDI & Văn phòng Tài chính (30% PCI)</span>
                <span className="font-mono tabular-nums font-bold text-cyan-300">
                  {policies.citFdi}%
                </span>
              </label>
              <input
                id="cit-fdi-slider"
                type="range"
                min={5}
                max={30}
                disabled={!citUnlocked}
                value={policies.citFdi}
                onChange={(e) =>
                  citUnlocked &&
                  onUpdatePolicy('citFdi', Number(e.target.value))
                }
                className={`w-full h-1.5 accent-cyan-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="cit-market-slider"
                className="flex justify-between text-slate-300 text-[11px]"
              >
                <span>2. Chợ truyền thống & Bán lẻ</span>
                <span className="font-mono tabular-nums font-bold text-amber-300">
                  {policies.citMarket}%
                </span>
              </label>
              <input
                id="cit-market-slider"
                type="range"
                min={5}
                max={30}
                disabled={!citUnlocked}
                value={policies.citMarket}
                onChange={(e) =>
                  citUnlocked &&
                  onUpdatePolicy('citMarket', Number(e.target.value))
                }
                className={`w-full h-1.5 accent-amber-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="cit-agri-slider"
                className="flex justify-between text-slate-300 text-[11px]"
              >
                <span>3. Nông Nghiệp &amp; Thủy Sản</span>
                <span className="font-mono tabular-nums font-bold text-emerald-300">
                  {policies.citAgri}%
                </span>
              </label>
              <input
                id="cit-agri-slider"
                type="range"
                min={5}
                max={30}
                disabled={!citUnlocked}
                value={policies.citAgri}
                onChange={(e) =>
                  citUnlocked &&
                  onUpdatePolicy('citAgri', Number(e.target.value))
                }
                className={`w-full h-1.5 accent-emerald-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="cit-industry-slider"
                className="flex justify-between text-slate-300 text-[11px]"
              >
                <span>4. Nhà Máy SX & Thực phẩm</span>
                <span className="font-mono tabular-nums font-bold text-sky-300">
                  {policies.citIndustry}%
                </span>
              </label>
              <input
                id="cit-industry-slider"
                type="range"
                min={5}
                max={30}
                disabled={!citUnlocked}
                value={policies.citIndustry}
                onChange={(e) =>
                  citUnlocked &&
                  onUpdatePolicy('citIndustry', Number(e.target.value))
                }
                className={`w-full h-1.5 accent-sky-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="cit-showbiz-slider"
                className="flex justify-between text-slate-300 text-[11px]"
              >
                <span>5. Tổ Hợp Showbiz & Sự Kiện</span>
                <span className="font-mono tabular-nums font-bold text-fuchsia-300">
                  {policies.citShowbiz}%
                </span>
              </label>
              <input
                id="cit-showbiz-slider"
                type="range"
                min={5}
                max={30}
                disabled={!citUnlocked}
                value={policies.citShowbiz}
                onChange={(e) =>
                  citUnlocked &&
                  onUpdatePolicy('citShowbiz', Number(e.target.value))
                }
                className={`w-full h-1.5 accent-fuchsia-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div className="pt-1 border-t border-slate-700/60 text-[11px] text-slate-300 flex justify-between">
              <span>PCI: Hạ tầng {metrics.pciInfraScore} · HC {metrics.pciAdminScore}</span>
              <span className="font-mono tabular-nums text-cyan-300">
                Ưu đãi FDI {metrics.pciTaxScore}
              </span>
            </div>
          </div>

          {/* Column 3: Khung Đền bù Giải tỏa & An sinh Xã hội */}
          <div
            data-testid="policy-col-welfare"
            className={`rounded-lg bg-[#152231] p-3 border space-y-2.5 ${
              compUnlocked
                ? 'border-slate-700/70'
                : 'border-slate-700/50 opacity-80'
            }`}
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between">
              <span>Khung Đền Bù Giải Tỏa & An Sinh</span>
              {!compUnlocked && (
                <span className="font-mono text-slate-300">🔒 Lv.3</span>
              )}
            </div>

            {!compUnlocked && (
              <div
                data-testid="welfare-lock-banner"
                className="rounded bg-slate-900/90 border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 font-semibold"
              >
                🔒 {getPolicyUnlockRequirementLabel('compensation')}
              </div>
            )}

            <div className="space-y-1">
              <span className="block text-slate-300">
                Mức chi đền bù khi giải phóng mặt bằng:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['low', 'Thấp 65%'],
                    ['fair', 'Chuẩn 100%'],
                    ['generous', 'Cao 135%'],
                  ] as [CompensationLevel, string][]
                ).map(([lvl, label]) => (
                  <button
                    key={lvl}
                    type="button"
                    disabled={!compUnlocked}
                    onClick={() =>
                      compUnlocked && onUpdatePolicy('compensationLevel', lvl)
                    }
                    className={`px-1.5 py-1.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
                      !compUnlocked
                        ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                        : policies.compensationLevel === lvl
                        ? 'bg-amber-500 text-slate-950 border-amber-300 cursor-pointer'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                {policies.compensationLevel === 'low'
                  ? 'Đền bù thấp tiết kiệm ngân sách nhưng gây khiếu kiện, đình trệ 2 tháng!'
                  : policies.compensationLevel === 'fair'
                  ? 'Đền bù đúng khung giá đất, bàn giao mặt bằng ngay.'
                  : 'Đền bù vượt khung giúp tăng đồng thuận và ổn định xã hội.'}
              </p>
            </div>

            <div>
              <label
                htmlFor="welfare-slider"
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>Trợ cấp An sinh & Giảm nghèo</span>
                <span className="font-mono tabular-nums font-bold text-emerald-300">
                  Mức {policies.welfareLevel}
                </span>
              </label>
              <input
                id="welfare-slider"
                type="range"
                min={10}
                max={100}
                disabled={!welfareUnlocked}
                value={policies.welfareLevel}
                onChange={(e) =>
                  welfareUnlocked &&
                  onUpdatePolicy('welfareLevel', Number(e.target.value))
                }
                className={`w-full accent-emerald-400 ${
                  welfareUnlocked
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          {/* Column 1: Vận tải Công cộng (transitLevel) & Trạm Thu Phí (enableTollbooth) */}
          <div
            data-testid="traffic-col-transit"
            className="rounded-lg bg-[#152231] p-3 border border-slate-700/70 space-y-2.5"
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between gap-2">
              <span>Vận Tải Công Cộng &amp; Thu Phí</span>
              <span className="font-mono tabular-nums text-sky-300 shrink-0">
                Tốc độ {metrics.trafficSpeedIndex}%
              </span>
            </div>

            <div className="space-y-1">
              <span className="block text-slate-300 text-[11px]">
                Hệ thống Vận tải Công cộng (Tăng tốc độ &amp; Mở rộng tìm việc):
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    [0, '0: Tự phát', '0 Tỷ/th'],
                    [1, '1: Bus Trợ giá', '-0,15 Tỷ'],
                    [2, '2: BRT Nhanh', '-0,40 Tỷ'],
                  ] as [TransitLevel, string, string][]
                ).map(([lvl, title, costLbl]) => {
                  const active = (policies.transitLevel ?? 0) === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      data-testid={`btn-transit-level-${lvl}`}
                      onClick={() => {
                        onUpdatePolicy('transitLevel', lvl);
                        onUpdatePolicy('subsidizeBusTransit', lvl > 0);
                      }}
                      className={`p-1.5 rounded text-center border cursor-pointer transition-colors ${
                        active
                          ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <div className="text-[11px] leading-tight">{title}</div>
                      <div
                        className={`text-[10px] font-mono ${
                          active ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {costLbl}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
              <div>
                <div className="text-slate-200 font-medium">
                  Trạm thu phí BOT trục chính
                </div>
                <div className="text-[10px] text-slate-400">
                  Thu 30.000 VNĐ/lượt ô tô/tải bù phí bảo trì đường
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-toggle-tollbooth"
                onClick={() =>
                  onUpdatePolicy('enableTollbooth', !policies.enableTollbooth)
                }
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                  policies.enableTollbooth
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-600'
                }`}
              >
                {policies.enableTollbooth ? 'Đang Thu Phí' : 'Tắt Thu Phí'}
              </button>
            </div>
          </div>

          {/* Column 2: Kinh tế Vỉa hè 3 cấp độ & Cấm xe tải khu dân cư */}
          <div
            data-testid="traffic-col-sidewalk"
            className="rounded-lg bg-[#152231] p-3 border border-slate-700/70 space-y-2.5"
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between gap-2">
              <span>Kinh Tế Vỉa Hè &amp; Phân Luồng Dân Cư</span>
              <span className="font-mono tabular-nums text-amber-300 shrink-0">
                PCCC {metrics.emergencyAccessCoverage}%
              </span>
            </div>

            <div className="space-y-1">
              <span className="block text-slate-300 text-[11px]">
                Chính sách Quản lý Kinh doanh Vỉa hè:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['ban', 'Cấm Vỉa Hè', 'Đường thoáng'],
                    ['informal', 'Tự Phát', 'Dễ nghẽn hẻm'],
                    ['licensed', 'Cấp Phép', '+Thu phí · PCCC 100%'],
                  ] as [SidewalkPolicy, string, string][]
                ).map(([pol, label, sub]) => {
                  const currentPol =
                    policies.sidewalkPolicy ??
                    (policies.allowSidewalkEconomy ? 'informal' : 'ban');
                  const active = currentPol === pol;
                  return (
                    <button
                      key={pol}
                      type="button"
                      data-testid={`btn-sidewalk-${pol}`}
                      onClick={() => {
                        onUpdatePolicy('sidewalkPolicy', pol);
                        onUpdatePolicy('allowSidewalkEconomy', pol !== 'ban');
                      }}
                      className={`p-1.5 rounded text-center border cursor-pointer transition-colors ${
                        active
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <div className="text-[11px] leading-tight">{label}</div>
                      <div
                        className={`text-[9.5px] ${
                          active ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
              <div>
                <div className="text-slate-200 font-medium">
                  Cấm xe tải đi vào Khu dân cư &amp; Hẻm
                </div>
                <div className="text-[10px] text-slate-400">
                  Xe tải 3D tự động né hẻm nhỏ &amp; đường sát nhà ở
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-ban-trucks-res"
                onClick={() => {
                  const nextVal = !policies.banTrucksInResidential;
                  onUpdatePolicy('banTrucksInResidential', nextVal);
                  onUpdatePolicy('banPeakHeavyTrucks', nextVal);
                }}
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                  policies.banTrucksInResidential
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-600'
                }`}
              >
                {policies.banTrucksInResidential ? 'Đang Cấm' : 'Cho Phép'}
              </button>
            </div>
          </div>

          {/* Column 3: An ninh Lương thực (foodSupplyPercent) & Sự kiện Showbiz */}
          <div
            data-testid="traffic-col-food-showbiz"
            className="rounded-lg bg-[#152231] p-3 border border-slate-700/70 space-y-2"
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between gap-2">
              <span>An Ninh Lương Thực &amp; Showbiz [J]</span>
              <span className="font-mono tabular-nums text-emerald-300 shrink-0">
                Cung ứng {metrics.supplyChainIndex}%
              </span>
            </div>

            <div
              data-testid="food-supply-indicator"
              className={`rounded-lg px-2.5 py-1.5 border flex items-center justify-between ${
                (metrics.foodSupplyPercent ?? 100) < 100
                  ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold">
                  Nguồn cung Lương thực Nội địa:
                </div>
                <div className="text-[10px] opacity-85">
                  Mỗi Nông trại nuôi tối đa 180 dân
                </div>
              </div>
              <span className="text-sm font-mono tabular-nums font-extrabold">
                {metrics.foodSupplyPercent ?? 100}%
              </span>
            </div>

            <button
              type="button"
              data-testid="btn-trigger-concert"
              onClick={onTriggerConcert}
              className={`w-full py-2 px-3 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                activeConcertMonths > 0
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60'
                  : concertUnlocked && metrics.canTriggerConcert
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/50'
              }`}
            >
              {activeConcertMonths > 0
                ? `Đang Diễn Ra Đại Nhạc Hội (${activeConcertMonths} tháng)`
                : concertUnlocked && metrics.canTriggerConcert
                ? 'Tổ Chức Concert Quốc Tế (+6,5 Tỷ VNĐ Thuế Sự Kiện)'
                : '🔒 Tổ Chức Concert Quốc Tế (Chưa Đủ Điều Kiện)'}
            </button>

            {(!concertUnlocked || !metrics.canTriggerConcert) && (
              <p
                data-testid="concert-lock-reason"
                className="text-[11px] text-rose-300 font-medium leading-snug"
              >
                ⚠️{' '}
                {!concertUnlocked
                  ? getPolicyUnlockRequirementLabel('concert')
                  : metrics.concertBlockReason}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
