import React from 'react';
import { clearSavedGameState } from '../game/rules';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error?.message || 'Đã xảy ra lỗi không mong muốn trong phiên chơi.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Giữ log nhẹ cho chẩn đoán khi cần, không ném tiếp lỗi để tránh trắng trang
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[ErrorBoundary] Đã chặn sự cố runtime:', error, info.componentStack);
    }
  }

  private handleReloadGame = (): void => {
    window.location.reload();
  };

  private handleClearCorruptSaveAndRestart = (): void => {
    try {
      clearSavedGameState();
    } catch {
      // Fallback xóa trực tiếp nếu module storage gặp lỗi
      try {
        window.localStorage.clear();
      } catch {
        // Bỏ qua nếu trình duyệt chặn storage
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.set('fresh', '1');
    url.searchParams.set('autostart', '1');
    window.location.replace(url.toString());
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        data-testid="crash-recovery-screen"
        className="min-h-screen w-screen bg-[#0b141e] text-slate-100 flex items-center justify-center p-4"
      >
        <section className="w-full max-w-md rounded-2xl border border-amber-400/50 bg-[#101e2d] p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-700/80 pb-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/60 text-amber-300 flex items-center justify-center text-xl font-black shrink-0">
              !
            </div>
            <div>
              <h1 className="text-base font-extrabold text-amber-300">
                Khôi Phục Phiên Chơi An Toàn
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Thịnh Vượng 3D phát hiện sự cố đồ họa WebGL hoặc dữ liệu lưu bị xung đột.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/75 border border-slate-700/80 p-3 text-xs text-slate-300 leading-relaxed">
            <div className="font-bold text-slate-200 mb-1">Chi tiết sự cố:</div>
            <div className="font-mono text-rose-300 break-words">
              {this.state.errorMessage}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              data-testid="crash-reload-btn"
              onClick={this.handleReloadGame}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer shadow-lg transition-colors"
            >
              Tải lại Game
            </button>
            <button
              type="button"
              data-testid="crash-reset-save-btn"
              onClick={this.handleClearCorruptSaveAndRestart}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/70 text-rose-100 font-extrabold text-xs cursor-pointer transition-colors"
            >
              Xóa Save bị lỗi &amp; Chơi mới
            </button>
          </div>
        </section>
      </main>
    );
  }
}
