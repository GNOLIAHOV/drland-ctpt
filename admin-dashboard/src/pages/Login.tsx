import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import axios from 'axios';
import axiosClient, { ADMIN_USER_KEY, TOKEN_STORAGE_KEY } from '../api/axiosClient';

const CLIENT_PORTAL_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:5174/';

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  admin: {
    id: string;
    email: string;
    fullName: string;
  };
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [brandName, setBrandName] = useState('DRLAND');
  const [hotline, setHotline] = useState('0943.257.089');

  useEffect(() => {
    let active = true;
    void axiosClient
      .get<{ brandName?: string; hotline?: string }>('/settings/public')
      .then((res) => {
        if (!active) return;
        if (res.data?.brandName) setBrandName(res.data.brandName);
        if (res.data?.hotline) setHotline(res.data.hotline);
      })
      .catch(() => {
        // Giữ thông tin mặc định nếu API chưa sẵn sàng
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await axiosClient.post<LoginResponse>('/auth/login', {
        email: email.trim(),
        password,
      });

      localStorage.setItem(TOKEN_STORAGE_KEY, res.data.accessToken);
      if (res.data.admin) {
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res.data.admin));
      }

      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(
          Array.isArray(msg)
            ? msg.join(', ')
            : msg || 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.',
        );
      } else {
        setError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại dịch vụ.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center px-4 font-sans antialiased">
      <div className="w-full max-w-md bg-white rounded-xl border border-stone-200 p-8">
        <div className="mb-7 pb-5 border-b border-stone-200">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            Đăng nhập quản lý {brandName}
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Quản lý cơ sở lưu trú, phòng trọ, mặt bằng và hóa đơn định kỳ
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs sm:text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-stone-700 mb-1.5"
            >
              Email quản lý
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email quản lý…"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-stone-300 text-stone-900 text-sm bg-white focus:outline-none focus:border-emerald-700 transition-colors"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-stone-700 mb-1.5"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu…"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-stone-300 text-stone-900 text-sm bg-white focus:outline-none focus:border-emerald-700 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-semibold text-sm transition-colors cursor-pointer mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {loading ? 'Đang xác thực…' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-7 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
          <span className="tabular-nums">Hỗ trợ quản lý: {hotline}</span>
          <a
            href={CLIENT_PORTAL_URL}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 hover:underline font-medium"
          >
            Xem trang khách thuê
          </a>
        </div>
      </div>
    </div>
  );
}
