import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { TOKEN_STORAGE_KEY, ADMIN_USER_KEY } from '../api/axiosClient';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleRelogin = (): void => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    window.location.href = '/login';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl border border-stone-200 p-8 text-center space-y-5">
            <div className="w-12 h-12 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-stone-900">
                Đã xảy ra gián đoạn giao diện
              </h1>
              <p className="text-sm text-stone-600">
                Hệ thống đã ghi nhận sự cố tải trang. Vui lòng tải lại trang hoặc đăng nhập lại.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 text-left text-xs font-mono text-rose-700 overflow-x-auto max-h-36">
                {this.state.error.toString()}
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>

              <button
                type="button"
                onClick={this.handleRelogin}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 font-medium text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập lại</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
