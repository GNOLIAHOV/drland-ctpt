import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary in client-chat-ui caught an error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-stone-200 p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-stone-900">
                Tải lại danh sách phòng
              </h1>
              <p className="text-sm text-stone-500">
                Trang web đang được làm mới để cập nhật danh sách phòng mới nhất.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Làm mới trang</span>
              </button>

              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 font-medium text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
              >
                <Home className="w-4 h-4" />
                <span>Trang chủ</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
