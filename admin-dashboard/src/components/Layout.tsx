import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  CalendarClock,
  ReceiptText,
  LogOut,
  ExternalLink,
  Home,
  Settings,
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
} from 'lucide-react';
import axios from 'axios';
import axiosClient, { ADMIN_USER_KEY, TOKEN_STORAGE_KEY } from '../api/axiosClient';

const CLIENT_PORTAL_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:5174/';

interface StoredAdmin {
  id?: string;
  email?: string;
  fullName?: string;
}

interface LayoutSettingsState {
  brandName: string;
  hotline: string;
  zaloPhone: string;
  viewingHours: string;
}

const DEFAULT_LAYOUT_SETTINGS: LayoutSettingsState = {
  brandName: 'DRLAND',
  hotline: '0943.257.089',
  zaloPhone: '0943257089',
  viewingHours: '08:00 - 20:30 (Mỗi ngày)',
};

const navItems = [
  { to: '/', label: 'Bảng điều khiển', icon: LayoutDashboard, end: true },
  { to: '/properties', label: 'Tòa nhà & Phòng thuê', icon: Building2, end: false },
  { to: '/bookings', label: 'Lịch hẹn xem phòng', icon: CalendarClock, end: false },
  { to: '/billings', label: 'Hóa đơn & Thu tiền', icon: ReceiptText, end: false },
];

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length > 0) return msg.join('; ');
  }
  return fallback;
}

export default function Layout() {
  const navigate = useNavigate();

  const [adminProfile, setAdminProfile] = useState<StoredAdmin>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_USER_KEY);
      if (raw) return JSON.parse(raw) as StoredAdmin;
    } catch {
      // ignore
    }
    return {};
  });

  const adminDisplayName =
    adminProfile.fullName || adminProfile.email || 'Quản lý DRLAND';

  const [systemSettings, setSystemSettings] = useState<LayoutSettingsState>(
    DEFAULT_LAYOUT_SETTINGS,
  );
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'CONTACT' | 'SECURITY'>('CONTACT');

  const [contactForm, setContactForm] = useState<LayoutSettingsState>(
    DEFAULT_LAYOUT_SETTINGS,
  );
  const [savingContact, setSavingContact] = useState(false);

  const [fullNameInput, setFullNameInput] = useState(adminProfile.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void axiosClient
      .get<Partial<LayoutSettingsState>>('/settings')
      .then((res) => {
        if (!active || !res.data) return;
        const next: LayoutSettingsState = {
          brandName: res.data.brandName || DEFAULT_LAYOUT_SETTINGS.brandName,
          hotline: res.data.hotline || DEFAULT_LAYOUT_SETTINGS.hotline,
          zaloPhone: res.data.zaloPhone || DEFAULT_LAYOUT_SETTINGS.zaloPhone,
          viewingHours: res.data.viewingHours || DEFAULT_LAYOUT_SETTINGS.viewingHours,
        };
        setSystemSettings(next);
        setContactForm(next);
      })
      .catch(() => {
        // Giữ mặc định nếu chưa tải được
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAccountModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingContact && !savingPassword) {
        setIsAccountModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAccountModalOpen, savingContact, savingPassword]);

  const openAccountModal = (tab: 'CONTACT' | 'SECURITY' = 'CONTACT') => {
    setActiveTab(tab);
    setContactForm(systemSettings);
    setFullNameInput(adminProfile.fullName || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setModalError(null);
    setModalSuccess(null);
    setIsAccountModalOpen(true);
  };

  const handleSaveContactSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);

    const payload: LayoutSettingsState = {
      brandName: contactForm.brandName.trim(),
      hotline: contactForm.hotline.trim(),
      zaloPhone: contactForm.zaloPhone.trim().replace(/\s+/g, ''),
      viewingHours: contactForm.viewingHours.trim(),
    };

    if (!payload.brandName || !payload.hotline || !payload.zaloPhone || !payload.viewingHours) {
      setModalError('Vui lòng điền đầy đủ thông tin thương hiệu, Hotline, Zalo và giờ xem phòng.');
      return;
    }

    setSavingContact(true);
    try {
      const res = await axiosClient.patch<LayoutSettingsState>('/settings', payload);
      const updated: LayoutSettingsState = {
        brandName: res.data.brandName || payload.brandName,
        hotline: res.data.hotline || payload.hotline,
        zaloPhone: res.data.zaloPhone || payload.zaloPhone,
        viewingHours: res.data.viewingHours || payload.viewingHours,
      };
      setSystemSettings(updated);
      setContactForm(updated);
      window.dispatchEvent(new CustomEvent('drland:settings-updated', { detail: res.data }));
      setModalSuccess('Đã lưu và đồng bộ thông tin liên hệ lên toàn hệ thống.');
    } catch (err: unknown) {
      setModalError(extractError(err, 'Không thể lưu cấu hình liên hệ.'));
    } finally {
      setSavingContact(false);
    }
  };

  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);

    if (!currentPassword) {
      setModalError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 8) {
      setModalError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }
    if (newPassword === currentPassword) {
      setModalError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await axiosClient.patch<{
        message: string;
        admin: { id: string; email: string; fullName: string };
      }>('/auth/change-password', {
        currentPassword,
        newPassword,
        fullName: fullNameInput.trim() || undefined,
      });

      if (res.data?.admin) {
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res.data.admin));
        setAdminProfile(res.data.admin);
        setFullNameInput(res.data.admin.fullName || '');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setModalSuccess(res.data?.message || 'Đã đổi mật khẩu quản trị thành công.');
    } catch (err: unknown) {
      setModalError(extractError(err, 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div className="min-h-screen flex bg-stone-100/70 text-stone-900 font-sans antialiased">
        {/* Sidebar quản trị */}
        <aside className="sticky top-0 h-screen w-60 bg-stone-900 text-stone-100 flex flex-col shrink-0 border-r border-stone-800">
          {/* Thương hiệu */}
          <div className="h-18 px-5 flex items-center gap-3 border-b border-stone-800">
            <div className="w-9 h-9 rounded-lg bg-emerald-700 flex items-center justify-center text-white shrink-0">
              <Home className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-white truncate">
                {systemSettings.brandName}
              </div>
              <p className="text-[11px] text-stone-400 truncate">
                Quản lý nhà trọ &amp; mặt bằng
              </p>
            </div>
          </div>

          {/* Điều hướng chính */}
          <nav className="flex-1 px-3 py-5 space-y-1">
            <div className="px-3 pb-2 text-xs font-medium text-stone-400">
              Nghiệp vụ quản lý
            </div>
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive
                      ? 'bg-emerald-700 text-white'
                      : 'text-stone-300 hover:bg-stone-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}

            {/* Liên kết trang khách thuê */}
            <div className="pt-5 px-3 pb-2 text-xs font-medium text-stone-400">
              Trang khách thuê
            </div>
            <a
              href={CLIENT_PORTAL_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-emerald-300 bg-stone-800/70 hover:bg-stone-800 border border-stone-700/80 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>Mở trang khách thuê</span>
              </span>
            </a>
          </nav>

          {/* Chân sidebar */}
          <div className="p-4 border-t border-stone-800 text-[11px] text-stone-400 space-y-1">
            <div className="text-stone-300 font-medium truncate">
              Đơn vị vận hành: {systemSettings.brandName}
            </div>
            <div className="text-stone-400 tabular-nums">
              Hotline: {systemSettings.hotline}
            </div>
          </div>
        </aside>

        {/* Khung nội dung chính */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 h-18 bg-white border-b border-stone-200 px-4 sm:px-6 flex items-center justify-between shrink-0 gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-stone-900 truncate">
                Hệ Thống Quản Lý {systemSettings.brandName}
              </h2>
              <p className="hidden xl:block text-xs text-stone-500 truncate">
                Sổ quản lý cơ sở lưu trú, hợp đồng thuê và thu chi định kỳ
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={CLIENT_PORTAL_URL}
                target="_blank"
                rel="noreferrer"
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                <span>Xem trang khách thuê</span>
              </a>

              <button
                type="button"
                id="btn-account-settings"
                onClick={() => openAccountModal('CONTACT')}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                title="Cài đặt thông tin liên hệ hệ thống & đổi mật khẩu quản trị"
              >
                <Settings className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="hidden sm:inline">Cài đặt</span>
                <span className="sr-only sm:hidden">Tài khoản &amp; Cài đặt</span>
              </button>

              <div className="flex items-center gap-2 pl-2.5 border-l border-stone-200">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center text-xs border border-emerald-200">
                  QL
                </div>
                <div className="hidden sm:block text-left">
                  <span className="text-xs font-semibold text-stone-900 block leading-tight">
                    {adminDisplayName}
                  </span>
                  <span className="text-[11px] text-stone-500">Chủ nhà / Quản lý</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Đăng xuất khỏi hệ thống"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Modal Cài đặt hệ thống & Đổi mật khẩu quản trị */}
      {isAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4"
          onClick={() => {
            if (!savingContact && !savingPassword) {
              setIsAccountModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-stone-900">
                  Tài Khoản &amp; Cài Đặt Hệ Thống
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Quản lý thông tin liên hệ đồng bộ và bảo mật tài khoản quản trị
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                disabled={savingContact || savingPassword}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs chuyển đổi */}
            <div className="px-6 pt-3 pb-3 bg-stone-50 border-b border-stone-200 shrink-0">
              <div className="grid grid-cols-2 gap-2 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  id="tab-settings-contact"
                  onClick={() => {
                    setActiveTab('CONTACT');
                    setModalError(null);
                    setModalSuccess(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'CONTACT'
                      ? 'bg-white text-stone-900 shadow-xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Thông tin liên hệ</span>
                </button>
                <button
                  type="button"
                  id="tab-settings-security"
                  onClick={() => {
                    setActiveTab('SECURITY');
                    setModalError(null);
                    setModalSuccess(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'SECURITY'
                      ? 'bg-white text-stone-900 shadow-xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Đổi mật khẩu</span>
                </button>
              </div>
            </div>

            {activeTab === 'CONTACT' ? (
              <form
                onSubmit={handleSaveContactSettings}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  {modalError && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{modalError}</span>
                    </div>
                  )}
                  {modalSuccess && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <span>{modalSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Tên thương hiệu / Nhà trọ *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={contactForm.brandName}
                      onChange={(e) =>
                        setContactForm({ ...contactForm, brandName: e.target.value })
                      }
                      placeholder="VD: DRLAND"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                        Số Hotline hiển thị *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={30}
                        value={contactForm.hotline}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, hotline: e.target.value })
                        }
                        placeholder="VD: 0943.257.089"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                        Số Zalo nhận tin nhắn *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={30}
                        value={contactForm.zaloPhone}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, zaloPhone: e.target.value })
                        }
                        placeholder="VD: 0943257089"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-bold tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Khung giờ đón khách xem phòng *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={contactForm.viewingHours}
                      onChange={(e) =>
                        setContactForm({ ...contactForm, viewingHours: e.target.value })
                      }
                      placeholder="VD: 08:00 - 20:30 (Mỗi ngày)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Thay đổi tại đây sẽ lưu trực tiếp vào cơ sở dữ liệu và tự động đồng bộ sang trang khách thuê, mẫu hợp đồng và kênh tư vấn hẹn lịch.
                  </p>
                </div>

                <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(false)}
                    disabled={savingContact}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={savingContact}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {savingContact ? 'Đang lưu…' : 'Lưu cấu hình liên hệ'}
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleChangePassword}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  {modalError && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{modalError}</span>
                    </div>
                  )}
                  {modalSuccess && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <span>{modalSuccess}</span>
                    </div>
                  )}

                  {adminProfile.email && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs flex items-center justify-between">
                      <span className="text-stone-500">Email đăng nhập:</span>
                      <span className="font-semibold text-stone-900">{adminProfile.email}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Họ và tên hiển thị
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={fullNameInput}
                      onChange={(e) => setFullNameInput(e.target.value)}
                      placeholder="VD: Quản lý DRLAND"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Mật khẩu hiện tại *
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu đang dùng…"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Mật khẩu mới (ít nhất 8 ký tự) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mới tối thiểu 8 ký tự…"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Xác nhận mật khẩu mới *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới…"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(false)}
                    disabled={savingPassword}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {savingPassword ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
