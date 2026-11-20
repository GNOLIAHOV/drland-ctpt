import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarClock,
  ReceiptText,
  ArrowRight,
  Plus,
  Phone,
  Clock,
  Check,
  MapPin,
} from 'lucide-react';
import axiosClient from '../api/axiosClient';
import type { HouseItem, PropertyItem } from './Properties';
import type { BookingItem, BookingStatus } from './Bookings';
import type { BillingItem } from './Billings';
import { getDueBillingProperties } from '../utils/billing-automation';

const formatVND = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, { label: string; className: string }> = {
  PENDING: {
    label: 'Chờ gọi lại',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  CONTACTED: {
    label: 'Đã liên hệ',
    className: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  CONFIRMED: {
    label: 'Đã chốt hẹn',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  REJECTED: {
    label: 'Từ chối',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  CANCELLED: {
    label: 'Đã hủy',
    className: 'bg-stone-100 text-stone-600 border-stone-200',
  },
};

export default function Dashboard() {
  const [houses, setHouses] = useState<HouseItem[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [recentBookings, setRecentBookings] = useState<BookingItem[]>([]);
  const [unpaidBillings, setUnpaidBillings] = useState<BillingItem[]>([]);
  const [allBillings, setAllBillings] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [houseRes, propRes, bookRes, billRes] = await Promise.all([
        axiosClient.get<HouseItem[]>('/houses'),
        axiosClient.get<{ data: PropertyItem[]; meta: { total: number } }>(
          '/properties',
          { params: { limit: 100 } },
        ),
        axiosClient.get<{ data: BookingItem[]; meta: { total: number } }>(
          '/bookings',
          { params: { limit: 100 } },
        ),
        axiosClient.get<{ data: BillingItem[]; meta: { total: number } }>(
          '/billings',
          { params: { limit: 100 } },
        ),
      ]);

      const houseList = Array.isArray(houseRes.data) ? houseRes.data : [];
      const props = propRes.data.data || [];
      const books = bookRes.data.data || [];
      const bills = billRes.data.data || [];

      setHouses(houseList);
      setProperties(props);
      setRecentBookings(books);
      setUnpaidBillings(bills.filter((b) => b.status === 'UNPAID'));
      setAllBillings(bills);
    } catch {
      // Ignore summary error silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const handleMarkAsPaid = async (item: BillingItem) => {
    const confirmed = window.confirm(
      `Xác nhận gạch nợ (đã thanh toán) hóa đơn kỳ ${String(item.periodMonth).padStart(2, '0')}/${item.periodYear} của phòng “${item.property.code}” (${formatVND(item.totalAmount)})?`,
    );
    if (!confirmed) return;

    setPayingId(item.id);
    try {
      await axiosClient.patch(`/billings/${item.id}/pay`);
      await loadDashboardData();
    } catch {
      alert('Không thể cập nhật trạng thái thanh toán.');
    } finally {
      setPayingId(null);
    }
  };

  // Thống kê tổng hợp
  const totalProperties = properties.length;
  const roomCount = properties.filter((p) => p.type === 'ROOM').length;
  const commercialCount = properties.filter((p) => p.type === 'COMMERCIAL_SPACE').length;
  const availableCount = properties.filter(
    (p) => p.status === 'AVAILABLE' || p.status === 'SOON_TO_BE_AVAILABLE',
  ).length;
  const rentedCount = properties.filter(
    (p) => p.status === 'RENTED' || p.status === 'DEPOSITED',
  ).length;
  const occupancyRate = totalProperties > 0 ? Math.round((rentedCount / totalProperties) * 100) : 0;

  const pendingBookings = recentBookings.filter((b) => b.status === 'PENDING').length;
  const totalUnpaidAmount = unpaidBillings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalMonthlyPotentialRent = properties.reduce((sum, p) => sum + (p.monthlyRent || 0), 0);

  const dueBillingCount = useMemo(() => {
    return getDueBillingProperties(properties, allBillings).length;
  }, [properties, allBillings]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  const houseOverviewList = useMemo(() => {
    return houses.map((house) => {
      const houseProps = properties.filter(
        (p) => (p.houseId || p.house?.id) === house.id,
      );
      const houseRoomCount = houseProps.filter((p) => p.type === 'ROOM').length;
      const houseCommercialCount = houseProps.filter(
        (p) => p.type === 'COMMERCIAL_SPACE',
      ).length;
      const houseRented = houseProps.filter(
        (p) => p.status === 'RENTED' || p.status === 'DEPOSITED',
      ).length;
      const houseOccupancy =
        houseProps.length > 0 ? Math.round((houseRented / houseProps.length) * 100) : 0;

      const houseCurMonthBills = allBillings.filter(
        (b) =>
          (b.property?.houseId || b.property?.house?.id) === house.id &&
          b.periodMonth === curMonth &&
          b.periodYear === curYear,
      );
      const paidMonthAmount = houseCurMonthBills
        .filter((b) => b.status === 'PAID')
        .reduce((s, b) => s + (b.totalAmount || 0), 0);
      const unpaidMonthAmount = houseCurMonthBills
        .filter((b) => b.status === 'UNPAID')
        .reduce((s, b) => s + (b.totalAmount || 0), 0);

      return {
        house,
        totalUnits: houseProps.length,
        roomCount: houseRoomCount,
        commercialCount: houseCommercialCount,
        houseRented,
        houseOccupancy,
        paidMonthAmount,
        unpaidMonthAmount,
      };
    });
  }, [houses, properties, allBillings, curMonth, curYear]);

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Thao tác nhanh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            Bảng Điều Khiển Vận Hành
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Theo dõi công suất khai thác, lịch khách hẹn xem và công nợ tiền thuê theo từng cơ sở.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            to="/properties"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm phòng</span>
          </Link>
          <Link
            to="/billings"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ReceiptText className="w-4 h-4 text-emerald-700" />
            <span>Lập hóa đơn</span>
          </Link>
        </div>
      </div>

      {/* Nhắc lập hóa đơn chu kỳ nếu có phòng đến hạn */}
      {dueBillingCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-50/70 border border-amber-200 border-l-4 border-l-amber-600 text-xs sm:text-sm">
          <div>
            <div className="font-semibold text-amber-950">
              Có {dueBillingCount} phòng đến kỳ thu tiền (trong 5 ngày tới hoặc quá hạn)
            </div>
            <p className="text-amber-900/90 text-xs mt-0.5">
              Chỉ số điện nước cũ đã được lưu sẵn, chuyển sang trang Hóa đơn để chốt số mới và lập phiếu thu.
            </p>
          </div>
          <Link
            to="/billings"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-amber-100/70 text-amber-950 border border-amber-300 font-semibold text-xs transition-colors shrink-0 whitespace-nowrap"
          >
            <span>Đến trang Hóa đơn ({dueBillingCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Dải Sổ Cái Tổng Hợp (Operational Ledger Strip) */}
      <div className="bg-white rounded-xl border border-stone-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
        {/* Cột 1: Công suất lấp đầy */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-stone-500">
              Công suất lấp đầy ({houses.length} tòa nhà)
            </div>
            <div className="flex items-baseline gap-2 mt-1.5 tabular-nums">
              <span className="text-2xl font-bold text-stone-900">
                {loading ? '…' : `${occupancyRate}%`}
              </span>
              <span className="text-xs text-stone-500">
                ({rentedCount}/{totalProperties} đang thuê)
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="bg-emerald-700 h-full"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
            <div className="text-[11px] text-stone-500 tabular-nums">
              Danh nghĩa: <strong className="text-stone-800">{formatVND(totalMonthlyPotentialRent)}</strong> / tháng
            </div>
          </div>
        </div>

        {/* Cột 2: Phòng & mặt bằng trống */}
        <Link
          to="/properties"
          className="p-5 flex flex-col justify-between gap-3 hover:bg-stone-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        >
          <div>
            <div className="text-xs font-medium text-stone-500">
              Phòng &amp; mặt bằng trống
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1.5 tabular-nums">
              {loading ? '…' : `${availableCount} đơn vị`}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-stone-600 tabular-nums">
            <span>{roomCount} phòng trọ, {commercialCount} mặt bằng</span>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          </div>
        </Link>

        {/* Cột 3: Công nợ chưa thu */}
        <Link
          to="/billings"
          className="p-5 flex flex-col justify-between gap-3 hover:bg-stone-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        >
          <div>
            <div className="text-xs font-medium text-stone-500">
              Công nợ chưa thu
            </div>
            <div className="text-2xl font-bold text-rose-700 mt-1.5 tabular-nums">
              {loading ? '…' : formatVND(totalUnpaidAmount)}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-stone-600 tabular-nums">
            <span>{unpaidBillings.length} hóa đơn chưa thanh toán</span>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          </div>
        </Link>

        {/* Cột 4: Lịch hẹn chờ duyệt */}
        <Link
          to="/bookings"
          className="p-5 flex flex-col justify-between gap-3 hover:bg-stone-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        >
          <div>
            <div className="text-xs font-medium text-stone-500">
              Lịch hẹn chờ duyệt
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-1.5 tabular-nums">
              {loading ? '…' : `${pendingBookings} khách`}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-stone-600 tabular-nums">
            <span>{recentBookings.length} lịch hẹn gần đây</span>
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          </div>
        </Link>
      </div>

      {/* Tổng quan vận hành & thanh toán theo từng Ngôi nhà */}
      {houseOverviewList.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <h2 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-700" />
              <span>Tổng Quan Theo Từng Tòa Nhà (Cơ Sở)</span>
            </h2>
            <p className="text-xs text-stone-500 tabular-nums">
              Số liệu phòng trọ, mặt bằng và tình hình thu tiền kỳ Tháng {String(curMonth).padStart(2, '0')}/{curYear}
            </p>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 ${houseOverviewList.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
            {houseOverviewList.map((item) => (
              <div
                key={item.house.id}
                className="bg-white rounded-xl border border-stone-200 p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold text-stone-600">
                      {item.house.code}
                    </span>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md tabular-nums">
                      Lấp đầy {item.houseOccupancy}%
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-stone-900 mt-1.5 truncate">
                    {item.house.name}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{item.house.address}</span>
                  </p>

                  {/* Bảng thông số kẻ ngang gọn gàng (không lồng thẻ) */}
                  <dl className="mt-4 divide-y divide-stone-100 border-t border-stone-100 text-xs tabular-nums">
                    <div className="py-2 flex items-center justify-between gap-2">
                      <dt className="text-stone-500">Quy mô cơ sở</dt>
                      <dd className="font-semibold text-stone-900">
                        {item.roomCount} phòng trọ
                        {item.commercialCount > 0 ? `, ${item.commercialCount} mặt bằng` : ''}
                      </dd>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <dt className="text-stone-500">Đang khai thác</dt>
                      <dd className="font-semibold text-stone-900">
                        {item.houseRented} / {item.totalUnits} đơn vị
                      </dd>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <dt className="text-stone-500">Đã thu tháng này</dt>
                      <dd className="font-semibold text-emerald-700">
                        {formatVND(item.paidMonthAmount)}
                      </dd>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <dt className="text-stone-500">Còn nợ tháng này</dt>
                      <dd className={`font-semibold ${item.unpaidMonthAmount > 0 ? 'text-rose-700' : 'text-stone-400'}`}>
                        {formatVND(item.unpaidMonthAmount)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-3 pt-3 border-t border-stone-200 flex items-center justify-between gap-2">
                  <Link
                    to={`/properties?houseId=${item.house.id}`}
                    className="text-xs font-medium text-stone-700 hover:text-emerald-800 px-3 py-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200 transition-colors whitespace-nowrap"
                  >
                    Xem phòng &amp; mặt bằng
                  </Link>
                  <Link
                    to={`/billings?houseId=${item.house.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors whitespace-nowrap"
                  >
                    <span>Hóa đơn tòa nhà</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2 Bảng Tác Nghiệp Gần Đây */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Bảng 1: Khách hẹn xem phòng */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col justify-between">
          <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-emerald-700" />
                <span>Khách Hẹn Xem Phòng Gần Đây</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Danh sách khách đăng ký xem phòng cần liên hệ xác nhận giờ hẹn
              </p>
            </div>
            <Link
              to="/bookings"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 divide-y divide-stone-100 text-xs">
            {loading ? (
              <div className="p-8 text-center text-stone-400">Đang tải lịch hẹn…</div>
            ) : recentBookings.length === 0 ? (
              <div className="p-8 text-center text-stone-400">Chưa có lịch hẹn nào mới.</div>
            ) : (
              recentBookings.slice(0, 4).map((book) => {
                const statusInfo = BOOKING_STATUS_LABELS[book.status] ?? {
                  label: book.status,
                  className: 'bg-stone-100 text-stone-700 border-stone-200',
                };
                return (
                  <div key={book.id} className="p-4 hover:bg-stone-50/70 transition-colors flex items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-stone-900 text-sm">{book.guestName}</span>
                        <span className="text-[11px] font-mono font-semibold bg-stone-100 text-stone-700 border border-stone-200 px-2 py-0.5 rounded">
                          {book.property?.code}
                        </span>
                        <span className={`text-[11px] font-semibold border px-2 py-0.5 rounded ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-stone-500 text-xs tabular-nums">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-stone-400" />
                          <span>{book.phoneNumber}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-stone-400" />
                          <span>Hẹn: {book.appointmentTime || 'Chưa định giờ'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`tel:${book.phoneNumber}`}
                        className="p-2 rounded-lg bg-stone-50 hover:bg-stone-100 text-emerald-800 border border-stone-200 transition-colors"
                        title="Gọi khách"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href={`https://zalo.me/${book.phoneNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-stone-50 text-blue-700 border border-stone-200 transition-colors whitespace-nowrap"
                      >
                        Zalo
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 text-center">
            <Link to="/bookings" className="text-xs font-medium text-stone-700 hover:text-emerald-800">
              Quản lý toàn bộ lịch hẹn
            </Link>
          </div>
        </div>

        {/* Bảng 2: Hóa đơn chưa thu tiền */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col justify-between">
          <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-rose-700" />
                <span>Hóa Đơn Chưa Thu Tiền Tháng Này</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Danh sách các đơn vị chưa hoàn tất thanh toán tiền thuê và điện nước
              </p>
            </div>
            <Link
              to="/billings"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 divide-y divide-stone-100 text-xs">
            {loading ? (
              <div className="p-8 text-center text-stone-400">Đang tải hóa đơn…</div>
            ) : unpaidBillings.length === 0 ? (
              <div className="p-8 text-center text-emerald-700 font-medium">
                Toàn bộ hóa đơn các phòng đã được thanh toán đầy đủ.
              </div>
            ) : (
              unpaidBillings.slice(0, 4).map((bill) => (
                <div key={bill.id} className="p-4 hover:bg-stone-50/70 transition-colors flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-stone-900 text-sm">
                        {bill.property.code}
                      </span>
                      {bill.property.tenantName && (
                        <span className="text-xs text-stone-600 truncate">
                          ({bill.property.tenantName})
                        </span>
                      )}
                      <span className="text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded tabular-nums">
                        Kỳ {String(bill.periodMonth).padStart(2, '0')}/{bill.periodYear}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 tabular-nums">
                      Điện: {bill.electricity.usage} kWh, Nước: {bill.water.usage} m³
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right tabular-nums">
                      <div className="font-bold text-sm text-rose-700">
                        {formatVND(bill.totalAmount)}
                      </div>
                      <span className="text-[11px] text-stone-500">Chưa thu</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleMarkAsPaid(bill)}
                      disabled={payingId === bill.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                      title="Xác nhận khách đã nộp tiền"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{payingId === bill.id ? 'Đang lưu…' : 'Gạch nợ'}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 text-center">
            <Link to="/billings" className="text-xs font-medium text-stone-700 hover:text-emerald-800">
              Mở sổ theo dõi và lập hóa đơn tháng mới
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
