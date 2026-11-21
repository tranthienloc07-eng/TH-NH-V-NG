import React, { useState } from 'react';
import {
  formatVnd,
  getCreditRatingByPci,
  getPolicyUnlockRequirementLabel,
  isPolicyUnlockedAtLevel,
} from '../game/rules';
import { CityGameState } from '../game/types';

interface BankModalProps {
  open: boolean;
  gameState: CityGameState;
  onTakeLoan: (amount: number, months: 6 | 12) => void;
  onRepayLoanEarly: (loanId: string) => void;
  onCreateDeposit: (amount: number, months: 3 | 6) => void;
  onWithdrawDepositEarly: (depositId: string) => void;
  onClose: () => void;
}

const LOAN_PACKAGES = [20, 50, 100] as const;
const DEPOSIT_PACKAGES = [10, 30, 50] as const;

export const BankModal: React.FC<BankModalProps> = ({
  open,
  gameState,
  onTakeLoan,
  onRepayLoanEarly,
  onCreateDeposit,
  onWithdrawDepositEarly,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'loan' | 'deposit'>('loan');
  const [selectedLoanMonths, setSelectedLoanMonths] = useState<6 | 12>(6);
  const [selectedDepositMonths, setSelectedDepositMonths] = useState<3 | 6>(3);

  if (!open) return null;

  const bankUnlocked = isPolicyUnlockedAtLevel('bank', gameState.cityLevel ?? 1);
  const rating = getCreditRatingByPci(gameState.metrics.pci);
  const loans = gameState.loans ?? [];
  const deposits = gameState.deposits ?? [];
  const hasActiveLoans = loans.length > 0;
  const totalDebt = loans.reduce((acc, l) => acc + l.remainingPrincipal, 0);
  const totalDeposit = deposits.reduce((acc, d) => acc + d.amount, 0);

  const stopEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      data-testid="bank-modal-backdrop"
      onClick={onClose}
      onMouseMove={stopEvent}
      onPointerDown={stopEvent}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/85 p-4 pointer-events-auto"
    >
      <section
        data-testid="bank-modal"
        aria-label="Ngân Hàng Đô Thị Thịnh Vượng"
        onClick={stopEvent}
        className="w-full max-w-2xl max-h-[86vh] overflow-y-auto custom-scrollbar rounded-2xl border border-amber-500/40 bg-[#0d1722]/98 p-4 text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-700/70 pb-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
              <span>🏦 Ngân Hàng Đô Thị Thịnh Vượng</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-emerald-300">
                Quỹ: {formatVnd(gameState.treasury)}
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Huy động vốn đầu tư hạ tầng theo xếp hạng tín nhiệm PCI hoặc gửi tiết kiệm sinh lời ngân sách nhàn rỗi.
            </p>
          </div>
          <button
            type="button"
            data-testid="bank-modal-close"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 cursor-pointer shrink-0"
          >
            Đóng [Esc]
          </button>
        </div>

        {!bankUnlocked ? (
          <div
            data-testid="bank-locked-banner"
            className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-center space-y-1.5"
          >
            <div className="text-sm font-bold text-amber-300">
              🔒 Ngân Hàng Đô Thị chưa mở khóa
            </div>
            <p className="text-xs text-slate-200">
              {getPolicyUnlockRequirementLabel('bank')}. Hãy phát triển dân số đạt 150 người (City Level 2) để mở dịch vụ Vay Vốn Đầu Tư và Gửi Tiết Kiệm.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Strip */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
              <div className="rounded-lg bg-slate-900/90 border border-slate-700/80 p-2.5">
                <div className="text-[11px] text-slate-400">Tín nhiệm PCI ({gameState.metrics.pci}/100)</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-sm font-black font-mono text-amber-300">
                    {rating.grade}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-300">
                    {rating.ratePercent}%/tháng
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {rating.label}
                </div>
              </div>

              <div className="rounded-lg bg-slate-900/90 border border-slate-700/80 p-2.5">
                <div className="text-[11px] text-slate-400">Tổng Dư Nợ Vay</div>
                <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-rose-300">
                  {formatVnd(totalDebt)}
                </div>
                <div className="text-[10px] text-slate-400">
                  {loans.length} khoản vay đang chạy
                </div>
              </div>

              <div className="rounded-lg bg-slate-900/90 border border-slate-700/80 p-2.5">
                <div className="text-[11px] text-slate-400">Tổng Tiền Gửi Tiết Kiệm</div>
                <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-emerald-300">
                  {formatVnd(totalDeposit)}
                </div>
                <div className="text-[10px] text-slate-400">
                  {deposits.length} sổ tiết kiệm
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                data-testid="bank-tab-loan"
                onClick={() => setActiveTab('loan')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  activeTab === 'loan'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Vay Vốn Đầu Tư ({loans.length})
              </button>
              <button
                type="button"
                data-testid="bank-tab-deposit"
                onClick={() => setActiveTab('deposit')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  activeTab === 'deposit'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Gửi Tiết Kiệm ({deposits.length})
              </button>
            </div>

            {activeTab === 'loan' ? (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl bg-[#13202e] border border-slate-700/80 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-amber-200">
                      Chọn Gói Vay Tín Chấp (Lãi suất hiện tại: {rating.ratePercent}%/tháng)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Kỳ hạn:</span>
                      {([6, 12] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSelectedLoanMonths(m)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                            selectedLoanMonths === m
                              ? 'bg-amber-500 text-slate-950 border-amber-300'
                              : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                          }`}
                        >
                          {m} tháng
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 bg-slate-900/70 rounded px-2.5 py-1.5 border border-slate-700/60">
                    Biểu lãi suất theo PCI: <span className="text-emerald-300 font-semibold">PCI ≥ 75: 0,8%/th</span> ·{' '}
                    <span className="text-amber-300 font-semibold">PCI 55–74: 1,4%/th</span> ·{' '}
                    <span className="text-rose-300 font-semibold">PCI &lt; 55: 2,2%/th</span>. Gốc + lãi trừ tự động vào Ngày 30 cuối tháng.
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {LOAN_PACKAGES.map((amount) => {
                      const estMonthlyPrincipal = amount / selectedLoanMonths;
                      const estFirstMonthInterest = amount * (rating.ratePercent / 100);
                      return (
                        <div
                          key={amount}
                          className="rounded-lg bg-slate-900/90 border border-slate-700 p-2.5 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-black font-mono text-amber-300">
                              {amount} Tỷ VNĐ
                            </div>
                            <div className="text-[11px] text-slate-300 mt-0.5">
                              Kỳ hạn {selectedLoanMonths} tháng
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Trả góp kỳ đầu: ~{formatVnd(estMonthlyPrincipal + estFirstMonthInterest)}/th
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`bank-loan-btn-${amount}`}
                            onClick={() => onTakeLoan(amount, selectedLoanMonths)}
                            className="w-full py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition"
                          >
                            Vay +{amount} Tỷ
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Active Loans Table */}
                <div className="rounded-xl bg-[#13202e] border border-slate-700/80 p-3">
                  <div className="font-semibold text-slate-200 mb-2">
                    Các Khoản Vay Đang Chạy ({loans.length})
                  </div>
                  {loans.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-2">
                      Thành phố hiện không có dư nợ vay ngân hàng.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {loans.map((loan) => (
                        <div
                          key={loan.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/90 border border-slate-700/80 px-3 py-2"
                        >
                          <div>
                            <div className="font-semibold text-slate-100 flex items-center gap-2">
                              <span>
                                Gốc ban đầu {formatVnd(loan.principal)} · Còn nợ{' '}
                                <span className="text-rose-300 font-mono">
                                  {formatVnd(loan.remainingPrincipal)}
                                </span>
                              </span>
                              {loan.collateralTile && (
                                <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px]">
                                  Thế chấp đất ({loan.collateralTile.x + 1},{loan.collateralTile.z + 1})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Lãi suất {loan.monthlyRatePercent}%/tháng · Còn {loan.remainingMonths}/{loan.totalMonths} tháng
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`bank-repay-btn-${loan.id}`}
                            disabled={gameState.treasury < loan.remainingPrincipal}
                            onClick={() => onRepayLoanEarly(loan.id)}
                            className={`px-3 py-1.5 rounded text-xs font-bold border transition ${
                              gameState.treasury >= loan.remainingPrincipal
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 cursor-pointer'
                                : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                            }`}
                          >
                            Tất toán sớm (-{formatVnd(loan.remainingPrincipal)})
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {hasActiveLoans && (
                  <div
                    data-testid="bank-deposit-locked-warning"
                    className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3 text-rose-200 font-semibold"
                  >
                    🔒 Đang khóa mở sổ tiết kiệm mới: Thành phố đang có {loans.length} khoản vay chưa tất toán! Hãy tất toán toàn bộ dư nợ vay trước khi gửi tiết kiệm (chống trục lợi chênh lệch lãi suất).
                  </div>
                )}

                <div
                  className={`rounded-xl bg-[#13202e] border border-slate-700/80 p-3 space-y-2.5 ${
                    hasActiveLoans ? 'opacity-65' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-emerald-200">
                      Gửi Tiết Kiệm Có Kỳ Hạn (Sinh lời cuối kỳ)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Kỳ hạn:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedDepositMonths(3)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                          selectedDepositMonths === 3
                            ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                            : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                        }`}
                      >
                        3 tháng (+1,0%/th)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDepositMonths(6)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                          selectedDepositMonths === 6
                            ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                            : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                        }`}
                      >
                        6 tháng (+1,5%/th)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {DEPOSIT_PACKAGES.map((amount) => {
                      const rate = selectedDepositMonths === 6 ? 1.5 : 1.0;
                      const maturityInterest =
                        amount * (rate / 100) * selectedDepositMonths;
                      const canAfford =
                        !hasActiveLoans && gameState.treasury >= amount;
                      return (
                        <div
                          key={amount}
                          className="rounded-lg bg-slate-900/90 border border-slate-700 p-2.5 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-black font-mono text-emerald-300">
                              {amount} Tỷ VNĐ
                            </div>
                            <div className="text-[11px] text-slate-300 mt-0.5">
                              {selectedDepositMonths} tháng · +{rate}%/tháng
                            </div>
                            <div className="text-[10px] text-emerald-400 mt-1">
                              Lãi đáo hạn: +{formatVnd(maturityInterest)}
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`bank-deposit-btn-${amount}`}
                            disabled={!canAfford}
                            onClick={() =>
                              onCreateDeposit(amount, selectedDepositMonths)
                            }
                            className={`w-full py-1.5 rounded font-bold text-xs transition ${
                              canAfford
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Gửi {amount} Tỷ
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Active Deposits Table */}
                <div className="rounded-xl bg-[#13202e] border border-slate-700/80 p-3">
                  <div className="font-semibold text-slate-200 mb-2">
                    Sổ Tiết Kiệm Đang Gửi ({deposits.length})
                  </div>
                  {deposits.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-2">
                      Chưa có sổ tiết kiệm nào đang hoạt động.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deposits.map((dep) => {
                        const elapsed = Math.max(
                          0,
                          dep.totalMonths - dep.remainingMonths
                        );
                        const earlyInterest = Number(
                          (dep.amount * 0.001 * elapsed).toFixed(4)
                        );
                        return (
                          <div
                            key={dep.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/90 border border-slate-700/80 px-3 py-2"
                          >
                            <div>
                              <div className="font-semibold text-slate-100">
                                Tiền gửi{' '}
                                <span className="text-emerald-300 font-mono">
                                  {formatVnd(dep.amount)}
                                </span>{' '}
                                · Lãi tích lũy{' '}
                                <span className="text-amber-300 font-mono">
                                  +{formatVnd(dep.accruedInterest)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Lãi suất +{dep.monthlyRatePercent}%/tháng · Còn{' '}
                                {dep.remainingMonths}/{dep.totalMonths} tháng (Rút sớm chỉ nhận lãi 0,1%/th = +{formatVnd(earlyInterest)})
                              </div>
                            </div>
                            <button
                              type="button"
                              data-testid={`bank-withdraw-btn-${dep.id}`}
                              onClick={() => onWithdrawDepositEarly(dep.id)}
                              className="px-3 py-1.5 rounded text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 border border-amber-400 cursor-pointer transition"
                            >
                              Rút trước hạn
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
