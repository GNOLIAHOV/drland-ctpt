import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  RefreshCw,
  AlertCircle,
  Phone,
  Mail,
  CheckCircle2,
  Trash2,
  Search,
  Check,
} from 'lucide-react';
import axiosClient from '../api/axiosClient';

export type BookingStatus =
  | 'PENDING'
  | 'CONTACTED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED';

export interface BookingItem {
  id: string;
  propertyId: string;
  property: {
    id: string;
    code: string;
    name: string;
    status: string;
  };
  guestName: string;
  phoneNumber: string;
  guestEmail: string | null;
  appointmentTime: string | null;
  message: string | null;
  source: string;
  status: BookingStatus;
  notifiedAt: string | null;
  createdAt: string;
}

interface PaginatedBookingsResponse {
  data: BookingItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: 'Chờ xử lý',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  CONTACTED: {
    label: 'Đã liên hệ',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
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
    label: 'Khách hủy',
    className: 'bg-stone-100 text-stone-600 border-stone-200',
  },
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const formatBookingSource = (source: string): string => {
  if (!source) return 'Website';
  const normalized = source.trim().toUpperCase();
  if (normalized === 'AI_CHAT' || normalized === 'AI_AGENT' || normalized === 'CHATBOT') {
    return 'Tư vấn trực tuyến';
  }
  if (normalized === 'WEB' || normalized === 'WEBSITE') {
    return 'Website';
  }
  return source;
};

const extractAppointmentHour = (message: string | null): string | null => {
  if (!message) return null;
  const match = /Giờ hẹn:\s*(\d{2}:\d{2})/i.exec(message);
  return match ? match[1] : null;
};

const stripAppointmentHourPrefix = (message: string | null): string | null => {
  if (!message) return null;
  const stripped = message
    .replace(/^Giờ hẹn:\s*\d{2}:\d{2}\s*(?:[—-]\s*)?/i, '')
    .trim();
  return stripped || null;
};

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get<PaginatedBookingsResponse>('/bookings', {
        params: { limit: 100 },
      });
      setBookings(res.data.data || []);
    } catch {
      setError('Không thể tải danh sách lịch hẹn từ máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBookings();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: BookingStatus) => {
    setUpdatingId(id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await axiosClient.patch<BookingItem>(`/bookings/${id}/status`, {
        status: newStatus,
      });
      setBookings((prev) => prev.map((b) => (b.id === id ? res.data : b)));
      setSuccessMsg(`Đã cập nhật trạng thái lịch hẹn của khách "${res.data.guestName}" thành "${BOOKING_STATUS_CONFIG[newStatus].label}".`);
    } catch {
      setError('Không thể cập nhật trạng thái lịch hẹn. Vui lòng thử lại.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteBooking = async (item: BookingItem) => {
    const confirmed = window.confirm(
      `Xác nhận xóa lịch hẹn của khách "${item.guestName}" (${item.phoneNumber})?`,
    );
    if (!confirmed) return;

    setUpdatingId(item.id);
    setError(null);
    setSuccessMsg(null);
    try {
      await axiosClient.delete(`/bookings/${item.id}`);
      setBookings((prev) => prev.filter((b) => b.id !== item.id));
      setSuccessMsg(`Đã xóa lịch hẹn của khách "${item.guestName}".`);
    } catch {
      setError('Không thể xóa lịch hẹn.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.guestName.toLowerCase().includes(q);
        const matchPhone = item.phoneNumber.includes(q);
        const matchCode = (item.property?.code || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchCode) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            Quản Lý Lịch Hẹn Xem Phòng
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Danh sách khách đăng ký hẹn giờ qua xem phòng trọ và mặt bằng tại các cơ sở.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchBookings()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs sm:text-sm font-semibold transition-colors self-start sm:self-auto cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-emerald-700 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          <span>Làm mới danh sách</span>
        </button>
      </div>

      {/* Thông báo Thành công / Lỗi */}
      {successMsg && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bộ lọc trạng thái & Thanh tìm kiếm */}
      <div className="bg-white rounded-xl border border-stone-200 p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Tabs Trạng thái */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              statusFilter === 'ALL'
                ? 'bg-emerald-700 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Tất cả ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              statusFilter === 'PENDING'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Chờ xử lý ({bookings.filter((b) => b.status === 'PENDING').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('CONFIRMED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              statusFilter === 'CONFIRMED'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Đã chốt hẹn ({bookings.filter((b) => b.status === 'CONFIRMED').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('CANCELLED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 ${
              statusFilter === 'CANCELLED'
                ? 'bg-stone-700 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Khách hủy ({bookings.filter((b) => b.status === 'CANCELLED').length})
          </button>
        </div>

        {/* Ô Tìm kiếm */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, SĐT, mã phòng…"
            className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 focus:bg-white text-stone-900 rounded-lg border border-stone-200 focus:border-emerald-600 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Bảng danh sách Booking Requests */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-700">
                <th className="py-4 px-4">Thời gian hẹn</th>
                <th className="py-4 px-4">Khách hàng</th>
                <th className="py-4 px-4">Liên hệ nhanh</th>
                <th className="py-4 px-4">Phòng quan tâm</th>
                <th className="py-4 px-4">Nguồn</th>
                <th className="py-4 px-4">Trạng thái</th>
                <th className="py-4 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    Đang tải danh sách lịch hẹn…
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    Không có lịch hẹn nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((item) => {
                  const badge = BOOKING_STATUS_CONFIG[item.status] ?? {
                    label: item.status,
                    className: 'bg-stone-100 text-stone-700 border-stone-200',
                  };
                  const appointmentHour = extractAppointmentHour(item.message);
                  const cleanedMessage = stripAppointmentHourPrefix(item.message);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-stone-50/80 transition-colors"
                    >
                      {/* Thời gian hẹn */}
                      <td className="py-4 px-4 whitespace-nowrap tabular-nums">
                        <div className="font-bold text-stone-900 flex items-center gap-1.5">
                          <CalendarClock className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>{item.appointmentTime || 'Chưa định giờ'}</span>
                          {appointmentHour && (
                            <span className="text-emerald-700 font-bold">
                              • {appointmentHour}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5">
                          Tạo lúc: {formatDateTime(item.createdAt)}
                        </div>
                      </td>

                      {/* Khách hàng */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-stone-900">
                          {item.guestName}
                        </div>
                        {item.guestEmail && (
                          <div className="inline-flex items-center gap-1 text-[11px] text-stone-500 mt-0.5">
                            <Mail className="w-3 h-3 text-stone-400" />
                            <span>{item.guestEmail}</span>
                          </div>
                        )}
                        {cleanedMessage && (
                          <div className="text-[11px] text-stone-500 italic mt-0.5 max-w-xs line-clamp-2">
                            &ldquo;{cleanedMessage}&rdquo;
                          </div>
                        )}
                      </td>

                      {/* Nút liên hệ nhanh (Call & Zalo) */}
                      <td className="py-4 px-4 whitespace-nowrap tabular-nums">
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${item.phoneNumber}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                            title="Gọi điện trực tiếp"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.phoneNumber}</span>
                          </a>

                          <a
                            href={`https://zalo.me/${item.phoneNumber.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            title="Mở ứng dụng Zalo chat"
                          >
                            Zalo
                          </a>
                        </div>
                      </td>

                      {/* Phòng quan tâm */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-emerald-800">
                          {item.property?.code || 'N/A'}
                        </div>
                        <div className="text-[11px] text-stone-500 line-clamp-1">
                          {item.property?.name}
                        </div>
                      </td>

                      {/* Nguồn */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-stone-700">
                          {formatBookingSource(item.source)}
                        </span>
                      </td>

                      {/* Dropdown / Badge Trạng thái */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <select
                          value={item.status}
                          disabled={updatingId === item.id}
                          onChange={(e) => void handleUpdateStatus(item.id, e.target.value as BookingStatus)}
                          className={`text-xs font-bold rounded-lg px-2.5 py-1 border cursor-pointer focus:outline-none transition-colors ${badge.className}`}
                        >
                          <option value="PENDING">Chờ xử lý</option>
                          <option value="CONFIRMED">Đã chốt hẹn</option>
                          <option value="CANCELLED">Khách hủy</option>
                          <option value="REJECTED">Từ chối</option>
                        </select>
                      </td>

                      {/* Thao tác (Xóa / Chốt nhanh) */}
                      <td className="py-4 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => void handleUpdateStatus(item.id, 'CONFIRMED')}
                              disabled={updatingId === item.id}
                              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                              title="Xác nhận chốt lịch"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleDeleteBooking(item)}
                            disabled={updatingId === item.id}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                            title="Xóa lịch hẹn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
