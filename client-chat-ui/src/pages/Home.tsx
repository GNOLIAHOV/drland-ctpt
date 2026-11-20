import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Maximize2,
  Zap,
  Droplets,
  Search,
  Building2,
  Home as HomeIcon,
  Store,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  CalendarCheck,
  Camera,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  LayoutList,
  LayoutGrid,
  PhoneCall,
  MessageCircle,
  ShieldCheck,
  KeyRound,
  ArrowDown,
  Wifi,
  Shirt,
  Bike,
  Wrench,
  GraduationCap,
  Plane,
  ShoppingBag,
  Navigation,
} from 'lucide-react';
import {
  fetchProperties,
  formatNaturalAddressList,
  type PropertyItem,
  type PropertyType,
} from '../api/chatApi';
import { useChatWidget } from '../context/ChatWidgetContext';

const SAMPLE_ROOM_IMAGES = [
  'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1000&q=80',
];

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

export default function Home() {
  const { askAboutProperty, openChat, houses, refreshHouses, settings } = useChatWidget();
  const [searchParams, setSearchParams] = useSearchParams();
  const telHref = `tel:${settings.hotlineDigits}`;
  const zaloHref = `https://zalo.me/${settings.zaloPhone}`;

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>('ALL');
  const [selectedHouseFilter, setSelectedHouseFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid'); // Mặc định là Grid view theo chuẩn M Village / Cozrum
  const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);

  const typeParam = searchParams.get('type') as PropertyType | null;

  const openPropertyDetails = (property: PropertyItem) => {
    setSelectedProperty(property);
    setActivePhotoIdx(0);
  };

  const closePropertyDetails = () => {
    setSelectedProperty(null);
  };

  const modalImages = useMemo(() => {
    if (!selectedProperty) return [];
    if (selectedProperty.images && selectedProperty.images.length > 0) {
      return selectedProperty.images;
    }
    return [SAMPLE_ROOM_IMAGES[0]];
  }, [selectedProperty]);

  useEffect(() => {
    if (!selectedProperty) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePropertyDetails();
      } else if (e.key === 'ArrowLeft') {
        setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : modalImages.length - 1));
      } else if (e.key === 'ArrowRight') {
        setActivePhotoIdx((prev) => (prev < modalImages.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProperty, modalImages.length]);

  const loadProperties = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allItems] = await Promise.all([fetchProperties(), refreshHouses()]);
      const availableItems = allItems.filter(
        (item) => item.status === 'AVAILABLE' || item.status === 'SOON_TO_BE_AVAILABLE'
      );
      setProperties(availableItems);
    } catch {
      setError(
        'Không thể tải danh sách phòng từ máy chủ (core-api: 3001). Vui lòng đảm bảo dịch vụ đang hoạt động.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProperties();
  }, []);

  const availableHouses = useMemo(() => {
    const countsByHouse = new Map<string, number>();
    const fallbackMap = new Map<string, { id: string; code: string; name: string; count: number }>();

    for (const item of properties) {
      const hId = item.houseId || item.house?.id;
      if (hId) {
        countsByHouse.set(hId, (countsByHouse.get(hId) ?? 0) + 1);
        if (item.house && !fallbackMap.has(item.house.id)) {
          fallbackMap.set(item.house.id, {
            id: item.house.id,
            code: item.house.code,
            name: item.house.name,
            count: 0,
          });
        }
      }
    }

    if (houses.length > 0) {
      return [...houses]
        .map((h) => ({
          id: h.id,
          code: h.code,
          name: h.name,
          count: countsByHouse.get(h.id) ?? 0,
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }

    return Array.from(fallbackMap.values())
      .map((h) => ({ ...h, count: countsByHouse.get(h.id) ?? 0 }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [houses, properties]);

  useEffect(() => {
    if (
      selectedHouseFilter !== 'ALL' &&
      availableHouses.length > 0 &&
      !availableHouses.some((h) => h.id === selectedHouseFilter)
    ) {
      setSelectedHouseFilter('ALL');
    }
  }, [availableHouses, selectedHouseFilter]);

  const filteredProperties = useMemo(() => {
    return properties.filter((item) => {
      if (selectedHouseFilter !== 'ALL' && (item.houseId || item.house?.id) !== selectedHouseFilter) {
        return false;
      }

      if (typeParam && item.type !== typeParam) {
        return false;
      }

      if (maxPriceFilter !== 'ALL') {
        const maxRent = Number(maxPriceFilter);
        if (item.monthlyRent > maxRent) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.name.toLowerCase().includes(q);
        const matchCode = item.code.toLowerCase().includes(q);
        const matchAddr = item.address.toLowerCase().includes(q);
        const matchHouseName = (item.house?.name ?? '').toLowerCase().includes(q);
        const matchHouseAddr = (item.house?.address ?? '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchAddr && !matchHouseName && !matchHouseAddr) {
          return false;
        }
      }

      return true;
    });
  }, [properties, selectedHouseFilter, typeParam, maxPriceFilter, searchQuery]);

  const handleTypeSelect = (type: PropertyType | 'ALL') => {
    if (type === 'ALL') {
      searchParams.delete('type');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ type });
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-12">
      {/* 1. HERO BANNER M VILLAGE STYLE (Sáng sủa, hình ảnh lớn ngập nắng, thanh tìm kiếm nổi) */}
      <section className="relative overflow-hidden rounded-3xl shadow-sm border border-stone-200">
        {/* Ảnh nền không gian sống thoáng đãng, ngập nắng tự nhiên */}
        <div className="relative min-h-[380px] sm:min-h-[440px] flex items-center bg-stone-900">
          <img
            src="https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1600&q=85"
            alt="Dịch vụ cho thuê phòng trọ và mặt bằng DRLAND"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Lớp phủ chuyển tiếp mượt mà, giữ trọn ánh sáng tự nhiên */}
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/85 via-stone-950/55 to-stone-950/20" />

          {/* Nội dung Banner */}
          <div className="relative z-10 p-6 sm:p-10 lg:p-14 max-w-2xl space-y-4">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
              Phòng Trọ &amp; Mặt Bằng Chính Chủ {settings.brandName}
            </h1>

            <p className="text-xs sm:text-sm text-stone-200 leading-relaxed max-w-xl">
              Dịch vụ cho thuê phòng trọ và mặt bằng kinh doanh tại <strong className="text-white font-semibold">{formatNaturalAddressList(houses)}</strong>. Khóa vân tay 2 lớp, giờ giấc tự do không chung chủ, giá niêm yết minh bạch.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm px-5 py-3 rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span>Xem phòng trống ngay</span>
                <ArrowDown className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={openChat}
                className="inline-flex items-center gap-2 bg-white/95 hover:bg-white active:bg-stone-100 active:scale-[0.98] text-stone-900 font-semibold text-xs sm:text-sm px-5 py-3 rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <CalendarCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Tư vấn &amp; hẹn xem</span>
              </button>

              <a
                href={zaloHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm px-4 py-3 rounded-xl transition-colors whitespace-nowrap shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Zalo Chủ Nhà</span>
              </a>
            </div>
          </div>
        </div>

        {/* 3 Cam kết cốt lõi chân banner (Nền trắng kem ấm) */}
        <div className="bg-white border-t border-stone-200 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-100 p-4 sm:p-5 text-xs">
          <div className="flex items-center gap-3 p-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-stone-900 text-sm">Chính Chủ 100%</h2>
              <p className="text-stone-500 text-[11px] mt-0.5">Làm việc trực tiếp chủ nhà, không qua môi giới, không phí ẩn.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-stone-900 text-sm">An Ninh Vân Tay 24/7</h2>
              <p className="text-stone-500 text-[11px] mt-0.5">Khóa cổng vân tay 2 lớp, camera các tầng, giờ giấc tự do.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-stone-900 text-sm">Chi Phí Minh Bạch</h2>
              <p className="text-stone-500 text-[11px] mt-0.5">Đồng hồ điện nước riêng từng phòng, niêm yết rõ ràng.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. KHU VỰC TÌM KIẾM & DANH SÁCH PHÒNG THỰC TẾ */}
      <section id="rooms" className="scroll-mt-24 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
            Danh Sách Phòng Đang Trống &amp; Vào Ở Ngay
          </h2>
          <p className="text-xs text-stone-500">
            Ảnh chụp thực tế 100%, cập nhật hôm nay
          </p>
        </div>

        {/* THANH TÌM KIẾM NHANH */}
        <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Tabs Loại hình bất động sản */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleTypeSelect('ALL')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  !typeParam
                    ? 'bg-emerald-700 active:bg-emerald-800 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 active:bg-stone-300'
                }`}
              >
                Tất cả phòng ({properties.length})
              </button>
              <button
                type="button"
                onClick={() => handleTypeSelect('ROOM')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  typeParam === 'ROOM'
                    ? 'bg-emerald-700 active:bg-emerald-800 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 active:bg-stone-300'
                }`}
              >
                Phòng trọ ({properties.filter((p) => p.type === 'ROOM').length})
              </button>
              <button
                type="button"
                onClick={() => handleTypeSelect('COMMERCIAL_SPACE')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  typeParam === 'COMMERCIAL_SPACE'
                    ? 'bg-emerald-700 active:bg-emerald-800 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 active:bg-stone-300'
                }`}
              >
                Mặt bằng ({properties.filter((p) => p.type === 'COMMERCIAL_SPACE').length})
              </button>
            </div>

            {/* Ô Tìm kiếm & Bộ lọc khoảng giá & Chế độ xem */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Ô tìm kiếm từ khóa */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã phòng, tiện ích…"
                  className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-stone-50 focus:bg-white text-stone-900 rounded-xl border border-stone-200 focus:border-emerald-600 focus:outline-none transition-colors"
                />
              </div>

              {/* Dropdown khoảng giá */}
              <select
                value={maxPriceFilter}
                onChange={(e) => setMaxPriceFilter(e.target.value)}
                className="bg-stone-50 hover:bg-stone-100 text-stone-800 text-xs sm:text-sm font-medium rounded-xl px-3.5 py-2.5 border border-stone-200 focus:border-emerald-600 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Mọi mức giá</option>
                <option value="3500000">Dưới 3.5 triệu</option>
                <option value="5000000">Dưới 5 triệu</option>
                <option value="8000000">Dưới 8 triệu</option>
              </select>

              {/* Chuyển đổi Bố cục Lưới / Danh sách */}
              <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Xem dạng lưới (Grid view - Khuyên dùng)"
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-emerald-800 shadow-xs font-bold'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  title="Xem dạng danh sách ngang (List view)"
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-emerald-800 shadow-xs font-bold'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>

              {/* Nút Làm mới */}
              <button
                type="button"
                onClick={() => void loadProperties()}
                disabled={isLoading}
                title="Cập nhật danh sách phòng mới nhất"
                className="p-2.5 rounded-xl text-stone-600 hover:text-emerald-800 hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-700' : ''}`} />
              </button>
            </div>
          </div>

          {/* Thanh lọc theo Tòa nhà / Cơ sở */}
          {availableHouses.length > 0 && (
            <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 whitespace-nowrap mr-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Cơ sở:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedHouseFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  selectedHouseFilter === 'ALL'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Tất cả cơ sở ({properties.length})
              </button>
              {availableHouses.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setSelectedHouseFilter(h.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    selectedHouseFilter === h.id
                      ? 'bg-emerald-700 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {h.name} ({h.count})
                </button>
              ))}
            </div>
          )}

          {/* Thanh trạng thái số lượng phòng */}
          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <div>
              Hiện có <span className="font-bold text-stone-900">{filteredProperties.length}</span> chỗ ở đang mở thuê
            </div>
            <div>
              <span className="font-medium text-emerald-800">Phòng thật chính chủ, cập nhật hôm nay</span>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className="bg-white rounded-2xl border border-stone-200 p-4 space-y-4 motion-safe:animate-pulse motion-reduce:animate-none"
              >
                <div className="w-full h-52 bg-stone-200 rounded-xl" />
                <div className="space-y-2">
                  <div className="h-5 bg-stone-200 rounded w-2/3" />
                  <div className="h-4 bg-stone-100 rounded w-1/2" />
                  <div className="h-8 bg-stone-100 rounded w-full mt-3" />
                  <div className="h-6 bg-stone-200 rounded w-1/3 mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lỗi máy chủ */}
        {!isLoading && error && (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center max-w-lg mx-auto my-10 shadow-xs">
            <AlertCircle className="w-10 h-10 text-stone-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-stone-900">Không thể kết nối danh sách phòng</h3>
            <p className="text-sm text-stone-500 mt-1 mb-5">{error}</p>
            <button
              type="button"
              onClick={() => void loadProperties()}
              className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* Danh sách trống */}
        {!isLoading && !error && filteredProperties.length === 0 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center max-w-md mx-auto my-10 shadow-xs">
            <Building2 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-stone-900">
              Không tìm thấy phòng phù hợp
            </h3>
            <p className="text-xs text-stone-500 mt-1 mb-5">
              Thử thay đổi bộ lọc mức giá hoặc xóa từ khóa tìm kiếm.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setMaxPriceFilter('ALL');
                setSelectedHouseFilter('ALL');
                handleTypeSelect('ALL');
              }}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors cursor-pointer"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}

        {/* A. BỐ CỤC LƯỚI (GRID VIEW - MẶC ĐỊNH KIỂU M VILLAGE / AIRBNB) */}
        {!isLoading && !error && filteredProperties.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProperties.map((property, index) => {
              const isAvailable = property.status === 'AVAILABLE';
              const isRoom = property.type === 'ROOM';
              const displayImages =
                property.images && property.images.length > 0
                  ? property.images
                  : [SAMPLE_ROOM_IMAGES[index % SAMPLE_ROOM_IMAGES.length]];
              const heroImage = displayImages[0];
              const totalImages = displayImages.length;

              return (
                <article
                  key={property.id}
                  className="group bg-white rounded-2xl border border-stone-200/90 hover:border-emerald-600 hover:shadow-xl transition-shadow duration-300 flex flex-col overflow-hidden"
                >
                  {/* Khung ảnh thực tế */}
                  <div
                    onClick={() => openPropertyDetails(property)}
                    className="relative aspect-[16/10] bg-stone-100 overflow-hidden cursor-pointer"
                  >
                    <img
                      src={heroImage}
                      alt={property.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Lớp bóng nhẹ để huy hiệu nổi bật */}
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-transparent to-stone-950/20" />

                    {/* Huy hiệu mã phòng & trạng thái */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-10">
                      <span className="inline-flex items-center gap-1.5 bg-stone-900/90 text-white text-xs font-semibold px-2.5 py-1 rounded-lg">
                        {isRoom ? <HomeIcon className="w-3.5 h-3.5 text-emerald-300" /> : <Store className="w-3.5 h-3.5 text-amber-300" />}
                        <span>{property.code}</span>
                      </span>

                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-800 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Còn trống</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-800 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Sắp trống</span>
                        </span>
                      )}
                    </div>

                    {/* Huy hiệu số lượng ảnh góc dưới */}
                    <div className="absolute bottom-3 right-3 z-10">
                      <span className="inline-flex items-center gap-1 bg-stone-900/90 text-white text-xs font-medium px-2.5 py-1 rounded-lg">
                        <Camera className="w-3.5 h-3.5" />
                        <span>{totalImages} ảnh</span>
                      </span>
                    </div>
                  </div>

                  {/* Thông tin phòng & Biểu phí */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h3
                        onClick={() => openPropertyDetails(property)}
                        className="font-bold text-base sm:text-lg text-stone-900 group-hover:text-emerald-800 transition-colors cursor-pointer line-clamp-1"
                      >
                        {property.name}
                      </h3>

                      <div className="flex items-start gap-1.5 text-xs text-stone-600">
                        <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">
                          {property.house?.name ? `${property.house.name} — ${property.address}` : property.address}
                        </span>
                      </div>

                      {/* Dải thông số tiện ích phân cách bằng đường kẻ */}
                      <div className="grid grid-cols-3 divide-x divide-stone-200/80 pt-3 border-t border-stone-100 text-center text-xs text-stone-700 tabular-nums">
                        <div className="px-1">
                          <div className="text-[11px] text-stone-500">Diện tích</div>
                          <div className="font-bold text-stone-900 mt-0.5">{property.area} m²</div>
                        </div>
                        <div className="px-1">
                          <div className="text-[11px] text-stone-500">Điện</div>
                          <div className="font-bold text-stone-900 mt-0.5">{new Intl.NumberFormat('vi-VN').format(property.electricityRate)}đ</div>
                        </div>
                        <div className="px-1">
                          <div className="text-[11px] text-stone-500">Nước</div>
                          <div className="font-bold text-stone-900 mt-0.5">{new Intl.NumberFormat('vi-VN').format(property.waterRate)}đ</div>
                        </div>
                      </div>
                    </div>

                    {/* Chân thẻ: Giá thuê to rõ trong tone Xanh Ngọc & 3 nút hành động */}
                    <div className="pt-3 border-t border-stone-100 space-y-3 tabular-nums">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <span className="text-2xl font-extrabold text-emerald-700 tracking-tight">
                            {formatVND(property.monthlyRent)}
                          </span>
                          <span className="text-xs text-stone-500 font-medium"> / tháng</span>
                        </div>
                        {property.deposit && (
                          <div className="text-[11px] text-stone-500 whitespace-nowrap">
                            Cọc: {formatVND(property.deposit)}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPropertyDetails(property)}
                          className="py-2.5 px-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-[0.97] text-stone-800 transition-colors cursor-pointer text-center flex items-center justify-center gap-1 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                          <Eye className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                          <span>Xem ảnh</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => askAboutProperty(property.name)}
                          className="py-2.5 px-2 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.97] text-white transition-colors cursor-pointer text-center flex items-center justify-center gap-1 shadow-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                          <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>Hẹn xem</span>
                        </button>

                        <a
                          href={zaloHref}
                          target="_blank"
                          rel="noreferrer"
                          className="py-2.5 px-2 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 active:bg-blue-200 active:scale-[0.97] text-blue-700 border border-blue-200 transition-colors cursor-pointer text-center flex items-center justify-center gap-1 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Zalo</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* B. BỐ CỤC DANH SÁCH NGANG (LIST VIEW) */}
        {!isLoading && !error && filteredProperties.length > 0 && viewMode === 'list' && (
          <div className="space-y-5">
            {filteredProperties.map((property, index) => {
              const isAvailable = property.status === 'AVAILABLE';
              const isRoom = property.type === 'ROOM';
              const displayImages =
                property.images && property.images.length > 0
                  ? property.images
                  : [SAMPLE_ROOM_IMAGES[index % SAMPLE_ROOM_IMAGES.length]];
              const heroImage = displayImages[0];
              const totalImages = displayImages.length;

              return (
                <article
                  key={property.id}
                  className="group bg-white rounded-2xl border border-stone-200/90 hover:border-emerald-600 hover:shadow-lg transition-shadow duration-300 flex flex-col md:flex-row overflow-hidden"
                >
                  {/* Ảnh lớn bên trái */}
                  <div
                    onClick={() => openPropertyDetails(property)}
                    className="relative md:w-80 lg:w-96 h-56 md:h-auto shrink-0 bg-stone-100 overflow-hidden cursor-pointer"
                    title="Nhấn để xem thư viện ảnh chi tiết"
                  >
                    <img
                      src={heroImage}
                      alt={property.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-transparent to-stone-950/20" />

                    {/* Trạng thái & Mã phòng góc trên */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-10">
                      <span className="inline-flex items-center gap-1.5 bg-stone-900/90 text-white text-xs font-semibold px-2.5 py-1 rounded-lg">
                        {isRoom ? <HomeIcon className="w-3.5 h-3.5 text-emerald-300" /> : <Store className="w-3.5 h-3.5 text-amber-300" />}
                        <span>{property.code}</span>
                      </span>

                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-800 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Còn trống</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-800 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Sắp trống</span>
                        </span>
                      )}
                    </div>

                    {/* Huy hiệu số lượng ảnh */}
                    <div className="absolute bottom-3 right-3 z-10">
                      <span className="inline-flex items-center gap-1 bg-stone-900/90 text-white text-xs font-medium px-2.5 py-1 rounded-lg">
                        <Camera className="w-3.5 h-3.5" />
                        <span>{totalImages} ảnh thực tế</span>
                      </span>
                    </div>
                  </div>

                  {/* Thông tin phòng bên phải */}
                  <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h3
                        onClick={() => openPropertyDetails(property)}
                        className="font-bold text-lg sm:text-xl text-stone-900 group-hover:text-emerald-800 transition-colors cursor-pointer"
                      >
                        {property.name}
                      </h3>

                      <div className="flex items-center gap-1.5 text-xs text-stone-600">
                        <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="line-clamp-1">
                          {property.house?.name ? `${property.house.name} — ${property.address}` : property.address}
                        </span>
                      </div>

                      {property.description && (
                        <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed pt-1">
                          {property.description}
                        </p>
                      )}

                      {/* Dải thông số tiện ích */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-stone-100 text-xs text-stone-700 tabular-nums">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Maximize2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Diện tích: <strong className="text-stone-900">{property.area} m²</strong></span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                          <span>Điện: <strong className="text-stone-900">{new Intl.NumberFormat('vi-VN').format(property.electricityRate)}đ</strong></span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Droplets className="w-3.5 h-3.5 text-blue-600" />
                          <span>Nước: <strong className="text-stone-900">{new Intl.NumberFormat('vi-VN').format(property.waterRate)}đ</strong></span>
                        </span>
                        {property.deposit && (
                          <span className="inline-flex items-center gap-1 font-medium text-stone-600">
                            <span>Cọc: <strong className="text-stone-900">{formatVND(property.deposit)}</strong></span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chân thẻ: Giá thuê to rõ & Nút hành động */}
                    <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 tabular-nums">
                      <div>
                        <span className="text-2xl font-extrabold text-emerald-700">
                          {formatVND(property.monthlyRent)}
                        </span>
                        <span className="text-xs text-stone-500 font-medium"> / tháng</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openPropertyDetails(property)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-[0.97] transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-4 h-4 text-stone-500" />
                          <span>Xem {totalImages} ảnh</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => askAboutProperty(property.name)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.97] transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <CalendarCheck className="w-4 h-4" />
                          <span>Hẹn xem phòng</span>
                        </button>

                        <a
                          href={zaloHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 active:scale-[0.97] border border-blue-200 transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Zalo</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. TIỆN ÍCH TÒA NHÀ DRLAND */}
      <section id="amenities" className="scroll-mt-24 pt-6 border-t border-stone-200">
        <div className="max-w-2xl space-y-1.5 mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-900">
            Tiêu Chuẩn Tiện Ích Văn Minh Tại {settings.brandName}
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
            Mỗi góc sinh hoạt đều được đầu tư bài bản từ hệ thống camera an ninh, hầm gửi xe đến khu giặt phơi thoáng gió, mang lại sự tiện nghi và an tâm lâu dài.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-5 rounded-xl border border-stone-200 border-t-2 border-t-emerald-700 space-y-2">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Hầm Để Xe Trong Nhà</span>
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Bãi đỗ xe máy rộng rãi ngay tầng trệt, có cửa cuốn điện, khóa vân tay và camera giám sát 24/7 bảo vệ phương tiện an toàn.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 border-t-2 border-t-emerald-700 space-y-2">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Shirt className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Sân Phơi &amp; Máy Giặt</span>
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Sân thượng thoáng rộng đón nắng gió tự nhiên giúp quần áo khô nhanh thơm tho, có sẵn khu vực đầu cấp thoát nước cho máy giặt riêng.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 border-t-2 border-t-emerald-700 space-y-2">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Wifi Từng Tầng Ổn Định</span>
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Trang bị hệ thống phát Wifi chuyên dụng từng tầng với đường truyền cáp quang tốc độ cao, ổn định cho học tập và làm việc online.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 border-t-2 border-t-emerald-700 space-y-2">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Hỗ Trợ Kỹ Thuật Nhanh</span>
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Đội ngũ quản lý tận tâm, hỗ trợ kiểm tra và khắc phục các vấn đề điện nước, thiết bị phòng nhanh chóng ngay trong ngày.
            </p>
          </div>
        </div>
      </section>

      {/* 4. VỊ TRÍ ĐẮC ĐỊA & KẾT NỐI KHU VỰC */}
      <section id="location" className="scroll-mt-24 pt-6 border-t border-stone-200">
        <div className="max-w-2xl space-y-1.5 mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-900">
            Vị Trí Đắc Địa Bình Thạnh: Di Chuyển Dễ Dàng
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
            Các cơ sở tọa lạc tại <strong className="text-stone-900 font-semibold">{formatNaturalAddressList(houses)}</strong>, khu vực an ninh yên tĩnh, thuận tiện di chuyển vào trung tâm và các trường Đại học.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột 1 & 2: Bảng kết nối tiện ích khu vực */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-stone-200 p-6 sm:p-7 space-y-5">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-emerald-700" />
              <span>Khoảng cách di chuyển tới các điểm trọng điểm</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 pt-3 border-t border-stone-100 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-stone-900">
                  <GraduationCap className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>5 đến 7 phút tới các trường Đại học</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Đại học HUTECH, ĐH Kinh tế - Tài chính (UEF), ĐH Mỹ Thuật, ĐH Ngoại Thương CS2, ĐH Giao thông Vận tải.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-stone-900">
                  <Plane className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>3 đến 5 phút sang Quận 1 &amp; Landmark 81</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Chỉ cách cầu Thị Nghè, Thảo Cầm Viên, Quận 1 và khu đô thị Vinhomes Central Park vài phút di chuyển thuận tiện.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-stone-900">
                  <ShoppingBag className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Bán kính 200m ngập tràn tiện ích</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Chợ Thị Nghè, siêu thị Bách Hóa Xanh, WinMart+, tiệm thuốc tây 24/7 và vô số hàng quán ăn uống phong phú khu Bình Thạnh.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-stone-900">
                  <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Khu dân cư văn minh, yên tĩnh</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Hẻm an ninh, dân trí cao, không ngập nước khi mưa lớn, môi trường lý tưởng để nghỉ ngơi và tập trung làm việc.
                </p>
              </div>
            </div>
          </div>

          {/* Cột 3: Thẻ đón tiếp khách & Đặt lịch trực tiếp */}
          <div className="bg-stone-900 text-stone-100 rounded-xl p-6 sm:p-7 flex flex-col justify-between space-y-6 border border-stone-800">
            <div className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                Ghé Xem Phòng Thực Tế Hôm Nay
              </h3>
              <p className="text-xs text-stone-300 leading-relaxed">
                Quản lý luôn sẵn sàng đón tiếp Anh/Chị ghé xem trực tiếp từng phòng, trải nghiệm không gian sống và đối chiếu tiện nghi.
              </p>

              <div className="space-y-2.5 pt-3 text-xs border-t border-stone-800">
                <div className="flex items-center gap-2 text-stone-200">
                  <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Giờ mở cửa: {settings.viewingHours}</span>
                </div>
                <div className="flex items-start gap-2 text-stone-200">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{formatNaturalAddressList(houses)}</span>
                </div>
                <div className="flex items-center gap-2 text-stone-200 tabular-nums">
                  <PhoneCall className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Hotline: {settings.hotline}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={openChat}
                className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] text-stone-950 font-bold text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <CalendarCheck className="w-4 h-4 text-emerald-800 shrink-0" />
                <span>Đặt lịch hẹn xem phòng</span>
              </button>

              <a
                href={zaloHref}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white font-medium text-xs py-2.5 px-4 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 tabular-nums"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Nhắn tin qua Zalo ({settings.hotline})</span>
              </a>
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* 5. LIGHTBOX THƯ VIỆN ẢNH & CHI TIẾT PHÒNG */}
      {selectedProperty && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/75 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={closePropertyDetails}
        >
          <div
            className="relative bg-white rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-lg border border-stone-200 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Dialog */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-lg">
                  {selectedProperty.code}
                </span>
                <h2 className="text-base sm:text-lg font-bold text-stone-900 line-clamp-1">
                  {selectedProperty.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={closePropertyDetails}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thân Dialog cuộn */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              {/* Trình xem ảnh lớn */}
              <div>
                <div className="relative h-72 sm:h-96 w-full bg-stone-950 rounded-2xl overflow-hidden flex items-center justify-center select-none">
                  <img
                    src={modalImages[activePhotoIdx]}
                    alt={`${selectedProperty.name} - Ảnh ${activePhotoIdx + 1}`}
                    className="w-full h-full object-cover"
                  />

                  <div className="absolute top-3 right-3 bg-stone-900/90 text-white text-xs font-medium px-2.5 py-1 rounded-lg">
                    Ảnh {activePhotoIdx + 1} / {modalImages.length}
                  </div>

                  {modalImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : modalImages.length - 1))
                        }
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white flex items-center justify-center transition-colors cursor-pointer shadow-md"
                        title="Xem ảnh trước (←)"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActivePhotoIdx((prev) => (prev < modalImages.length - 1 ? prev + 1 : 0))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white flex items-center justify-center transition-colors cursor-pointer shadow-md"
                        title="Xem ảnh kế tiếp (→)"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Dải ảnh nhỏ */}
                {modalImages.length > 1 && (
                  <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                    {modalImages.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={`relative w-20 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-colors cursor-pointer ${
                          activePhotoIdx === idx
                            ? 'border-emerald-600 opacity-100 ring-2 ring-emerald-600/30'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Thông tin phòng & Biểu phí */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-stone-200">
                {/* Cột trái: Giá thuê & Biểu phí */}
                <div className="space-y-4 tabular-nums">
                  <div className="p-4 bg-emerald-50/60 rounded-xl">
                    <div className="text-xs font-semibold text-emerald-800">Giá thuê niêm yết chính chủ</div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-emerald-800 mt-1">
                      {formatVND(selectedProperty.monthlyRent)}
                      <span className="text-sm font-normal text-stone-600"> / tháng</span>
                    </div>
                    {selectedProperty.deposit && (
                      <div className="text-xs text-stone-700 mt-2 font-medium">
                        Tiền cọc giữ phòng: <span className="font-bold text-stone-900">{formatVND(selectedProperty.deposit)}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-stone-200 space-y-2.5 text-xs text-stone-700">
                    <div className="font-bold text-stone-900">Chi phí dịch vụ hàng tháng</div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                      <div>Điện: <span className="font-semibold text-stone-900">{new Intl.NumberFormat('vi-VN').format(selectedProperty.electricityRate)} đ/kWh</span></div>
                      <div>Nước: <span className="font-semibold text-stone-900">{new Intl.NumberFormat('vi-VN').format(selectedProperty.waterRate)} đ/m³</span></div>
                      <div>Diện tích: <span className="font-semibold text-stone-900">{selectedProperty.area} m²</span></div>
                      <div>Dịch vụ: <span className="font-semibold text-stone-900">{selectedProperty.serviceFee ? `${new Intl.NumberFormat('vi-VN').format(selectedProperty.serviceFee)} đ` : 'Miễn phí'}</span></div>
                    </div>
                  </div>
                </div>

                {/* Cột phải: Địa chỉ & Mô tả */}
                <div className="space-y-4 flex flex-col justify-between md:border-l md:border-stone-200 md:pl-6">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-bold text-stone-900">Địa chỉ phòng</div>
                      <div className="flex items-start gap-2 mt-1.5 text-xs text-stone-700">
                        <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                        <span>
                          {selectedProperty.house?.name
                            ? `${selectedProperty.house.name} — ${selectedProperty.address}`
                            : selectedProperty.address}
                        </span>
                      </div>
                    </div>

                    {selectedProperty.description && (
                      <div className="pt-3 border-t border-stone-100">
                        <div className="text-xs font-bold text-stone-900">Mô tả tiện nghi</div>
                        <p className="mt-1.5 text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                          {selectedProperty.description}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-500">
                    Hình ảnh chụp thực tế tại phòng. Quý khách có thể đặt lịch để qua xem trực tiếp bất kỳ lúc nào.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Dialog */}
            <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-3">
              <a
                href={telHref}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-stone-800 bg-white border border-stone-200 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] transition-colors whitespace-nowrap tabular-nums"
              >
                <PhoneCall className="w-3.5 h-3.5 text-emerald-700" />
                <span>Gọi {settings.hotline}</span>
              </a>

              <div className="flex items-center gap-2">
                <a
                  href={zaloHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 active:scale-[0.98] border border-blue-200 transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Zalo</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    const propName = selectedProperty.name;
                    closePropertyDetails();
                    askAboutProperty(propName);
                  }}
                  className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>Hẹn lịch xem phòng này</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
