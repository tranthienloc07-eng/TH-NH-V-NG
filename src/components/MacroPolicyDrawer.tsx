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
      className="hud-container info-panel-scroll custom-scrollbar pointer-events-auto w-full max-w-[880px] max-h-[80vh] overflow-y-auto mb-2 rounded-xl border border-amber-500/35 bg-[#0f1924]/95 p-4 text-slate-100 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-700/70 pb-2.5 mb-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-amber-300">
            {activeTab === 'economy'
              ? 'Điều Hành Kinh Tế Vĩ Mô, Thuế Đa Tầng & Đền Bù Giải Tỏa'
              : 'Điều Tiết Giao Thông Vi Mô, Kinh Tế Vỉa Hè & Chuỗi Cung Ứng'}
          </h2>
          <p className="text-xs text-slate-300">
            {activeTab === 'economy'
              ? 'PCI = Hạ tầng (40%) + Hành chính (30%) + Ưu đãi Thuế FDI (30%) · Cẩn trọng ngưỡng Thuế TNCN Bằng cấp > 25%'
              : 'Quản lý chu kỳ đèn xanh, phân luồng giờ cao điểm, vỉa hè và lễ hội Showbiz'}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Column 1: Thuế TNCN Lũy tiến & Phân tầng Lao động */}
          <div
            data-testid="policy-col-pit"
            className={`rounded-lg bg-[#152231] p-3 border space-y-2.5 ${
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
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>Lao động phổ thông ({metrics.labor.unskilled} người)</span>
                <span className="font-mono tabular-nums font-bold text-emerald-300">
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
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>Lao động trung cấp ({metrics.labor.skilled} người)</span>
                <span className="font-mono tabular-nums font-bold text-sky-300">
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
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>Lao động có bằng cấp ({metrics.labor.educated} người)</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
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
              {metrics.labor.brainDrainActive && (
                <p className="mt-1 text-[11px] font-semibold text-rose-400">
                  Cảnh báo: Thuế &gt; 25% đang gây Chảy máu chất xám (Brain Drain)!
                </p>
              )}
            </div>
          </div>

          {/* Column 2: Thuế TNDN (CIT) & Chỉ số PCI */}
          <div
            data-testid="policy-col-cit"
            className={`rounded-lg bg-[#152231] p-3 border space-y-2.5 ${
              citUnlocked
                ? 'border-slate-700/70'
                : 'border-slate-700/50 opacity-80'
            }`}
          >
            <div className="font-semibold text-amber-200 flex items-center justify-between">
              <span>Thuế Doanh Nghiệp (CIT) & PCI</span>
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
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>FDI Công nghệ cao (Trọng số 30% PCI)</span>
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
                className={`w-full accent-cyan-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="cit-market-slider"
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>Chợ truyền thống & Bán lẻ</span>
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
                className={`w-full accent-amber-400 ${
                  citUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              />
            </div>

            <div className="pt-1 border-t border-slate-700/60 text-[11px] text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span>Hạ tầng (40%) · Hành chính (30%)</span>
                <span className="font-mono tabular-nums">
                  {metrics.pciInfraScore} · {metrics.pciAdminScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Điểm Ưu đãi Thuế FDI (30%)</span>
                <span className="font-mono tabular-nums text-cyan-300">
                  {metrics.pciTaxScore}
                </span>
              </div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Column 1: Đèn tín hiệu & Phân luồng */}
          <div className="rounded-lg bg-[#152231] p-3 border border-slate-700/70 space-y-2.5">
            <div className="font-semibold text-amber-200 flex justify-between">
              <span>Đèn Tín Hiệu & Cắm Biển Phân Luồng</span>
              <span className="font-mono tabular-nums text-sky-300">
                Tốc độ {metrics.trafficSpeedIndex}%
              </span>
            </div>

            <div>
              <label
                htmlFor="green-light-slider"
                className="flex justify-between text-slate-300 mb-1"
              >
                <span>Chu kỳ Đèn Xanh trục chính đô thị</span>
                <span className="font-mono tabular-nums font-bold text-emerald-300">
                  {policies.greenLightMainRatio}%
                </span>
              </label>
              <input
                id="green-light-slider"
                type="range"
                min={30}
                max={75}
                value={policies.greenLightMainRatio}
                onChange={(e) =>
                  onUpdatePolicy('greenLightMainRatio', Number(e.target.value))
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-300">
                Cấm xe tải nặng giờ cao điểm
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdatePolicy(
                    'banPeakHeavyTrucks',
                    !policies.banPeakHeavyTrucks
                  )
                }
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                  policies.banPeakHeavyTrucks
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-600'
                }`}
              >
                {policies.banPeakHeavyTrucks ? 'Đang Cấm' : 'Cho Phép'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-300">
                Trợ giá Xe Bus & Xe ôm công nghệ
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdatePolicy(
                    'subsidizeBusTransit',
                    !policies.subsidizeBusTransit
                  )
                }
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                  policies.subsidizeBusTransit
                    ? 'bg-sky-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-600'
                }`}
              >
                {policies.subsidizeBusTransit ? 'Đang Trợ Giá' : 'Tắt'}
              </button>
            </div>
          </div>

          {/* Column 2: Kinh tế Vỉa hè & PCCC Ngõ hẻm */}
          <div className="rounded-lg bg-[#152231] p-3 border border-slate-700/70 space-y-2.5">
            <div className="font-semibold text-amber-200">
              Kinh Tế Vỉa Hè & Tiếp Cận PCCC Hẻm Nhỏ
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-300">Chính sách Hàng quán Vỉa hè</span>
              <button
                type="button"
                onClick={() =>
                  onUpdatePolicy(
                    'allowSidewalkEconomy',
                    !policies.allowSidewalkEconomy
                  )
                }
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap ${
                  policies.allowSidewalkEconomy
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {policies.allowSidewalkEconomy
                  ? 'Cho Phép Kinh Doanh'
                  : 'Cấm Dừng Đỗ / Dẹp Vỉa Hè'}
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {policies.allowSidewalkEconomy
                ? 'Hàng quán vỉa hè tạo sinh kế cho lao động phổ thông và tăng độ hạnh phúc, nhưng gây lấn chiếm lòng đường.'
                : 'Cấm dừng đỗ giúp đường thông hè thoáng và tăng giá đất, nhưng giảm thu nhập tiểu thương.'}
            </p>

            <div className="pt-1 border-t border-slate-700/60 flex justify-between text-[11px]">
              <span className="text-slate-300">
                Độ phủ xe Cứu hỏa / Cứu thương:
              </span>
              <span className="font-mono tabular-nums font-bold text-amber-300">
                {metrics.emergencyAccessCoverage}%
              </span>
            </div>
          </div>

          {/* Column 3: Chuỗi cung ứng Logistics & Sự kiện Showbiz */}
          <div className="rounded-lg bg-[#152231] p-3 border border-slate-700/70 space-y-2">
            <div className="font-semibold text-amber-200 flex justify-between">
              <span>Logistics &amp; Công Nghiệp Showbiz [J]</span>
              <span className="font-mono tabular-nums text-emerald-300">
                Chuỗi cung ứng {metrics.supplyChainIndex}%
              </span>
            </div>

            <p className="text-[11px] text-slate-300">
              Luồng hàng: Nông sản &amp; Cảng biển → Chợ đầu mối → Siêu thị bán lẻ.
              Ngập lụt ({metrics.floodedTileCount} ô) hoặc kẹt xe sẽ làm đứt chuỗi
              cung ứng.
            </p>

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
