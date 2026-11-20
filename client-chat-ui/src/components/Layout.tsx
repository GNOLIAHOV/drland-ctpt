import { Link, Outlet } from 'react-router-dom';
import {
  Home,
  PhoneCall,
  MapPin,
  CalendarCheck,
  Clock,
  MessageCircle,
} from 'lucide-react';
import FloatingChatWidget from './FloatingChatWidget';
import { useChatWidget } from '../context/ChatWidgetContext';
import { formatTopBarAddresses } from '../api/chatApi';

const CURRENT_YEAR = new Date().getFullYear();

export default function Layout() {
  const { openChat, houses, settings } = useChatWidget();
  const topBarAddresses = formatTopBarAddresses(houses);
  const telHref = `tel:${settings.hotlineDigits}`;
  const zaloHref = `https://zalo.me/${settings.zaloPhone}`;

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 antialiased selection:bg-emerald-700 selection:text-white">
      {/* Top Bar Thực Tế - Hotline & Địa chỉ trực tiếp (Sáng sủa, ấm cúng) */}
      <div className="bg-stone-100/90 text-stone-600 text-xs py-2 px-4 border-b border-stone-200">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
            <span className="inline-flex items-center gap-1.5 text-stone-700 font-medium">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>{topBarAddresses}</span>
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-stone-500">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              <span>Xem phòng: {settings.viewingHours}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 font-medium">
            <a
              href={telHref}
              className="inline-flex items-center gap-1.5 text-stone-800 hover:text-emerald-700 active:opacity-75 transition-colors tabular-nums"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-700" />
              <span>Hotline: {settings.hotline}</span>
            </a>
            <span className="text-stone-300">|</span>
            <a
              href={zaloHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 active:opacity-75 font-semibold transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Zalo Chủ Nhà</span>
            </a>
          </div>
        </div>
      </div>

      {/* Header Navigation - Trắng sáng, thanh lịch phong cách M Village / Boutique Living */}
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo Brand */}
          <Link
            to="/"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 sm:gap-3 group min-w-0"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-700 flex items-center justify-center text-white transition-colors group-hover:bg-emerald-800 shadow-xs shrink-0">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="font-bold text-lg text-stone-900 tracking-tight">
                  {settings.brandName}
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Chính chủ 100%
                </span>
              </div>
              <p className="text-[11px] text-stone-500 font-medium truncate">
                Hệ thống phòng trọ &amp; mặt bằng tại TP.HCM
              </p>
            </div>
          </Link>

          {/* Menu Điều hướng phân đoạn mượt mà */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-stone-700 hover:text-emerald-800 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Trang chủ
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-stone-700 hover:text-emerald-800 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Phòng đang trống
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('amenities')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-stone-700 hover:text-emerald-800 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Tiện ích tòa nhà
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('location')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-stone-700 hover:text-emerald-800 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Vị trí & Liên hệ
            </button>
          </nav>

          {/* Nút Gọi & Hẹn xem phòng */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href={telHref}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 text-stone-800 hover:bg-stone-50 active:bg-stone-100 active:scale-[0.98] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap tabular-nums"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>{settings.hotline}</span>
            </a>
            <button
              type="button"
              onClick={openChat}
              className="inline-flex items-center gap-1.5 sm:gap-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <CalendarCheck className="w-4 h-4 text-emerald-100 shrink-0" />
              <span>Hẹn lịch xem</span>
            </button>
          </div>
        </div>
      </header>

      {/* Nội dung chính */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer Ấm áp & Chuẩn mực */}
      <footer className="bg-white border-t border-stone-200 text-stone-600 text-xs py-10 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-stone-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white">
                <Home className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-base text-stone-900">
                  HỆ THỐNG {settings.brandName}
                </span>
                <p className="text-[11px] text-stone-500">Hệ thống cho thuê phòng trọ và mặt bằng tại TP.HCM</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium tabular-nums">
              <a href={telHref} className="text-stone-800 hover:text-emerald-700">
                Hotline: {settings.hotline}
              </a>
              <span>•</span>
              <a href={zaloHref} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
                Zalo Hỗ Trợ 24/7
              </a>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-stone-500 text-[11px]">
            <p className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>
                {houses.length > 0
                  ? `Hệ thống ${houses.length} cơ sở: ${topBarAddresses}`
                  : 'Hệ thống cơ sở tại TP.HCM'}
              </span>
            </p>
            <p>© {CURRENT_YEAR} {settings.brandName}. Phòng thật chính chủ, không qua môi giới, an ninh 24/7.</p>
          </div>
        </div>
      </footer>

      {/* Floating Chat Widget */}
      <FloatingChatWidget />
    </div>
  );
}
