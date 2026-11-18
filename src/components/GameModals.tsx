import React from 'react';
import { DIFFICULTY_SPECS } from '../game/rules';
import { DifficultyLevel, GameStateMode, RunSnapshot } from '../game/types';

interface GameModalsProps {
  mode: GameStateMode;
  difficulty?: DifficultyLevel;
  snapshot: RunSnapshot | null;
  bestPci: number;
  lastSavedAt?: string | null;
  hasSavedSession?: boolean;
  onSelectDifficulty?: (difficulty: DifficultyLevel) => void;
  onStartGame: () => void;
  onContinueSavedSession?: () => void;
  onOpenHowToPlay: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onReturnTitle: () => void;
  onContinueEndless?: () => void;
}

export const GameModals: React.FC<GameModalsProps> = ({
  mode,
  difficulty = 'hard',
  snapshot,
  bestPci,
  lastSavedAt,
  hasSavedSession = false,
  onSelectDifficulty,
  onStartGame,
  onContinueSavedSession,
  onOpenHowToPlay,
  onResumeGame,
  onRestartGame,
  onReturnTitle,
  onContinueEndless,
}) => {
  if (mode === 'playing') return null;

  if (mode === 'title') {
    const difficultyEnBadge: Record<DifficultyLevel, string> = {
      easy: 'Easy',
      hard: 'Hard',
      expert: 'Expert',
    };
    return (
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-8 md:p-14 bg-gradient-to-r from-[#070e17]/95 via-[#070e17]/65 to-transparent">
        <div className="pointer-events-auto max-w-xl mt-4 md:mt-8">
          <svg
            viewBox="0 0 480 138"
            className="w-full max-w-[460px] h-auto mb-4 drop-shadow-xl"
            role="img"
            aria-label="Thịnh Vượng — Quy Hoạch Đại Đô Thị Việt Nam"
          >
            <g transform="translate(8, 12)">
              <rect
                x="0"
                y="0"
                width="68"
                height="68"
                rx="14"
                fill="#132232"
                stroke="#f59e0b"
                strokeWidth="2.5"
              />
              <path
                d="M34 10 L46 24 L42 24 L42 54 L26 54 L26 24 L22 24 Z"
                fill="#f59e0b"
              />
              <circle cx="34" cy="33" r="5" fill="#091119" />
              <path
                d="M14 54 L54 54 L58 60 L10 60 Z"
                fill="#dc2626"
              />
            </g>

            <text
              x="90"
              y="52"
              fill="#fef08a"
              fontFamily="Be Vietnam Pro, sans-serif"
              fontWeight="800"
              fontSize="40"
              letterSpacing="1.5"
            >
              THỊNH VƯỢNG
            </text>
            <text
              x="92"
              y="78"
              fill="#e2e8f0"
              fontFamily="Be Vietnam Pro, sans-serif"
              fontWeight="600"
              fontSize="13.5"
              letterSpacing="1.4"
            >
              QUY HOẠCH &amp; KINH TẾ VĨ MÔ VIỆT NAM 3D
            </text>

            <line
              x1="8"
              y1="100"
              x2="455"
              y2="100"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeOpacity="0.55"
            />
            <text
              x="8"
              y="122"
              fill="#cbd5e1"
              fontFamily="Be Vietnam Pro, sans-serif"
              fontWeight="500"
              fontSize="13"
            >
              Tự tay xây đường · Phân lô · Thuế &amp; PCI · Mở rộng Đại vùng 9×9
            </text>
          </svg>

          {/* Bộ chọn 3 Độ khó trên màn hình chính */}
          <div
            data-testid="title-difficulty-selector"
            className="mb-4 rounded-xl bg-[#0e1a27]/90 border border-slate-700/80 p-3 shadow-lg"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
              Chọn Cấp Độ Thử Thách Điều Hành (Easy · Hard · Expert):
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['easy', 'hard', 'expert'] as DifficultyLevel[]).map((lvl) => {
                const spec = DIFFICULTY_SPECS[lvl];
                const isSelected = difficulty === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    data-testid={`difficulty-btn-${lvl}`}
                    onClick={() => onSelectDifficulty?.(lvl)}
                    className={`text-left rounded-lg p-2.5 border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400/20 border-amber-400 text-amber-200 shadow-md'
                        : 'bg-[#142334]/80 border-slate-700 text-slate-300 hover:bg-[#192c40]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-extrabold">
                        {spec.label} ({difficultyEnBadge[lvl]})
                      </span>
                      <span className="font-mono text-[11px] font-bold text-emerald-300 shrink-0">
                        {spec.startingTreasury} Tỷ
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-300/90 mt-1 leading-snug">
                      {spec.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            {hasSavedSession && onContinueSavedSession && (
              <button
                type="button"
                data-testid="title-continue-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onContinueSavedSession();
                }}
                className="px-6 py-3.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg cursor-pointer transition-transform active:scale-95 whitespace-nowrap shrink-0"
              >
                Tiếp Tục Nhiệm Kỳ
              </button>
            )}

            <button
              type="button"
              data-start="true"
              data-testid="title-start-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartGame();
              }}
              className="px-7 py-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg cursor-pointer transition-transform active:scale-95 whitespace-nowrap shrink-0"
            >
              Bắt Đầu Nhiệm Kỳ [Enter]
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenHowToPlay();
              }}
              className="px-5 py-3.5 rounded-lg bg-[#142334] hover:bg-[#1c3148] text-amber-300 font-bold text-sm border border-amber-400/50 shadow-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              Hướng Dẫn Cách Chơi [?]
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-300/90 font-medium tracking-wide">
          WASD Lia Camera · Chuột Trái Xây Đường &amp; Công Trình · Chuột Phải Vào Công Trình Xem Thuế &amp; Nhân Sự · E Mở Rộng Vùng 9×9
        </div>
      </div>
    );
  }

  if (mode === 'paused') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tạm dừng quy hoạch"
        className="fixed inset-0 z-30 flex items-center justify-center bg-[#070d14]/80 p-4"
      >
        <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#101c29] p-6 text-slate-100 shadow-2xl">
          <h2 className="text-xl font-extrabold text-amber-300 mb-1">
            Tạm Dừng &amp; Cài Đặt Hệ Thống
          </h2>
          <p className="text-xs text-slate-300 mb-3">
            Uỷ ban Quy hoạch đang tạm nghỉ. Tiến trình được tự động lưu thầm lặng sau mỗi ngày/tháng.
          </p>

          <div
            data-testid="pause-autosave-status"
            className="mb-4 rounded-lg bg-[#152638] border border-emerald-500/40 px-3 py-2 text-xs flex items-center justify-between"
          >
            <span className="font-semibold text-emerald-300">
              Auto-Save (localStorage):
            </span>
            <span className="font-mono text-slate-200">
              {lastSavedAt ? `Lúc ${lastSavedAt}` : 'Chưa có bản lưu'}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResumeGame();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm cursor-pointer"
            >
              Tiếp Tục Quy Hoạch [Esc / P]
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenHowToPlay();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-[#16283c] hover:bg-[#1e3650] text-cyan-300 font-semibold text-sm border border-cyan-500/40 cursor-pointer"
            >
              Xem Hướng Dẫn &amp; Cài Đặt Lưu Tự Động
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestartGame();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm border border-slate-600 cursor-pointer"
            >
              Quy Hoạch Lại Từ Đầu [R]
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onReturnTitle();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-sm border border-slate-700 cursor-pointer"
            >
              Về Màn Hình Chính
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isVictory = snapshot?.outcome === 'victory';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Đại Đô Thị Thịnh Vượng' : 'Khủng Hoảng Đô Thị'}
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#070d14]/85 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-amber-500/45 bg-[#101c29] p-6 text-slate-100 shadow-2xl">
        <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
          {isVictory ? 'Hoàn Thành Sứ Mệnh Quy Hoạch' : 'Báo Cáo Kết Thúc Nhiệm Kỳ'}
        </div>
        <h2
          className={`text-2xl font-extrabold mb-2 ${
            isVictory ? 'text-emerald-300' : 'text-rose-400'
          }`}
        >
          {isVictory ? 'Đại Đô Thị Thịnh Vượng!' : 'Khủng Hoảng Vĩ Mô Đô Thị'}
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed mb-5">
          {snapshot?.reason}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg bg-[#162638] p-3 border border-slate-700">
            <div className="text-[11px] text-slate-400 uppercase">
              Ngân Sách Cuối
            </div>
            <div className="text-lg font-mono tabular-nums font-bold text-amber-300">
              {snapshot?.treasury ?? 0} Tỷ
            </div>
          </div>
          <div className="rounded-lg bg-[#162638] p-3 border border-slate-700">
            <div className="text-[11px] text-slate-400 uppercase">
              Chỉ Số PCI / Kỷ Lục
            </div>
            <div className="text-lg font-mono tabular-nums font-bold text-cyan-300">
              {snapshot?.pci ?? 0} / {bestPci}
            </div>
          </div>
          <div className="rounded-lg bg-[#162638] p-3 border border-slate-700">
            <div className="text-[11px] text-slate-400 uppercase">
              Quy Mô Dân Số
            </div>
            <div className="text-lg font-mono tabular-nums font-bold text-emerald-300">
              {snapshot?.population.toLocaleString('vi-VN') ?? 0}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {isVictory && onContinueEndless && (
            <button
              type="button"
              data-testid="btn-continue-endless"
              onClick={(e) => {
                e.currentTarget.blur();
                onContinueEndless();
              }}
              className="w-full py-3 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm cursor-pointer shadow-lg"
            >
              Tiếp Tục Chơi Endless (Mở Rộng 81 Vùng Đô Thị)
            </button>
          )}
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestartGame();
            }}
            className="flex-1 py-3 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm cursor-pointer"
          >
            Quy Hoạch Nhiệm Kỳ Mới [Enter]
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onReturnTitle();
            }}
            className="py-3 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-600 cursor-pointer"
          >
            Màn Hình Chính
          </button>
        </div>
      </div>
    </div>
  );
};
