import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Home as HomeIcon,
  Search,
  UploadCloud,
  Loader2,
  Link as LinkIcon,
  User,
  ShieldAlert,
  History,
  Calendar,
  Wrench,
  BellRing,
  ChevronRight,
  Check,
  ClipboardCheck,
  Lock,
  Unlock,
  Building2,
  MapPin,
  Store,
  FileText,
  Download,
  Printer,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import axiosClient from '../api/axiosClient';
import {
  calculateLeaseMonths,
  downloadRentalContractDoc,
  formatContractCurrency,
  formatContractDate,
  numberToVietnameseWords,
  printRentalContract,
  type ContractPropertyInput,
  type ContractSystemSettings,
} from '../utils/contract-template';

interface LatestMeterRecord {
  electricityIndex: number;
  waterIndex: number;
}

interface BillingSummaryItem {
  property?: { id?: string } | null;
  periodYear?: number;
  periodMonth?: number;
  electricity?: { newIndex?: number } | null;
  water?: { newIndex?: number } | null;
}

const CURRENT_CONTRACT_YEAR = new Date().getFullYear();
import {
  getExpiringRentedProperties,
  getReadyForHandoverProperties,
  addMonthsToDate,
  getDaysRemaining,
  type ExpiringLeaseInfo,
  type HandoverPropertyInfo,
} from '../utils/lease-expiration';

export type PropertyType = 'ROOM' | 'COMMERCIAL_SPACE';
export type PropertyStatus =
  | 'AVAILABLE'
  | 'SOON_TO_BE_AVAILABLE'
  | 'DEPOSITED'
  | 'RENTED';

export interface HouseSummary {
  id: string;
  code: string;
  name: string;
  address: string;
}

export interface HouseItem extends HouseSummary {
  defaultElectricityRate: number;
  defaultWaterRate: number;
  defaultServiceFee: number;
  description: string | null;
  stats: {
    totalProperties: number;
    roomCount: number;
    commercialCount: number;
    rentedCount: number;
    availableCount: number;
  };
}

export interface PropertyItem {
  id: string;
  houseId?: string | null;
  house?: HouseSummary | null;
  code: string;
  name: string;
  type: PropertyType;
  address: string;
  area: number;
  monthlyRent: number;
  deposit: number | null;
  electricityRate: number;
  waterRate: number;
  serviceFee: number;
  status: PropertyStatus;
  availableFrom: string | null;
  description: string | null;
  images: string[];
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantCitizenId?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  depositPaid?: number | null;
  tenantCount?: number | null;
  vehicleCount?: number | null;
  rentalNotes?: string | null;
}

interface PaginatedPropertiesResponse {
  data: PropertyItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface PropertyFormState {
  houseId: string;
  code: string;
  name: string;
  type: PropertyType;
  address: string;
  area: string;
  monthlyRent: string;
  deposit: string;
  electricityRate: string;
  waterRate: string;
  serviceFee: string;
  status: PropertyStatus;
  availableFrom: string;
  description: string;
  images: string[];
  newImageUrl: string;
  tenantName: string;
  tenantPhone: string;
  tenantCitizenId: string;
  leaseStartDate: string;
  leaseEndDate: string;
  depositPaid: string;
  tenantCount: string;
  vehicleCount: string;
  rentalNotes: string;
}

const initialFormState: PropertyFormState = {
  houseId: '',
  code: '',
  name: '',
  type: 'ROOM',
  address: '',
  area: '25',
  monthlyRent: '4200000',
  deposit: '4200000',
  electricityRate: '3800',
  waterRate: '100000',
  serviceFee: '50000',
  status: 'AVAILABLE',
  availableFrom: '',
  description: '',
  images: [],
  newImageUrl: '',
  tenantName: '',
  tenantPhone: '',
  tenantCitizenId: '',
  leaseStartDate: '',
  leaseEndDate: '',
  depositPaid: '',
  tenantCount: '1',
  vehicleCount: '0',
  rentalNotes: '',
};

const SAMPLE_IMAGE_SUGGESTIONS = [
  { label: '+ Giường & Phòng ngủ', url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80' },
  { label: '+ Gác lửng', url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80' },
  { label: '+ Ban công & View', url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80' },
  { label: '+ Gian bếp tiện nghi', url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80' },
  { label: '+ WC sạch sẽ', url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80' },
];

const STATUS_BADGE: Record<
  PropertyStatus,
  { label: string; className: string }
> = {
  AVAILABLE: {
    label: 'Đang trống',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  SOON_TO_BE_AVAILABLE: {
    label: 'Sắp trống',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  DEPOSITED: {
    label: 'Đã cọc',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  RENTED: {
    label: 'Đang thuê',
    className: 'bg-stone-100 text-stone-600 border-stone-200',
  },
};

interface StatusTransitionOption {
  id: string;
  label: string;
  targetStatus: PropertyStatus;
  hint: string;
}

function parseDateSafe(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Check YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Check DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDisplay(dateStr?: string | null): string {
  const d = parseDateSafe(dateStr);
  if (!d) return dateStr || '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Logic hóa lý do chuyển đổi trạng thái phòng dựa trên:
 * 1. Ngày tháng ở thực tế & Hạn hợp đồng (leaseStartDate, leaseEndDate, availableFrom).
 * 2. Ngữ cảnh khách đang ở (có tên khách hay đang sửa chữa).
 */
function generateSmartTransitionReasons(item: PropertyItem): StatusTransitionOption[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reasons: StatusTransitionOption[] = [];

  // 1. NẾU PHÒNG ĐANG CHO THUÊ (RENTED)
  if (item.status === 'RENTED') {
    const endDate = parseDateSafe(item.leaseEndDate);
    const tenantText = item.tenantName ? `khách "${item.tenantName}"` : 'khách';

    if (endDate) {
      const diffMs = endDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 3600 * 24));
      const endDateStr = formatDateDisplay(item.leaseEndDate);

      if (diffDays <= 0) {
        // Hợp đồng đã đến hạn hoặc quá hạn
        const daysPast = Math.abs(diffDays);
        const expiredLabel = daysPast === 0 ? 'hôm nay' : `đã quá ${daysPast} ngày`;
        reasons.push({
          id: 'rent_end_contract_expired',
          label: `Hợp đồng đã kết thúc (${expiredLabel}, hạn HĐ: ${endDateStr}) - ${tenantText} trả phòng đúng hạn`,
          targetStatus: 'AVAILABLE',
          hint: 'Chuyển về Đang trống, kết thúc hợp đồng theo đúng thời hạn',
        });
        reasons.push({
          id: 'rent_end_soon_expired',
          label: `Hợp đồng đã kết thúc (${endDateStr}) - ${tenantText} xin thêm vài ngày để thu dọn đồ`,
          targetStatus: 'SOON_TO_BE_AVAILABLE',
          hint: 'Chuyển sang Sắp trống để chờ khách dọn nốt đồ',
        });
      } else if (diffDays <= 30) {
        // Hợp đồng sắp hết hạn (trong vòng 30 ngày)
        reasons.push({
          id: 'rent_notice_leaving_soon',
          label: `Hợp đồng sắp hết hạn (còn ${diffDays} ngày, hết hạn: ${endDateStr}) - ${tenantText} báo trước ngày sẽ dọn đi`,
          targetStatus: 'SOON_TO_BE_AVAILABLE',
          hint: 'Chuyển sang Sắp trống để bắt đầu mở nhận cọc/đón khách mới',
        });
        reasons.push({
          id: 'rent_end_early_few_days',
          label: `Hợp đồng sắp hết hạn (còn ${diffDays} ngày, hạn: ${endDateStr}) - ${tenantText} xin dọn đi sớm`,
          targetStatus: 'AVAILABLE',
          hint: 'Khách bàn giao phòng sớm hơn vài ngày so với hạn hợp đồng',
        });
      } else {
        // Hợp đồng vẫn còn dài hạn (trên 30 ngày)
        const monthsLeft = Math.max(1, Math.round(diffDays / 30));
        reasons.push({
          id: 'rent_break_contract_early',
          label: `Khách đột ngột hủy hợp đồng / dọn đi ngang (Phạt mất cọc 100%, HĐ gốc còn ${monthsLeft} tháng đến: ${endDateStr})`,
          targetStatus: 'AVAILABLE',
          hint: 'Khách đơn phương chấm dứt hợp đồng sớm trước thời hạn thỏa thuận (vi phạm hợp đồng)',
        });
        reasons.push({
          id: 'rent_mutual_terminate',
          label: `Hai bên thỏa thuận chấm dứt HĐ sớm (Thương lượng hoàn 1 phần cọc / trừ chi phí, HĐ gốc còn ${monthsLeft} tháng đến: ${endDateStr})`,
          targetStatus: 'AVAILABLE',
          hint: 'Chủ nhà và khách đồng thuận kết thúc hợp đồng sớm',
        });
        reasons.push({
          id: 'rent_early_notice_soon',
          label: `Khách xin dọn đi sớm: Đã báo trước để tìm người thế chỗ (Xem xét đối soát cọc khi bàn giao, HĐ gốc còn ${monthsLeft} tháng đến: ${endDateStr})`,
          targetStatus: 'SOON_TO_BE_AVAILABLE',
          hint: 'Chuyển sang Sắp trống để chuẩn bị tìm khách thay thế, giữ thông tin khách cũ để đối soát cọc',
        });
      }
    } else {
      // Không có ngày kết thúc HĐ cụ thể
      reasons.push({
        id: 'rent_leave_no_date',
        label: `Khách kết thúc thuê / trả phòng`,
        targetStatus: 'AVAILABLE',
        hint: 'Bàn giao phòng hoàn tất',
      });
      reasons.push({
        id: 'rent_break_no_date',
        label: `Khách đột ngột hủy hợp đồng / trả phòng sớm`,
        targetStatus: 'AVAILABLE',
        hint: 'Chuyển về Đang trống để tìm khách mới',
      });
      reasons.push({
        id: 'rent_notice_no_date',
        label: `Khách thông báo trước ngày sẽ dọn đi`,
        targetStatus: 'SOON_TO_BE_AVAILABLE',
        hint: 'Chuyển sang Sắp trống',
      });
    }

    reasons.push({
      id: 'rent_maintenance_terminate',
      label: 'Sự cố hỏng hóc lớn: Khách trả phòng sớm (Chủ nhà hoàn 100% cọc & chuyển phòng sang sửa chữa)',
      targetStatus: 'SOON_TO_BE_AVAILABLE',
      hint: 'Khách dọn đi do sự cố hư hỏng, hoàn 100% cọc; phòng chuyển sang sửa chữa để đón khách sau',
    });
    reasons.push({
      id: 'rent_violation',
      label: 'Khách vi phạm nội quy khu nhà / Chấm dứt quyền thuê',
      targetStatus: 'AVAILABLE',
      hint: 'Thu hồi phòng do vi phạm nội quy',
    });
    reasons.push({
      id: 'rent_other',
      label: 'Lý do khác (tự nhập chi tiết bên dưới)',
      targetStatus: 'AVAILABLE',
      hint: 'Chọn trạng thái mong muốn và ghi rõ chi tiết',
    });

    return reasons;
  }

  // 2. NẾU PHÒNG ĐANG ĐẶT CỌC (DEPOSITED)
  if (item.status === 'DEPOSITED') {
    const startDate = parseDateSafe(item.leaseStartDate);
    const tenantText = item.tenantName ? `khách "${item.tenantName}"` : 'khách';

    if (startDate) {
      const diffMs = startDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 3600 * 24));
      const startDateStr = formatDateDisplay(item.leaseStartDate);

      if (diffDays < 0) {
        // Đã quá hạn hẹn nhận phòng
        const daysPast = Math.abs(diffDays);
        reasons.push({
          id: 'dep_expired_overdue',
          label: `Đã quá hạn hẹn nhận phòng (${daysPast} ngày quá hạn, lịch hẹn: ${startDateStr}) mà ${tenantText} không đến (Mất cọc)`,
          targetStatus: 'AVAILABLE',
          hint: 'Quá hạn giữ chỗ, phòng tự động mở lại cho khách khác thuê và xử lý giữ cọc theo quy định',
        });
        reasons.push({
          id: 'dep_cancel_refund_overdue',
          label: `Quá hạn hẹn nhận phòng (${startDateStr}) - Khách xin hủy cọc (Chủ nhà đồng ý hoàn lại tiền cọc)`,
          targetStatus: 'AVAILABLE',
          hint: 'Hủy giữ chỗ và hoàn lại cọc cho khách, mở lại phòng trống',
        });
      } else {
        // Chưa đến hạn hoặc đúng ngày hẹn
        const daysLeftText = diffDays === 0 ? 'hôm nay' : `còn ${diffDays} ngày, hẹn ngày ${startDateStr}`;
        reasons.push({
          id: 'dep_checkin_success',
          label: `${tenantText} đã thanh toán đủ tiền, ký HĐ và chính thức dọn vào ở (Lịch hẹn: ${daysLeftText})`,
          targetStatus: 'RENTED',
          hint: 'Chuyển sang Đang thuê để bắt đầu tính tiền thuê và điện nước hàng tháng',
        });
        reasons.push({
          id: 'dep_cancel_lost_ontime',
          label: `${tenantText} đổi ý không thuê nữa trước ngày hẹn nhận phòng (Mất cọc theo quy định)`,
          targetStatus: 'AVAILABLE',
          hint: 'Giải phóng phòng và giữ cọc theo quy chế đặt cọc',
        });
        reasons.push({
          id: 'dep_cancel_refund_ontime',
          label: `${tenantText} hủy cọc trước ngày hẹn (Chủ nhà đồng ý hoàn lại tiền cọc)`,
          targetStatus: 'AVAILABLE',
          hint: 'Giải phóng phòng và hoàn lại tiền cọc cho khách',
        });
      }
    } else {
      reasons.push({
        id: 'dep_to_rent_generic',
        label: `${tenantText} đã thanh toán đủ tiền, ký hợp đồng và chính thức dọn vào ở`,
        targetStatus: 'RENTED',
        hint: 'Chuyển sang Đang thuê',
      });
      reasons.push({
        id: 'dep_cancel_lost_generic',
        label: `${tenantText} đổi ý không thuê nữa (Mất cọc theo quy định)`,
        targetStatus: 'AVAILABLE',
        hint: 'Chuyển về Đang trống',
      });
      reasons.push({
        id: 'dep_cancel_refund_generic',
        label: `${tenantText} hủy cọc (Chủ nhà đồng ý hoàn lại tiền cọc)`,
        targetStatus: 'AVAILABLE',
        hint: 'Chuyển về Đang trống và hoàn cọc',
      });
      reasons.push({
        id: 'dep_expired_generic',
        label: `Quá thời hạn hẹn giữ chỗ mà ${tenantText} không đến nhận phòng`,
        targetStatus: 'AVAILABLE',
        hint: 'Hết hạn giữ chỗ',
      });
    }

    reasons.push({
      id: 'dep_other',
      label: 'Lý do khác (tự nhập chi tiết bên dưới)',
      targetStatus: 'AVAILABLE',
      hint: 'Chọn trạng thái mong muốn và ghi rõ chi tiết',
    });

    return reasons;
  }

  // 3. NẾU PHÒNG ĐANG Ở TRẠNG THÁI SẮP TRỐNG (SOON_TO_BE_AVAILABLE)
  if (item.status === 'SOON_TO_BE_AVAILABLE') {
    const availDate = parseDateSafe(item.availableFrom);
    const hasTenant = Boolean(item.tenantName && item.tenantName.trim());
    const tenantText = hasTenant ? `khách cũ "${item.tenantName}"` : 'khách cũ';
    const availDateStr = availDate ? formatDateDisplay(item.availableFrom) : (item.availableFrom || '');

    if (availDate) {
      const diffMs = availDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 3600 * 24));

      if (diffDays <= 0) {
        // Đã đến ngày hoặc quá ngày dự kiến trống
        if (hasTenant) {
          reasons.push({
            id: 'soon_past_tenant_done',
            label: `Đã đến ngày dự kiến trống (${availDateStr}): ${tenantText} đã dọn đi xong, phòng đã dọn sạch sẵn sàng`,
            targetStatus: 'AVAILABLE',
            hint: 'Chuyển về Đang trống để đón khách mới vào ở ngay',
          });
          reasons.push({
            id: 'soon_past_tenant_stay',
            label: `${tenantText} đổi ý không chuyển đi nữa, tiếp tục gia hạn hợp đồng thuê`,
            targetStatus: 'RENTED',
            hint: 'Khôi phục lại trạng thái Đang thuê cho khách cũ',
          });
        } else {
          reasons.push({
            id: 'soon_past_repair_done',
            label: `Đã đến ngày dự kiến xong (${availDateStr}): Hoàn tất sửa chữa/bảo trì, phòng sẵn sàng cho thuê`,
            targetStatus: 'AVAILABLE',
            hint: 'Phòng đã sửa xong sạch đẹp, chuyển về Đang trống',
          });
        }
      } else {
        // Chưa đến ngày dự kiến trống (còn trong tương lai)
        if (hasTenant) {
          reasons.push({
            id: 'soon_early_tenant_done',
            label: `${tenantText} dọn đi sớm hơn dự kiến (${diffDays} ngày trước hạn ${availDateStr}), phòng đã sẵn sàng`,
            targetStatus: 'AVAILABLE',
            hint: 'Khách bàn giao phòng sớm hơn lịch hẹn',
          });
          reasons.push({
            id: 'soon_early_tenant_stay',
            label: `${tenantText} hủy kế hoạch chuyển đi, tiếp tục thuê tiếp`,
            targetStatus: 'RENTED',
            hint: 'Khôi phục hợp đồng của khách',
          });
        } else {
          reasons.push({
            id: 'soon_early_repair_done',
            label: `Sửa chữa/bảo trì hoàn thành sớm hơn dự kiến (${availDateStr}), phòng sẵn sàng đón khách`,
            targetStatus: 'AVAILABLE',
            hint: 'Phòng sửa xong trước hạn',
          });
        }
      }
    } else {
      if (hasTenant) {
        reasons.push({
          id: 'soon_generic_tenant_done',
          label: `${tenantText} đã dọn đi xong, phòng đã dọn dẹp vệ sinh sạch sẽ`,
          targetStatus: 'AVAILABLE',
          hint: 'Chuyển về Đang trống',
        });
        reasons.push({
          id: 'soon_generic_tenant_stay',
          label: `${tenantText} đổi ý không chuyển đi nữa, tiếp tục gia hạn hợp đồng`,
          targetStatus: 'RENTED',
          hint: 'Giữ nguyên hợp đồng',
        });
      } else {
        reasons.push({
          id: 'soon_generic_repair_done',
          label: 'Hoàn tất sửa chữa/bảo trì phòng, sẵn sàng đón khách mới',
          targetStatus: 'AVAILABLE',
          hint: 'Chuyển về Đang trống',
        });
      }
    }

    reasons.push({
      id: 'soon_new_dep',
      label: 'Đã có khách mới đặt cọc giữ chỗ trước cho phòng sắp trống này',
      targetStatus: 'DEPOSITED',
      hint: 'Chuyển sang Đã đặt cọc cho khách mới',
    });
    reasons.push({
      id: 'soon_new_rent',
      label: 'Khách mới chính thức ký hợp đồng và dọn vào ở ngay',
      targetStatus: 'RENTED',
      hint: 'Chuyển sang Đang thuê cho khách mới',
    });
    reasons.push({
      id: 'soon_other',
      label: 'Lý do khác (tự nhập chi tiết bên dưới)',
      targetStatus: 'AVAILABLE',
      hint: 'Chọn trạng thái mong muốn và ghi rõ chi tiết',
    });

    return reasons;
  }

  return [];
}

const TYPE_LABEL: Record<PropertyType, string> = {
  ROOM: 'Phòng trọ',
  COMMERCIAL_SPACE: 'Mặt bằng KD',
};

const formatVND = (amount: unknown): string => {
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (isNaN(num)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
};

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data === 'string' && data.trim()) return data;
    if (data && typeof data === 'object') {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
      if (Array.isArray(msg)) {
        return msg.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('; ');
      }
      const errField = (data as { error?: unknown }).error;
      if (typeof errField === 'string' && errField.trim()) return errField;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

interface HouseFormState {
  code: string;
  name: string;
  address: string;
  defaultElectricityRate: string;
  defaultWaterRate: string;
  defaultServiceFee: string;
  description: string;
}

const initialHouseFormState: HouseFormState = {
  code: '',
  name: '',
  address: '',
  defaultElectricityRate: '3800',
  defaultWaterRate: '100000',
  defaultServiceFee: '50000',
  description: '',
};

export default function Properties() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [houses, setHouses] = useState<HouseItem[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<string>(
    () => searchParams.get('houseId') || 'ALL',
  );
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // House Modal state
  const [isHouseModalOpen, setIsHouseModalOpen] = useState(false);
  const [editingHouse, setEditingHouse] = useState<HouseItem | null>(null);
  const [houseForm, setHouseForm] = useState<HouseFormState>(initialHouseFormState);
  const [houseFormError, setHouseFormError] = useState<string | null>(null);
  const [submittingHouse, setSubmittingHouse] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyItem | null>(null);
  const [form, setForm] = useState<PropertyFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [transitionReason, setTransitionReason] = useState<string>('');
  const [transitionDetail, setTransitionDetail] = useState<string>('');
  const [soonType, setSoonType] = useState<'TENANT_EXPIRING' | 'UNDER_MAINTENANCE'>('TENANT_EXPIRING');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expiring lease reminder state
  const [showExpiringModal, setShowExpiringModal] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [dismissedExpiringIds, setDismissedExpiringIds] = useState<string[]>([]);

  const expiringProperties = useMemo(
    () =>
      getExpiringRentedProperties(properties).filter(
        (p) => !dismissedExpiringIds.includes(p.propertyId)
      ),
    [properties, dismissedExpiringIds]
  );

  // Handover & Inspection reminder state
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [completingHandoverId, setCompletingHandoverId] = useState<string | null>(null);
  const [completingAllHandover, setCompletingAllHandover] = useState(false);
  const [dismissedHandoverIds, setDismissedHandoverIds] = useState<string[]>([]);

  // Contract modal state
  const [contractProperty, setContractProperty] = useState<PropertyItem | null>(null);
  const [contractSettings, setContractSettings] = useState<ContractSystemSettings>({});
  const [latestMetersByPropId, setLatestMetersByPropId] = useState<
    Record<string, LatestMeterRecord>
  >({});

  const toContractProperty = (prop: PropertyItem): ContractPropertyInput => {
    const meters = latestMetersByPropId[prop.id];
    return {
      ...prop,
      initialElectricityIndex: meters?.electricityIndex ?? null,
      initialWaterIndex: meters?.waterIndex ?? null,
    };
  };

  const handoverProperties = useMemo(
    () =>
      getReadyForHandoverProperties(properties).filter(
        (p) => !dismissedHandoverIds.includes(p.propertyId)
      ),
    [properties, dismissedHandoverIds]
  );

  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    // Kiểm tra định dạng và dung lượng từng file
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    for (const file of fileList) {
      if (!validMimes.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
        setFormError(`File "${file.name}" không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setFormError(`Ảnh "${file.name}" vượt quá dung lượng 5MB. Vui lòng chọn ảnh nhỏ hơn.`);
        return;
      }
    }

    setUploadingImages(true);
    setFormError(null);

    try {
      const formData = new FormData();
      for (const file of fileList) {
        formData.append('files', file);
      }

      const res = await axiosClient.post<{ urls: string[] }>(
        '/properties/upload-images',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );

      const newUrls = res.data?.urls;
      if (Array.isArray(newUrls) && newUrls.length > 0) {
        setForm((prev) => ({
          ...prev,
          images: [...prev.images, ...newUrls],
        }));
      }
    } catch (err: unknown) {
      setFormError(extractErrorMessage(err, 'Lỗi khi tải ảnh lên máy chủ. Vui lòng thử lại.'));
    } finally {
      setUploadingImages(false);
    }
  };

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const [propRes, houseRes, settingsRes, billingRes] = await Promise.all([
        axiosClient.get<PaginatedPropertiesResponse>('/properties', {
          params: { limit: 100 },
        }),
        axiosClient.get<HouseItem[]>('/houses'),
        axiosClient.get<ContractSystemSettings>('/settings').catch(() => null),
        axiosClient
          .get<{ data?: BillingSummaryItem[] }>('/billings', {
            params: { limit: 100 },
          })
          .catch(() => null),
      ]);
      const list = propRes.data?.data;
      setProperties(Array.isArray(list) ? list : []);
      const houseList = houseRes.data;
      setHouses(Array.isArray(houseList) ? houseList : []);
      if (settingsRes?.data) {
        setContractSettings(settingsRes.data);
      }
      const billingList = Array.isArray(billingRes?.data?.data) ? billingRes.data.data : [];
      const sortedBillings = [...billingList].sort(
        (a, b) =>
          (Number(b.periodYear ?? 0) * 12 + Number(b.periodMonth ?? 0)) -
          (Number(a.periodYear ?? 0) * 12 + Number(a.periodMonth ?? 0)),
      );
      const meterMap: Record<string, LatestMeterRecord> = {};
      for (const bill of sortedBillings) {
        const propId = bill.property?.id;
        if (!propId || meterMap[propId]) {
          continue;
        }
        const elecIndex = bill.electricity?.newIndex;
        const waterIndex = bill.water?.newIndex;
        if (typeof elecIndex === 'number' && typeof waterIndex === 'number') {
          meterMap[propId] = {
            electricityIndex: elecIndex,
            waterIndex: waterIndex,
          };
        }
      }
      setLatestMetersByPropId(meterMap);
    } catch (err: unknown) {
      setBannerError(extractErrorMessage(err, 'Không thể tải danh sách nhà và phòng từ máy chủ.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProperties();
    const onSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<ContractSystemSettings>).detail;
      if (detail) setContractSettings(detail);
    };
    window.addEventListener('drland:settings-updated', onSettingsUpdated);
    return () => window.removeEventListener('drland:settings-updated', onSettingsUpdated);
  }, []);

  const handleSelectHouseFilter = (houseId: string) => {
    setSelectedHouseId(houseId);
    const nextParams = new URLSearchParams(searchParams);
    if (houseId === 'ALL') {
      nextParams.delete('houseId');
    } else {
      nextParams.set('houseId', houseId);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const openCreateHouseModal = () => {
    setEditingHouse(null);
    setHouseForm(initialHouseFormState);
    setHouseFormError(null);
    setIsHouseModalOpen(true);
  };

  const openEditHouseModal = (house: HouseItem) => {
    setEditingHouse(house);
    setHouseForm({
      code: house.code || '',
      name: house.name || '',
      address: house.address || '',
      defaultElectricityRate: String(house.defaultElectricityRate ?? 3800),
      defaultWaterRate: String(house.defaultWaterRate ?? 100000),
      defaultServiceFee: String(house.defaultServiceFee ?? 50000),
      description: house.description || '',
    });
    setHouseFormError(null);
    setIsHouseModalOpen(true);
  };

  const handleSubmitHouse = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setHouseFormError(null);
    setBannerError(null);
    setBannerSuccess(null);

    const payload = {
      code: houseForm.code.trim().toUpperCase(),
      name: houseForm.name.trim(),
      address: houseForm.address.trim(),
      defaultElectricityRate: Number(houseForm.defaultElectricityRate || '3800'),
      defaultWaterRate: Number(houseForm.defaultWaterRate || '100000'),
      defaultServiceFee: Number(houseForm.defaultServiceFee || '0'),
      description: houseForm.description.trim() || undefined,
    };

    setSubmittingHouse(true);
    try {
      if (editingHouse) {
        await axiosClient.patch(`/houses/${editingHouse.id}`, payload);
        setBannerSuccess(`Đã cập nhật thông tin tòa nhà "${payload.name}".`);
      } else {
        const res = await axiosClient.post<HouseItem>('/houses', payload);
        setBannerSuccess(`Đã thêm tòa nhà mới "${payload.name}" thành công.`);
        if (res.data?.id) {
          handleSelectHouseFilter(res.data.id);
        }
      }
      setIsHouseModalOpen(false);
      await fetchProperties();
    } catch (err: unknown) {
      setHouseFormError(
        extractErrorMessage(err, 'Không thể lưu thông tin tòa nhà. Vui lòng kiểm tra lại.'),
      );
    } finally {
      setSubmittingHouse(false);
    }
  };

  const handleDeleteHouse = async (house: HouseItem) => {
    setBannerError(null);
    setBannerSuccess(null);
    if (house.stats.totalProperties > 0) {
      setBannerError(
        `Không thể xóa "${house.name}" vì đang có ${house.stats.totalProperties} phòng trọ / mặt bằng trực thuộc.`,
      );
      return;
    }
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa tòa nhà "${house.name}" (${house.code}) không?`,
    );
    if (!confirmed) return;

    try {
      await axiosClient.delete(`/houses/${house.id}`);
      setBannerSuccess(`Đã xóa tòa nhà "${house.name}".`);
      if (selectedHouseId === house.id) {
        handleSelectHouseFilter('ALL');
      }
      await fetchProperties();
    } catch (err: unknown) {
      setBannerError(extractErrorMessage(err, 'Không thể xóa tòa nhà này.'));
    }
  };

  const closeModal = useCallback(() => {
    if (!submitting) {
      setIsModalOpen(false);
      setEditingProperty(null);
      setFormError(null);
    }
  }, [submitting]);

  // Lắng nghe phím Escape để đóng nhanh Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        setContractProperty(null);
        if (!submittingHouse) setIsHouseModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModal, submittingHouse]);

  // Danh sách lý do logic hóa dựa trên ngày tháng hợp đồng và ngữ cảnh khách
  const smartReasons = useMemo(() => {
    if (!editingProperty || editingProperty.status === 'AVAILABLE') return [];
    return generateSmartTransitionReasons(editingProperty);
  }, [editingProperty]);

  const applyHouseDefaultsToForm = (houseId: string, prev: PropertyFormState): PropertyFormState => {
    const targetHouse = houses.find((h) => h.id === houseId);
    if (!targetHouse) {
      return { ...prev, houseId };
    }
    return {
      ...prev,
      houseId,
      address: targetHouse.address,
      electricityRate: String(targetHouse.defaultElectricityRate),
      waterRate: String(targetHouse.defaultWaterRate),
      serviceFee: String(targetHouse.defaultServiceFee),
    };
  };

  const openCreateModal = (preselectedHouseId?: string) => {
    setEditingProperty(null);
    setIsChangingStatus(false);
    setTransitionReason('');
    setTransitionDetail('');
    setSoonType('TENANT_EXPIRING');
    const targetHouseId =
      preselectedHouseId ||
      (selectedHouseId !== 'ALL' ? selectedHouseId : houses[0]?.id || '');
    const targetHouse = houses.find((h) => h.id === targetHouseId);
    setForm({
      ...initialFormState,
      houseId: targetHouse ? targetHouse.id : '',
      address: targetHouse ? targetHouse.address : initialFormState.address,
      electricityRate: targetHouse
        ? String(targetHouse.defaultElectricityRate)
        : initialFormState.electricityRate,
      waterRate: targetHouse
        ? String(targetHouse.defaultWaterRate)
        : initialFormState.waterRate,
      serviceFee: targetHouse
        ? String(targetHouse.defaultServiceFee)
        : initialFormState.serviceFee,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: PropertyItem) => {
    setEditingProperty(item);
    setIsChangingStatus(false);
    setTransitionReason('');
    setTransitionDetail('');
    if (item.status === 'SOON_TO_BE_AVAILABLE') {
      setSoonType(item.tenantName ? 'TENANT_EXPIRING' : 'UNDER_MAINTENANCE');
    } else {
      setSoonType('TENANT_EXPIRING');
    }
    setForm({
      houseId: item.houseId || item.house?.id || '',
      code: item.code || '',
      name: item.name || '',
      type: item.type || 'ROOM',
      address: item.address || item.house?.address || '',
      area: item.area != null ? String(item.area) : '25',
      monthlyRent: item.monthlyRent != null ? String(item.monthlyRent) : '4200000',
      deposit: item.deposit != null ? String(item.deposit) : '',
      electricityRate: item.electricityRate != null ? String(item.electricityRate) : '3500',
      waterRate: item.waterRate != null ? String(item.waterRate) : '15000',
      serviceFee: item.serviceFee != null ? String(item.serviceFee) : '0',
      status: item.status || 'AVAILABLE',
      availableFrom: item.availableFrom || '',
      description: item.description || '',
      images: Array.isArray(item.images) ? [...item.images] : [],
      newImageUrl: '',
      tenantName: item.tenantName || '',
      tenantPhone: item.tenantPhone || '',
      tenantCitizenId: item.tenantCitizenId || '',
      leaseStartDate: item.leaseStartDate || '',
      leaseEndDate: item.leaseEndDate || '',
      depositPaid: item.depositPaid != null ? String(item.depositPaid) : '',
      tenantCount: item.tenantCount != null ? String(item.tenantCount) : '1',
      vehicleCount: item.vehicleCount != null ? String(item.vehicleCount) : '0',
      rentalNotes: item.rentalNotes || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleApproveSoonToBeAvailable = async (item: ExpiringLeaseInfo) => {
    const fullProp = properties.find((p) => p.id === item.propertyId);
    if (!fullProp) return;

    setApprovingId(item.propertyId);
    try {
      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const diffText = item.isOverdue
        ? `Đã quá hạn ${Math.abs(item.diffDays)} ngày`
        : `Còn ${item.diffDays} ngày nữa`;
      const auditLog = `[${timeStr}] Duyệt đề xuất chuyển Sắp trống trước hạn HĐ (${diffText}, Hạn HĐ: ${formatDateDisplay(item.leaseEndDate)}) | Khách: ${item.tenantName || 'N/A'}`;
      const finalNotes = fullProp.rentalNotes
        ? `${auditLog}\n${fullProp.rentalNotes}`
        : auditLog;

      await axiosClient.patch(`/properties/${item.propertyId}`, {
        status: 'SOON_TO_BE_AVAILABLE',
        availableFrom: item.leaseEndDate,
        rentalNotes: finalNotes,
      });

      setBannerSuccess(
        `Đã duyệt chuyển phòng "${item.code}" sang Sắp trống (Dự kiến trống: ${formatDateDisplay(item.leaseEndDate)}).`
      );
      await fetchProperties();
    } catch (err: unknown) {
      setBannerError(
        extractErrorMessage(
          err,
          `Không thể duyệt chuyển phòng "${item.code}" sang Sắp trống.`
        )
      );
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveAllExpiring = async () => {
    if (expiringProperties.length === 0) return;
    setApprovingAll(true);
    let successCount = 0;
    const errors: string[] = [];

    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const item of expiringProperties) {
      const fullProp = properties.find((p) => p.id === item.propertyId);
      if (!fullProp) continue;

      try {
        const diffText = item.isOverdue
          ? `Đã quá hạn ${Math.abs(item.diffDays)} ngày`
          : `Còn ${item.diffDays} ngày nữa`;
        const auditLog = `[${timeStr}] Duyệt đề xuất hàng loạt chuyển Sắp trống trước hạn HĐ (${diffText}, Hạn HĐ: ${formatDateDisplay(item.leaseEndDate)}) | Khách: ${item.tenantName || 'N/A'}`;
        const finalNotes = fullProp.rentalNotes
          ? `${auditLog}\n${fullProp.rentalNotes}`
          : auditLog;

        await axiosClient.patch(`/properties/${item.propertyId}`, {
          status: 'SOON_TO_BE_AVAILABLE',
          availableFrom: item.leaseEndDate,
          rentalNotes: finalNotes,
        });
        successCount++;
      } catch (err: unknown) {
        errors.push(
          `${item.code}: ${extractErrorMessage(err, 'Lỗi không xác định')}`
        );
      }
    }

    setApprovingAll(false);
    if (successCount > 0) {
      setBannerSuccess(
        `Đã duyệt chuyển thành công ${successCount} phòng sang trạng thái Sắp trống.`
      );
      await fetchProperties();
    }
    if (errors.length > 0) {
      setBannerError(`Có lỗi ở một số phòng: ${errors.join(', ')}`);
    } else {
      setShowExpiringModal(false);
    }
  };

  const handleExtendLeaseFromModal = (item: ExpiringLeaseInfo) => {
    const fullProp = properties.find((p) => p.id === item.propertyId);
    if (!fullProp) return;
    setShowExpiringModal(false);
    openEditModal(fullProp);
  };

  const handleDismissHandover = (propertyId: string) => {
    setDismissedHandoverIds((prev) => [...prev, propertyId]);
  };

  const handleExtendLeaseFromHandoverModal = (item: HandoverPropertyInfo) => {
    const fullProp = properties.find((p) => p.id === item.propertyId);
    if (!fullProp) return;
    setShowHandoverModal(false);
    openEditModal(fullProp);
  };

  const handleCompleteHandover = async (item: HandoverPropertyInfo) => {
    const fullProp = properties.find((p) => p.id === item.propertyId);
    if (!fullProp) return;

    setCompletingHandoverId(item.propertyId);
    try {
      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const depositStr = item.depositPaid ? formatVND(item.depositPaid) : '0 ₫';
      const tenantInfo = item.tenantName ? `Khách: ${item.tenantName} (${item.tenantPhone || 'N/A'})` : 'Bảo trì/Sửa chữa';
      const auditLog = `[${timeStr}] Nghiệm thu bàn giao phòng hoàn tất & Đối soát hoàn cọc (${tenantInfo} | Cọc: ${depositStr}). Đã chuyển về Đang trống.`;
      const finalNotes = fullProp.rentalNotes
        ? `${auditLog}\n${fullProp.rentalNotes}`
        : auditLog;

      await axiosClient.patch(`/properties/${item.propertyId}`, {
        status: 'AVAILABLE',
        availableFrom: null,
        tenantName: null,
        tenantPhone: null,
        tenantCitizenId: null,
        depositPaid: null,
        leaseStartDate: null,
        leaseEndDate: null,
        rentalNotes: finalNotes,
      });

      setBannerSuccess(
        `Đã hoàn tất nghiệm thu bàn giao phòng "${item.code}" và chuyển sang Đang trống.`
      );
      await fetchProperties();
    } catch (err: unknown) {
      setBannerError(
        extractErrorMessage(
          err,
          `Không thể nghiệm thu bàn giao phòng "${item.code}".`
        )
      );
    } finally {
      setCompletingHandoverId(null);
    }
  };

  const handleCompleteAllHandover = async () => {
    if (handoverProperties.length === 0) return;
    setCompletingAllHandover(true);
    let successCount = 0;
    const errors: string[] = [];

    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const item of handoverProperties) {
      const fullProp = properties.find((p) => p.id === item.propertyId);
      if (!fullProp) continue;

      try {
        const depositStr = item.depositPaid ? formatVND(item.depositPaid) : '0 ₫';
        const tenantInfo = item.tenantName ? `Khách: ${item.tenantName} (${item.tenantPhone || 'N/A'})` : 'Bảo trì/Sửa chữa';
        const auditLog = `[${timeStr}] Nghiệm thu bàn giao phòng hoàn tất & Đối soát hoàn cọc (${tenantInfo} | Cọc: ${depositStr}). Đã chuyển về Đang trống.`;
        const finalNotes = fullProp.rentalNotes
          ? `${auditLog}\n${fullProp.rentalNotes}`
          : auditLog;

        await axiosClient.patch(`/properties/${item.propertyId}`, {
          status: 'AVAILABLE',
          availableFrom: null,
          tenantName: null,
          tenantPhone: null,
          tenantCitizenId: null,
          depositPaid: null,
          leaseStartDate: null,
          leaseEndDate: null,
          rentalNotes: finalNotes,
        });
        successCount++;
      } catch (err: unknown) {
        errors.push(`${item.code}: ${extractErrorMessage(err, 'Lỗi không xác định')}`);
      }
    }

    setCompletingAllHandover(false);
    if (successCount > 0) {
      setBannerSuccess(`Đã hoàn tất nghiệm thu bàn giao cho ${successCount} phòng sang Đang trống.`);
    }
    if (errors.length > 0) {
      setBannerError(`Có lỗi khi nghiệm thu một số phòng:\n${errors.join('\n')}`);
    } else {
      setShowHandoverModal(false);
    }
    await fetchProperties();
  };

  const handleAddImage = (urlToAdd?: string) => {
    const targetUrl = (urlToAdd || form.newImageUrl).trim();
    if (!targetUrl) return;
    if (!/^https?:\/\//i.test(targetUrl)) {
      setFormError('Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://');
      return;
    }
    if (form.images.includes(targetUrl)) {
      setFormError('Ảnh này đã có trong danh sách.');
      return;
    }
    setForm({
      ...form,
      images: [...form.images, targetUrl],
      newImageUrl: '',
    });
    setFormError(null);
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setForm({
      ...form,
      images: form.images.filter((_, idx) => idx !== indexToRemove),
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setBannerError(null);
    setBannerSuccess(null);

    // Cơ chế an toàn: CHỈ áp dụng khi sửa phòng và trạng thái hiện tại khác AVAILABLE
    if (editingProperty && editingProperty.status !== 'AVAILABLE' && isChangingStatus) {
      if (!transitionReason.trim()) {
        setFormError('Vui lòng chọn lý do thay đổi trạng thái phòng ở Bước 1.');
        return;
      }
      if (
        transitionReason.toLowerCase().includes('khác') &&
        !transitionDetail.trim()
      ) {
        setFormError('Vui lòng nhập chi tiết lý do khi chọn mục "Lý do khác".');
        return;
      }
    }

    // Kiểm tra tính hợp lệ khi đặt trạng thái Sắp trống
    if (form.status === 'SOON_TO_BE_AVAILABLE' && !form.availableFrom) {
      setFormError('Vui lòng chọn ngày dự kiến phòng trống (Trống từ ngày) để khách thuê mới biết lịch hẹn.');
      return;
    }

    // Tự động ghi vết nhật ký chuyển đổi trạng thái vào rentalNotes để lưu lịch sử
    let finalRentalNotes: string | null = form.rentalNotes.trim() || null;
    if (editingProperty && form.status !== editingProperty.status) {
      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const fromLabel = STATUS_BADGE[editingProperty.status]?.label || editingProperty.status;
      const toLabel = STATUS_BADGE[form.status]?.label || form.status;
      const reasonLabel = transitionReason.trim() || 'Chuyển đổi từ phòng đang trống';
      const detailStr = transitionDetail.trim() ? ` - Chi tiết: ${transitionDetail.trim()}` : '';
      const auditLog = `[${timeStr}] Đổi trạng thái: ${fromLabel} ➔ ${toLabel} | Lý do: ${reasonLabel}${detailStr}`;

      if (form.rentalNotes.trim()) {
        finalRentalNotes = `${auditLog}\n${form.rentalNotes.trim()}`;
      } else {
        finalRentalNotes = auditLog;
      }
    }

    const isAvailableOrMaintenance =
      form.status === 'AVAILABLE' ||
      (form.status === 'SOON_TO_BE_AVAILABLE' && soonType === 'UNDER_MAINTENANCE');

    const clearOrOmit = editingProperty ? null : undefined;

    const payload = {
      houseId: form.houseId || clearOrOmit,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim(),
      area: Number(form.area),
      monthlyRent: Number(form.monthlyRent),
      deposit: form.deposit ? Number(form.deposit) : clearOrOmit,
      electricityRate: Number(form.electricityRate),
      waterRate: Number(form.waterRate),
      serviceFee: Number(form.serviceFee || '0'),
      status: form.status,
      availableFrom:
        form.status === 'SOON_TO_BE_AVAILABLE' && form.availableFrom
          ? form.availableFrom
          : clearOrOmit,
      description: form.description.trim() || undefined,
      images: form.images,
      tenantName: isAvailableOrMaintenance ? clearOrOmit : (form.tenantName.trim() || clearOrOmit),
      tenantPhone: isAvailableOrMaintenance ? clearOrOmit : (form.tenantPhone.trim() || clearOrOmit),
      tenantCitizenId: isAvailableOrMaintenance ? clearOrOmit : (form.tenantCitizenId.trim() || clearOrOmit),
      leaseStartDate: isAvailableOrMaintenance ? clearOrOmit : (form.leaseStartDate || clearOrOmit),
      leaseEndDate: isAvailableOrMaintenance ? clearOrOmit : (form.leaseEndDate || clearOrOmit),
      depositPaid: isAvailableOrMaintenance ? clearOrOmit : (form.depositPaid ? Number(form.depositPaid) : clearOrOmit),
      tenantCount: isAvailableOrMaintenance ? 1 : (form.tenantCount ? Number(form.tenantCount) : 1),
      vehicleCount: isAvailableOrMaintenance ? 0 : (form.vehicleCount ? Number(form.vehicleCount) : 0),
      rentalNotes: finalRentalNotes ?? clearOrOmit,
    };

    setSubmitting(true);
    try {
      if (editingProperty) {
        await axiosClient.patch(`/properties/${editingProperty.id}`, payload);
        if (form.status !== editingProperty.status) {
          setBannerSuccess(`Đã cập nhật phòng "${payload.code}" và ghi nhận lý do đổi trạng thái sang "${STATUS_BADGE[form.status].label}".`);
        } else {
          setBannerSuccess(`Đã cập nhật thành công thông tin phòng "${payload.code}".`);
        }
      } else {
        await axiosClient.post('/properties', payload);
        setBannerSuccess(`Đã tạo mới phòng "${payload.code}" thành công.`);
      }
      setIsModalOpen(false);
      await fetchProperties();
    } catch (err: unknown) {
      setFormError(extractErrorMessage(err, 'Không thể lưu thông tin phòng. Vui lòng kiểm tra lại.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: PropertyItem) => {
    setBannerError(null);
    setBannerSuccess(null);

    // Ràng buộc nghiệp vụ: Chỉ cho phép xóa phòng đang trống (AVAILABLE)
    if (item.status !== 'AVAILABLE') {
      const statusLabel = STATUS_BADGE[item.status]?.label || item.status;
      setBannerError(
        `Không thể xóa phòng "${item.code}" vì phòng đang ở trạng thái "${statusLabel}". Chỉ những phòng đang trống (AVAILABLE) mới được phép xóa.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `CẢNH BÁO: Bạn có chắc chắn muốn xóa phòng "${item.code}" (${item.name}) không?`,
    );
    if (!confirmed) return;

    try {
      await axiosClient.delete(`/properties/${item.id}`);
      setBannerSuccess(`Đã xóa phòng "${item.code}" thành công.`);
      await fetchProperties();
    } catch (err: unknown) {
      setBannerError(extractErrorMessage(err, 'Không thể xóa phòng do có ràng buộc dữ liệu.'));
    }
  };

  const propertiesInSelectedHouse = useMemo(() => {
    if (selectedHouseId === 'ALL') return properties;
    return properties.filter(
      (p) => (p.houseId || p.house?.id) === selectedHouseId,
    );
  }, [properties, selectedHouseId]);

  const filteredProperties = useMemo(() => {
    return propertiesInSelectedHouse.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = (p.code || '').toLowerCase().includes(q);
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchAddr = (p.address || '').toLowerCase().includes(q);
        const matchHouse = (p.house?.name || '').toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchAddr && !matchHouse) return false;
      }
      return true;
    });
  }, [propertiesInSelectedHouse, statusFilter, typeFilter, searchQuery]);

  const selectedHouseObj = useMemo(
    () => houses.find((h) => h.id === selectedHouseId) || null,
    [houses, selectedHouseId],
  );

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-stone-900">
            Quản Lý Tòa Nhà &amp; Phòng Thuê
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Quản lý danh sách tòa nhà, phòng trọ và mặt bằng cho thuê, cập nhật đơn giá và trạng thái đón khách.
          </p>
        </div>

        <div className="flex items-center sm:justify-end gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => void fetchProperties()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-700 shrink-0 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={openCreateHouseModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-700 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Thêm tòa nhà</span>
          </button>

          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm phòng / mặt bằng</span>
          </button>
        </div>
      </div>

      {/* Khu vực Quản lý theo Tòa nhà / Cơ sở */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-700" />
            <h2 className="text-xs font-bold text-stone-700">
              Danh sách Tòa nhà / Cơ sở ({houses.length})
            </h2>
          </div>
          {selectedHouseObj && (
            <button
              type="button"
              onClick={() => handleSelectHouseFilter('ALL')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer whitespace-nowrap"
            >
              Xem tất cả tòa nhà
            </button>
          )}
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 ${houses.length >= 3 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'} gap-3.5`}>
          {/* Card Tất cả cơ sở */}
          <div
            onClick={() => handleSelectHouseFilter('ALL')}
            className={`rounded-xl border p-4 cursor-pointer transition-colors flex flex-col justify-between ${
              selectedHouseId === 'ALL'
                ? 'bg-emerald-50/60 border-emerald-700 ring-1 ring-emerald-700 text-stone-900'
                : 'bg-white border-stone-200 hover:border-emerald-300 text-stone-900'
            }`}
          >
            <div>
              <div className="text-[11px] font-medium text-stone-500">
                Tổng hợp toàn hệ thống
              </div>
              <div className={`text-base font-bold mt-0.5 ${selectedHouseId === 'ALL' ? 'text-emerald-900' : 'text-stone-900'}`}>
                Tất cả các tòa nhà ({houses.length})
              </div>
              <p className="text-xs text-stone-500 mt-1 truncate">
                Toàn bộ cơ sở lưu trú &amp; mặt bằng tại TP.HCM
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between text-xs tabular-nums text-stone-600 whitespace-nowrap">
              <span>
                {properties.filter((p) => p.type === 'ROOM').length} phòng, {properties.filter((p) => p.type === 'COMMERCIAL_SPACE').length} mặt bằng
              </span>
              <span className="font-bold text-emerald-800">
                {properties.filter((p) => p.status === 'RENTED' || p.status === 'DEPOSITED').length}/{properties.length} thuê
              </span>
            </div>
          </div>

          {/* Các Card Tòa nhà */}
          {houses.map((house) => {
            const isSelected = selectedHouseId === house.id;
            const houseProps = properties.filter((p) => (p.houseId || p.house?.id) === house.id);
            const roomTotal = houseProps.filter((p) => p.type === 'ROOM').length;
            const commercialTotal = houseProps.filter((p) => p.type === 'COMMERCIAL_SPACE').length;
            const rentedTotal = houseProps.filter((p) => p.status === 'RENTED' || p.status === 'DEPOSITED').length;

            return (
              <div
                key={house.id}
                onClick={() => handleSelectHouseFilter(house.id)}
                className={`rounded-xl border p-4 cursor-pointer transition-colors flex flex-col justify-between ${
                  isSelected
                    ? 'bg-emerald-50/50 border-emerald-700 ring-1 ring-emerald-700'
                    : 'bg-white border-stone-200 hover:border-emerald-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className={`font-mono text-[11px] font-semibold ${isSelected ? 'text-emerald-800' : 'text-stone-500'}`}>
                        {house.code}
                      </span>
                      <h3 className="text-sm font-bold text-stone-900 mt-0.5 truncate">
                        {house.name}
                      </h3>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => openEditHouseModal(house)}
                        title="Sửa thông tin tòa nhà"
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteHouse(house)}
                        title="Xóa tòa nhà"
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-stone-500 mt-1 flex items-center gap-1 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{house.address}</span>
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1.5 tabular-nums">
                    Điện {new Intl.NumberFormat('vi-VN').format(house.defaultElectricityRate)}đ/kWh, Nước {new Intl.NumberFormat('vi-VN').format(house.defaultWaterRate)}đ/m³
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-stone-200 flex items-center justify-between gap-2 text-xs">
                  <div className="text-stone-600 tabular-nums whitespace-nowrap">
                    <span className="font-semibold text-stone-900">{roomTotal}</span> phòng
                    {commercialTotal > 0 && (
                      <>
                        {', '}
                        <span className="font-semibold text-amber-800">{commercialTotal}</span> MB
                      </>
                    )}
                    <span className="text-stone-300 mx-1.5">|</span>
                    <span className="font-semibold text-emerald-800">
                      {rentedTotal}/{houseProps.length} thuê
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreateModal(house.id);
                    }}
                    title={`Thêm phòng hoặc mặt bằng vào ${house.name}`}
                    className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-white border border-stone-200 hover:border-emerald-400 px-2 py-0.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Banner cảnh báo phòng sắp hết hạn hợp đồng */}
      {expiringProperties.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl bg-amber-50/70 border border-amber-200 border-l-4 border-l-amber-600 p-4 text-xs sm:text-sm">
          <div>
            <div className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2 flex-wrap">
              <BellRing className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Đề xuất duyệt trạng thái hợp đồng sắp đến hạn</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 tabular-nums">
                {expiringProperties.length} phòng cần xử lý
              </span>
            </div>
            <p className="text-stone-700 text-xs sm:text-sm mt-1">
              Có <strong>{expiringProperties.length} phòng đang cho thuê</strong> sắp kết thúc hợp đồng trong vòng 30 ngày (hoặc đã quá hạn). Bạn có thể duyệt chuyển sang &ldquo;Sắp trống&rdquo; để đón khách mới tìm kiếm hoặc gia hạn hợp đồng.
            </p>
          </div>
          <button
            type="button"
            id="btn-open-expiring-modal"
            onClick={() => setShowExpiringModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs sm:text-sm transition-colors shrink-0 cursor-pointer whitespace-nowrap"
          >
            <span>Duyệt đề xuất</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Banner đề xuất nghiệm thu & bàn giao phòng */}
      {handoverProperties.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl bg-stone-50 border border-stone-200 border-l-4 border-l-emerald-700 p-4 text-xs sm:text-sm">
          <div>
            <div className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2 flex-wrap">
              <ClipboardCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Đề xuất nghiệm thu bàn giao phòng &amp; đối soát cọc</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                {handoverProperties.length} phòng đến ngày trống
              </span>
            </div>
            <p className="text-stone-600 text-xs sm:text-sm mt-1">
              Có <strong>{handoverProperties.length} phòng &ldquo;Sắp trống&rdquo;</strong> đã đến hoặc qua ngày dự kiến bàn giao. Bạn có thể nghiệm thu đối soát hoàn cọc cho khách cũ và chuyển trạng thái về &ldquo;Đang trống&rdquo; để đón khách mới.
            </p>
          </div>
          <button
            type="button"
            id="btn-open-handover-modal"
            onClick={() => setShowHandoverModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs sm:text-sm transition-colors shrink-0 cursor-pointer whitespace-nowrap"
          >
            <span>Nghiệm thu phòng</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Thông báo lỗi / thành công */}
      {bannerError && (
        <div className="flex items-start justify-between gap-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-800">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <span>{bannerSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerSuccess(null)}
            className="text-emerald-500 hover:text-emerald-700 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bộ lọc & Ô Tìm kiếm */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Tabs Trạng thái */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              statusFilter === 'ALL'
                ? 'bg-emerald-700 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Tất cả ({propertiesInSelectedHouse.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('AVAILABLE')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              statusFilter === 'AVAILABLE'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Đang trống ({propertiesInSelectedHouse.filter((p) => p.status === 'AVAILABLE').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SOON_TO_BE_AVAILABLE')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              statusFilter === 'SOON_TO_BE_AVAILABLE'
                ? 'bg-amber-700 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Sắp trống ({propertiesInSelectedHouse.filter((p) => p.status === 'SOON_TO_BE_AVAILABLE').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('DEPOSITED')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              statusFilter === 'DEPOSITED'
                ? 'bg-blue-700 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            Đã cọc ({propertiesInSelectedHouse.filter((p) => p.status === 'DEPOSITED').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('RENTED')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 ${
              statusFilter === 'RENTED'
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Đang thuê ({propertiesInSelectedHouse.filter((p) => p.status === 'RENTED').length})
          </button>
        </div>

        {/* Bộ lọc Loại hình & Ô Tìm kiếm */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PropertyType | 'ALL')}
            className="px-3 py-2 text-xs bg-stone-50 focus:bg-white text-stone-800 font-semibold rounded-xl border border-stone-200 focus:border-emerald-600 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Mọi loại hình</option>
            <option value="ROOM">Phòng trọ</option>
            <option value="COMMERCIAL_SPACE">Mặt bằng</option>
          </select>

          <div className="relative flex-1 lg:w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã phòng, tên, địa chỉ…"
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 focus:bg-white text-stone-900 rounded-xl border border-stone-200 focus:border-emerald-600 focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Bảng danh sách phòng */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-700">
                <th className="py-4 px-4 whitespace-nowrap">Ảnh &amp; Mã phòng</th>
                <th className="py-4 px-4 whitespace-nowrap">Tên phòng &amp; Địa chỉ</th>
                <th className="py-4 px-4 whitespace-nowrap">Loại hình</th>
                <th className="py-4 px-4 whitespace-nowrap">Diện tích</th>
                <th className="py-4 px-4 whitespace-nowrap">Giá thuê / Điện nước</th>
                <th className="py-4 px-4 whitespace-nowrap">Trạng thái</th>
                <th className="py-4 px-4 text-right whitespace-nowrap">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    Đang tải danh sách phòng…
                  </td>
                </tr>
              ) : filteredProperties.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    Không tìm thấy phòng nào phù hợp. Hãy bấm &ldquo;Thêm phòng mới&rdquo;.
                  </td>
                </tr>
              ) : (
                filteredProperties.map((item) => {
                  if (!item || !item.id) return null;
                  const status = item.status || 'AVAILABLE';
                  const badge = STATUS_BADGE[status] ?? {
                    label: String(status),
                    className: 'bg-stone-100 text-stone-700 border-stone-200',
                  };
                  const firstImg = item.images && item.images.length > 0 ? item.images[0] : null;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-stone-50/80 transition-colors"
                    >
                      {/* Ảnh & Mã */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {firstImg ? (
                            <img
                              src={firstImg}
                              alt={item.code}
                              className="w-14 h-12 rounded-xl object-cover border border-stone-200 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-12 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                              <HomeIcon className="w-5 h-5 text-emerald-700" />
                            </div>
                          )}
                          <div>
                            <div className="font-extrabold text-base text-emerald-800">{item.code || 'N/A'}</div>
                            <div className="text-[11px] text-stone-400">
                              {item.images?.length ? `${item.images.length} ảnh thực tế` : 'Chưa có ảnh'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Tên & Địa chỉ */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-stone-900">
                          {item.name || 'Không có tên'}
                        </div>
                        {item.house && (
                          <div className="text-xs font-medium text-emerald-800 mt-0.5">
                            {item.house.name}
                          </div>
                        )}
                        <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                          {item.address || 'Chưa cập nhật địa chỉ'}
                        </div>

                        {/* Tóm tắt Khách thuê / Khách cọc / Khách sắp dọn đi */}
                        {item.status === 'RENTED' && (
                          <div className="mt-2 pl-2.5 border-l-2 border-emerald-600 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                            {item.tenantName ? (
                              <span className="text-stone-800 font-medium">
                                Khách thuê: <span className="font-semibold text-stone-900">{item.tenantName}</span>
                                {item.tenantPhone && (
                                  <a
                                    href={`tel:${item.tenantPhone}`}
                                    className="text-emerald-700 hover:underline font-mono text-[11px] ml-1.5"
                                    title="Bấm để gọi"
                                  >
                                    {item.tenantPhone}
                                  </a>
                                )}
                              </span>
                            ) : (
                              <span className="text-amber-800 font-medium">
                                Đang thuê (Chưa nhập tên khách)
                              </span>
                            )}
                            {item.leaseEndDate && (
                              <span className="text-[11px] text-stone-500 tabular-nums">
                                Hạn HĐ: {formatDateDisplay(item.leaseEndDate)}
                              </span>
                            )}
                          </div>
                        )}

                        {item.status === 'DEPOSITED' && (
                          <div className="mt-2 pl-2.5 border-l-2 border-stone-500 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                            {item.tenantName ? (
                              <span className="text-stone-800 font-medium">
                                Đã cọc: <span className="font-semibold text-stone-900">{item.tenantName}</span>
                                {item.tenantPhone && (
                                  <a
                                    href={`tel:${item.tenantPhone}`}
                                    className="text-emerald-700 hover:underline font-mono text-[11px] ml-1.5"
                                    title="Bấm để gọi"
                                  >
                                    {item.tenantPhone}
                                  </a>
                                )}
                              </span>
                            ) : (
                              <span className="text-stone-700 font-medium">
                                Đã cọc (Chưa nhập tên khách)
                              </span>
                            )}
                            {item.depositPaid && (
                              <span className="text-[11px] text-stone-700 font-semibold tabular-nums">
                                Tiền cọc: {new Intl.NumberFormat('vi-VN').format(item.depositPaid)}đ
                              </span>
                            )}
                          </div>
                        )}

                        {item.status === 'SOON_TO_BE_AVAILABLE' && (
                          <div className="mt-2 pl-2.5 border-l-2 border-amber-500 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                            {item.tenantName ? (
                              <span className="text-stone-800 font-medium">
                                Khách đang ở: <span className="font-semibold text-stone-900">{item.tenantName}</span>
                                {item.tenantPhone && (
                                  <a
                                    href={`tel:${item.tenantPhone}`}
                                    className="text-emerald-700 hover:underline font-mono text-[11px] ml-1.5"
                                    title="Bấm để gọi"
                                  >
                                    {item.tenantPhone}
                                  </a>
                                )}
                                {item.leaseEndDate && (
                                  <span className="text-[11px] text-amber-800 ml-1.5 tabular-nums">
                                    Hạn HĐ: {formatDateDisplay(item.leaseEndDate)}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-stone-600 font-medium">
                                Phòng đang sửa chữa / bảo trì
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Loại hình */}
                      <td className="py-4 px-4 text-stone-700 whitespace-nowrap">
                        {item.type === 'COMMERCIAL_SPACE' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold">
                            <Store className="w-3.5 h-3.5 text-amber-700" />
                            <span>{TYPE_LABEL[item.type]}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 border border-stone-200 text-xs font-semibold">
                            <HomeIcon className="w-3.5 h-3.5 text-stone-500" />
                            <span>{TYPE_LABEL[item.type] || item.type}</span>
                          </span>
                        )}
                      </td>

                      {/* Diện tích */}
                      <td className="py-4 px-4 font-bold text-stone-900 whitespace-nowrap">
                        {item.area ?? 0} m²
                      </td>

                      {/* Giá thuê */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-extrabold text-stone-900 text-base">
                          {formatVND(item.monthlyRent)}
                          <span className="text-xs font-normal text-stone-400"> / thg</span>
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          Điện: {new Intl.NumberFormat('vi-VN').format(item.electricityRate)}đ • Nước: {new Intl.NumberFormat('vi-VN').format(item.waterRate)}đ
                        </div>
                      </td>

                      {/* Trạng thái phòng (chỉ sửa trong mục Chỉnh sửa) */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center text-xs font-bold rounded-lg px-2.5 py-1 border shadow-2xs ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {item.status === 'SOON_TO_BE_AVAILABLE' && item.availableFrom && (
                          <div className="text-[11px] text-amber-700 font-medium mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Trống từ: {formatDateDisplay(item.availableFrom)}</span>
                          </div>
                        )}
                      </td>

                      {/* Nút hành động */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {item.status !== 'AVAILABLE' && Boolean(item.tenantName?.trim()) && (
                            <button
                              type="button"
                              onClick={() => setContractProperty(item)}
                              title="Xem & in hợp đồng thuê"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>Hợp đồng</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            title="Chỉnh sửa thông tin phòng"
                            className="p-2 rounded-xl text-stone-600 hover:text-emerald-800 hover:bg-emerald-50 border border-stone-200 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            disabled={item.status !== 'AVAILABLE'}
                            title={
                              item.status === 'AVAILABLE'
                                ? 'Xóa phòng trống'
                                : `Không thể xóa: Phòng đang ở trạng thái "${STATUS_BADGE[item.status]?.label || item.status}"`
                            }
                            className={`p-2 rounded-xl border border-stone-200 transition-colors ${
                              item.status === 'AVAILABLE'
                                ? 'text-stone-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                                : 'text-stone-300 bg-stone-50/60 cursor-not-allowed opacity-40'
                            }`}
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

      {/* Modal Thêm / Sửa Phòng */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {editingProperty
                    ? `Chỉnh sửa thông tin: Phòng ${editingProperty.code}`
                    : 'Thêm Phòng / Mặt Bằng Mới'}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {houses.find((h) => h.id === form.houseId)?.name || 'Hệ thống quản lý nhà trọ DRLAND'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-95 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {formError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* MỤC HÌNH ẢNH THỰC TẾ CỦA PHÒNG */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-stone-900">
                      Hình ảnh thực tế ({form.images.length} ảnh)
                    </label>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Khách thuê xem ảnh thực tế trực tiếp trên website
                    </p>
                  </div>
                  {form.images.length > 0 && (
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 tabular-nums">
                      {form.images.length} ảnh đã chọn
                    </span>
                  )}
                </div>

                {/* VÙNG KÉO THẢ TẢI ẢNH TỪ MÁY TÍNH */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.length) {
                      void handleUploadFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors duration-150 cursor-pointer ${
                    isDragging
                      ? 'border-emerald-600 bg-emerald-50/80 scale-[1.01]'
                      : 'border-stone-300 hover:border-emerald-500 bg-stone-50/60 hover:bg-stone-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        void handleUploadFiles(e.target.files);
                      }
                      e.target.value = '';
                    }}
                  />

                  {uploadingImages ? (
                    <div className="flex flex-col items-center justify-center py-2 text-emerald-800">
                      <Loader2 className="w-7 h-7 animate-spin mb-2 text-emerald-700" />
                      <span className="text-xs font-bold">Đang tải ảnh lên máy chủ…</span>
                      <span className="text-[11px] text-stone-500 mt-0.5">Vui lòng chờ trong giây lát</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-1">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2 shadow-2xs">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-stone-800">
                        Kéo & thả ảnh phòng vào đây, hoặc <span className="text-emerald-700 underline font-semibold">Bấm để chọn file từ máy</span>
                      </p>
                      <p className="text-[11px] text-stone-400 mt-1">
                        Hỗ trợ file JPG, PNG, WEBP tối đa 5MB/ảnh • Có thể chọn nhiều ảnh cùng lúc
                      </p>
                    </div>
                  )}
                </div>

                {/* DANH SÁCH ẢNH XEM TRƯỚC (PREVIEW GRID) */}
                {form.images.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-stone-500 font-medium">
                      Ảnh đầu tiên sẽ là ảnh đại diện của phòng hiển thị ngoài trang chủ:
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                      {form.images.map((imgUrl, idx) => (
                        <div
                          key={`${imgUrl}-${idx}`}
                          className="relative group rounded-xl overflow-hidden border border-stone-200 h-24 bg-stone-100 shadow-2xs"
                        >
                          <img
                            src={imgUrl}
                            alt={`Phòng preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback nếu ảnh lỗi
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80';
                            }}
                          />
                          {idx === 0 && (
                            <span className="absolute bottom-1.5 left-1.5 bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                              Ảnh đại diện
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(idx);
                            }}
                            title="Xóa ảnh này"
                            className="absolute top-1.5 right-1.5 p-1 bg-rose-600/90 hover:bg-rose-700 active:scale-95 text-white rounded-full transition-colors shadow-sm cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TÙY CHỌN PHỤ: DÁN LINK NGOÀI */}
                <div className="pt-2 border-t border-stone-200/80">
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="inline-flex items-center gap-1.5 text-xs text-stone-600 hover:text-emerald-700 font-semibold cursor-pointer transition-colors"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>{showUrlInput ? 'Thu gọn ô dán link ảnh' : '+ Dán đường dẫn ảnh (URL)'}</span>
                  </button>

                  {showUrlInput && (
                    <div className="space-y-2 mt-2 pt-1">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <ImageIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="url"
                            value={form.newImageUrl}
                            onChange={(e) => setForm({ ...form, newImageUrl: e.target.value })}
                            placeholder="Dán link ảnh (https://...)"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white rounded-xl border border-stone-300 focus:outline-none focus:border-emerald-600 font-medium"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddImage()}
                          disabled={!form.newImageUrl.trim()}
                          className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-200 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
                        >
                          Thêm link
                        </button>
                      </div>

                      <div className="pt-1">
                        <p className="text-[11px] text-stone-500 mb-1 font-medium">Bấm chọn nhanh ảnh mẫu có sẵn:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {SAMPLE_IMAGE_SUGGESTIONS.map((sug) => (
                            <button
                              key={sug.label}
                              type="button"
                              onClick={() => handleAddImage(sug.url)}
                              className="text-[11px] font-semibold bg-white hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              {sug.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Thuộc Tòa nhà / Cơ sở *
                </label>
                <select
                  value={form.houseId}
                  onChange={(e) => {
                    const nextHouseId = e.target.value;
                    if (!editingProperty) {
                      setForm((prev) => applyHouseDefaultsToForm(nextHouseId, prev));
                    } else {
                      const targetHouse = houses.find((h) => h.id === nextHouseId);
                      setForm((prev) => ({
                        ...prev,
                        houseId: nextHouseId,
                        address: targetHouse ? targetHouse.address : prev.address,
                      }));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold text-stone-900"
                >
                  <option value="">-- Chưa gán vào tòa nhà nào --</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code} — {h.name} ({h.address})
                    </option>
                  ))}
                </select>
                {!editingProperty && form.houseId && (
                  <p className="text-[11px] text-emerald-800 mt-1">
                    Đã tự động điền địa chỉ và đơn giá điện, nước, dịch vụ mặc định của tòa nhà này.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Mã phòng (A-Z, 0-9) *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={20}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="VD: P101, MB-01"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Loại hình *
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as PropertyType })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  >
                    <option value="ROOM">Phòng trọ</option>
                    <option value="COMMERCIAL_SPACE">Mặt bằng kinh doanh</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Tên phòng hiển thị *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: Phòng Trọ Gác Đúc Ban Công"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Địa chỉ tòa nhà *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    placeholder="VD: 14B8, Ngô Tất Tố, P. Thạnh Mỹ Tây, TP.HCM"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Diện tích (m²) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Giá thuê / tháng (VNĐ) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    value={form.monthlyRent}
                    onChange={(e) =>
                      setForm({ ...form, monthlyRent: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-bold text-emerald-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Tiền cọc (VNĐ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={form.deposit}
                    onChange={(e) =>
                      setForm({ ...form, deposit: e.target.value })
                    }
                    placeholder="Mặc định = Giá thuê"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Đơn giá điện (VNĐ/kWh) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.electricityRate}
                    onChange={(e) =>
                      setForm({ ...form, electricityRate: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Đơn giá nước (VNĐ/m³) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.waterRate}
                    onChange={(e) =>
                      setForm({ ...form, waterRate: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Phí dịch vụ (VNĐ/tháng)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.serviceFee}
                    onChange={(e) =>
                      setForm({ ...form, serviceFee: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* KHU VỰC TRẠNG THÁI PHÒNG: TÁCH BIỆT CHẾ ĐỘ SỬA CÓ KHÁCH (AN TOÀN) VÀ PHÒNG TRỐNG / TẠO MỚI */}
              {editingProperty && editingProperty.status !== 'AVAILABLE' ? (
                /* NẾU PHÒNG ĐANG CỌC, ĐANG THUÊ HOẶC SẮP TRỐNG: ÁP DỤNG CƠ CHẾ AN TOÀN */
                <div className="space-y-4">
                  {!isChangingStatus ? (
                    /* Trạng thái được bảo vệ khi sửa thông tin phòng */
                    <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-stone-900">
                              Trạng thái phòng hiện tại
                            </label>
                            <span className="text-[10px] font-semibold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full border border-stone-200">
                              Đang hoạt động
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`inline-flex items-center text-xs font-extrabold rounded-lg px-3 py-1.5 border shadow-2xs ${STATUS_BADGE[editingProperty.status]?.className || 'bg-stone-100 text-stone-700'}`}>
                              {STATUS_BADGE[editingProperty.status]?.label || editingProperty.status}
                            </span>
                            {editingProperty.status === 'SOON_TO_BE_AVAILABLE' && editingProperty.availableFrom && (
                              <span className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Trống từ: {formatDateDisplay(editingProperty.availableFrom)}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 mt-1.5">
                            Phòng đang có dữ liệu khách thuê hoặc lịch cọc. Nhấn nút bên cạnh nếu cần điều chỉnh trạng thái đón khách.
                          </p>
                        </div>

                        <button
                          type="button"
                          id="btn-request-status-change"
                          onClick={() => {
                            setIsChangingStatus(true);
                            setTransitionReason('');
                            setTransitionDetail('');
                          }}
                          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-stone-950 font-bold text-xs shadow-xs transition-colors cursor-pointer shrink-0 self-start sm:self-center whitespace-nowrap"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-stone-950" />
                          <span>Đổi trạng thái phòng</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* KHUNG ĐỔI TRẠNG THÁI PHÒNG */
                    <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-300 shadow-2xs space-y-4">
                      <div className="flex items-start justify-between gap-3 border-b border-amber-200/80 pb-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                            <RefreshCw className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-amber-950">
                              Xác nhận đổi trạng thái phòng (Phòng {editingProperty.code})
                            </div>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              Chọn lý do theo hợp đồng để hệ thống cập nhật trạng thái và lưu lịch sử.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsChangingStatus(false);
                            setForm((prev) => ({
                              ...prev,
                              status: editingProperty.status,
                              availableFrom: editingProperty.availableFrom || '',
                            }));
                            setTransitionReason('');
                            setTransitionDetail('');
                          }}
                          className="text-xs font-bold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0 transition-colors"
                        >
                          ✕ Hủy, giữ nguyên
                        </button>
                      </div>

                      {/* 1: CHỌN LÝ DO */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-amber-950">
                          1. Lý do thay đổi <span className="text-rose-600">*</span>
                        </label>
                        <select
                          id="select-transition-reason"
                          value={transitionReason}
                          onChange={(e) => {
                            const selectedLabel = e.target.value;
                            setTransitionReason(selectedLabel);
                            const match = smartReasons.find((p) => p.label === selectedLabel);
                            if (match) {
                              setForm((prev) => ({
                                ...prev,
                                status: match.targetStatus,
                                availableFrom: match.targetStatus === 'SOON_TO_BE_AVAILABLE' ? prev.availableFrom : '',
                              }));
                              if (match.targetStatus === 'SOON_TO_BE_AVAILABLE') {
                                if (match.id.includes('maintenance')) {
                                  setSoonType('UNDER_MAINTENANCE');
                                } else {
                                  setSoonType(editingProperty.tenantName ? 'TENANT_EXPIRING' : 'UNDER_MAINTENANCE');
                                }
                              }
                            }
                          }}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs sm:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs cursor-pointer"
                        >
                          <option value="">-- Chọn lý do thay đổi trạng thái --</option>
                          {smartReasons.map((preset) => (
                            <option key={preset.id} value={preset.label}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                        {transitionReason && (
                          <p className="text-[11px] text-emerald-800 font-medium">
                            ✓ {smartReasons.find((p) => p.label === transitionReason)?.hint || 'Đã ghi nhận lý do'}
                          </p>
                        )}
                      </div>

                      {/* 2: TRẠNG THÁI MỚI CHUYỂN SANG */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-amber-950">
                            2. Trạng thái phòng mới <span className="text-rose-600">*</span>
                          </label>
                          {!transitionReason.trim() ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                              <Lock className="w-3 h-3 text-rose-600" />
                              <span>Chờ chọn lý do ở bước 1</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              <Unlock className="w-3 h-3 text-emerald-700" />
                              <span>Tự động đề xuất theo lý do</span>
                            </span>
                          )}
                        </div>

                        {/* Lộ trình chuyển đổi */}
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-100/60 text-xs font-bold">
                          <span className="text-stone-600">Hiện tại:</span>
                          <span className={`px-2 py-0.5 rounded-md border ${STATUS_BADGE[editingProperty.status]?.className || 'bg-stone-100'}`}>
                            {STATUS_BADGE[editingProperty.status]?.label || editingProperty.status}
                          </span>
                          <span className="text-amber-800 font-extrabold text-sm">➔</span>
                          <span className="text-stone-600">Mới:</span>
                          {transitionReason.trim() ? (
                            <span className={`px-2 py-0.5 rounded-md border ${STATUS_BADGE[form.status]?.className || 'bg-stone-100'}`}>
                              {STATUS_BADGE[form.status]?.label || form.status}
                            </span>
                          ) : (
                            <span className="text-stone-400 italic font-normal">Chờ chọn lý do…</span>
                          )}
                        </div>

                        <select
                          id="select-target-status"
                          disabled={!transitionReason.trim()}
                          value={form.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as PropertyStatus;
                            setForm((prev) => ({
                              ...prev,
                              status: newStatus,
                              availableFrom: newStatus === 'SOON_TO_BE_AVAILABLE' ? prev.availableFrom : '',
                            }));
                            if (newStatus === 'SOON_TO_BE_AVAILABLE') {
                              setSoonType(editingProperty.tenantName ? 'TENANT_EXPIRING' : 'UNDER_MAINTENANCE');
                            }
                          }}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold shadow-xs transition-colors ${
                            !transitionReason.trim()
                              ? 'border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed'
                              : 'border-amber-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer'
                          }`}
                        >
                          <option value="AVAILABLE">Đang trống</option>
                          <option value="SOON_TO_BE_AVAILABLE">Sắp trống</option>
                          <option value="DEPOSITED">Đã nhận cọc</option>
                          <option value="RENTED">Đang cho thuê</option>
                        </select>
                      </div>

                      {/* Ngày dự kiến trống nếu chuyển sang SOON_TO_BE_AVAILABLE */}
                      {form.status === 'SOON_TO_BE_AVAILABLE' && (
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-amber-950">
                            Ngày dự kiến phòng trống đón khách mới <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={form.availableFrom}
                            onChange={(e) => setForm((prev) => ({ ...prev, availableFrom: e.target.value }))}
                            className="w-full px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}

                      {/* 3: GHI CHÚ BỔ SUNG */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-amber-900">
                          3. Ghi chú bổ sung {transitionReason.toLowerCase().includes('khác') ? <span className="text-rose-600">*</span> : '(Tùy chọn)'}
                        </label>
                        <input
                          type="text"
                          value={transitionDetail}
                          onChange={(e) => setTransitionDetail(e.target.value)}
                          required={transitionReason.toLowerCase().includes('khác')}
                          placeholder={
                            transitionReason.toLowerCase().includes('khác')
                              ? 'Vui lòng nhập rõ lý do cụ thể...'
                              : 'VD: Khách trả phòng sớm do chuyển công tác về quê; Đã hoàn trả 50% tiền cọc...'
                          }
                          className="w-full px-3.5 py-2 rounded-xl border border-amber-200 bg-white text-xs sm:text-sm focus:outline-none focus:border-amber-600 font-medium"
                        />
                      </div>

                      {/* Cảnh báo dọn dẹp khi chuyển về AVAILABLE */}
                      {(editingProperty.status === 'DEPOSITED' || editingProperty.status === 'RENTED') && form.status === 'AVAILABLE' && (
                        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-100/70 border border-amber-200 text-[11px] text-amber-900 leading-relaxed font-medium">
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <span>
                            <strong>Lưu ý bảo toàn:</strong> Chuyển về &quot;Đang trống&quot; sẽ giải phóng thông tin người thuê/cọc cũ để sẵn sàng đón khách mới. Toàn bộ lý do và vết tích này sẽ được tự động lưu vào <strong>Lịch sử ghi chú phòng</strong>.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* NẾU PHÒNG ĐANG TRỐNG HOẶC TẠO PHÒNG MỚI: ĐỔI TRỰC TIẾP */
                <div className={`grid grid-cols-1 ${form.status === 'SOON_TO_BE_AVAILABLE' ? 'sm:grid-cols-2' : ''} gap-4`}>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Trạng thái phòng *
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) => {
                        const newStatus = e.target.value as PropertyStatus;
                        setForm({
                          ...form,
                          status: newStatus,
                          availableFrom: newStatus === 'SOON_TO_BE_AVAILABLE' ? form.availableFrom : '',
                        });
                        if (newStatus === 'SOON_TO_BE_AVAILABLE') {
                          setSoonType('UNDER_MAINTENANCE');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold text-stone-900"
                    >
                      <option value="AVAILABLE">Đang trống</option>
                      <option value="SOON_TO_BE_AVAILABLE">Sắp trống</option>
                      <option value="DEPOSITED">Đã nhận cọc</option>
                      <option value="RENTED">Đang cho thuê</option>
                    </select>
                  </div>

                  {form.status === 'SOON_TO_BE_AVAILABLE' && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                        Ngày dự kiến trống đón khách *
                      </label>
                      <input
                        type="date"
                        required
                        value={form.availableFrom}
                        onChange={(e) =>
                          setForm({ ...form, availableFrom: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* VÙNG NHẬP THÔNG TIN KHÁCH THUÊ / KHÁCH CỌC / KHÁCH SẮP HẾT HỢP ĐỒNG */}
              {(form.status === 'RENTED' || form.status === 'DEPOSITED' || form.status === 'SOON_TO_BE_AVAILABLE') && (
                <div className="pt-4 border-t border-stone-200 space-y-3.5">
                  {/* Khi phòng là SOON_TO_BE_AVAILABLE: Cho chọn 2 trường hợp: Khách sắp hết HĐ vs Đang sửa chữa */}
                  {form.status === 'SOON_TO_BE_AVAILABLE' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-stone-900">
                        Nguyên nhân phòng sắp trống:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSoonType('TENANT_EXPIRING')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSoonType('TENANT_EXPIRING');
                            }
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
                            soonType === 'TENANT_EXPIRING'
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <User className="w-4 h-4 shrink-0" />
                          <div>
                            <div>Khách chuẩn bị hết HĐ / sắp dọn đi</div>
                            <div className={`text-[10px] font-normal mt-0.5 ${soonType === 'TENANT_EXPIRING' ? 'text-amber-100' : 'text-stone-400'}`}>
                              Có thông tin khách hàng đang ở
                            </div>
                          </div>
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSoonType('UNDER_MAINTENANCE')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSoonType('UNDER_MAINTENANCE');
                            }
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
                            soonType === 'UNDER_MAINTENANCE'
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <Wrench className="w-4 h-4 shrink-0" />
                          <div>
                            <div>Phòng sắp sửa chữa xong</div>
                            <div className={`text-[10px] font-normal mt-0.5 ${soonType === 'UNDER_MAINTENANCE' ? 'text-amber-100' : 'text-stone-400'}`}>
                              Đang bảo trì, không cần thông tin khách
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Header khối thông tin */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {form.status === 'SOON_TO_BE_AVAILABLE' && soonType === 'UNDER_MAINTENANCE' ? (
                        <Wrench className="w-4 h-4 text-stone-600 shrink-0" />
                      ) : (
                        <User className="w-4 h-4 text-emerald-700 shrink-0" />
                      )}
                      <h4 className="text-sm font-bold text-stone-900">
                        {form.status === 'RENTED'
                          ? 'Thông tin Khách thuê & Hợp đồng'
                          : form.status === 'DEPOSITED'
                          ? 'Thông tin Khách đặt cọc giữ chỗ'
                          : soonType === 'UNDER_MAINTENANCE'
                          ? 'Thông tin Bảo trì / Sửa chữa phòng'
                          : 'Thông tin Khách đang ở (Chuẩn bị dọn đi)'}
                      </h4>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        form.status === 'RENTED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : form.status === 'DEPOSITED'
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : soonType === 'UNDER_MAINTENANCE'
                          ? 'bg-stone-100 text-stone-800 border-stone-200'
                          : 'bg-amber-50 text-amber-900 border-amber-200'
                      }`}
                    >
                      {form.status === 'RENTED'
                        ? 'Đang ở'
                        : form.status === 'DEPOSITED'
                        ? 'Chờ dọn vào'
                        : soonType === 'UNDER_MAINTENANCE'
                        ? 'Sửa chữa'
                        : 'Sắp hết HĐ'}
                    </span>
                  </div>

                  {/* NẾU LÀ SẮP TRỐNG DẠNG SỬA CHỮA: KHÔNG CẦN THÔNG TIN KHÁCH HÀNG */}
                  {form.status === 'SOON_TO_BE_AVAILABLE' && soonType === 'UNDER_MAINTENANCE' ? (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 space-y-1">
                      <p className="font-semibold text-stone-800 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                        <span>Phòng đang trong giai đoạn sửa chữa / nâng cấp.</span>
                      </p>
                      <p>
                        Phòng sẽ được mở đón khách trở lại vào ngày: <strong>{formatDateDisplay(form.availableFrom) || 'Chưa đặt ngày'}</strong>. Toàn bộ thông tin khách thuê sẽ được làm trống để đón khách mới.
                      </p>
                    </div>
                  ) : (
                    /* NẾU LÀ ĐANG THUÊ, ĐÃ CỌC, HOẶC SẮP TRỐNG CÓ KHÁCH: HIỂN THỊ ĐẦY ĐỦ FORM KHÁCH HÀNG */
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Họ và tên khách {form.status === 'RENTED' ? '*' : '(Tùy chọn)'}
                          </label>
                          <input
                            type="text"
                            required={form.status === 'RENTED'}
                            value={form.tenantName}
                            onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                            placeholder="VD: Nguyễn Văn An"
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600 font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Số điện thoại / Zalo {form.status === 'RENTED' ? '*' : '(Tùy chọn)'}
                          </label>
                          <input
                            type="tel"
                            required={form.status === 'RENTED'}
                            value={form.tenantPhone}
                            onChange={(e) => setForm({ ...form, tenantPhone: e.target.value })}
                            placeholder="VD: 0912345678"
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600 font-medium"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Số CCCD / CMND (Khai báo tạm trú)
                          </label>
                          <input
                            type="text"
                            value={form.tenantCitizenId}
                            onChange={(e) => setForm({ ...form, tenantCitizenId: e.target.value })}
                            placeholder="VD: 079201001234"
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600 font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Tiền cọc đã nhận (VNĐ)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={form.depositPaid}
                            onChange={(e) => setForm({ ...form, depositPaid: e.target.value })}
                            placeholder="VD: 4500000"
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600 font-semibold text-emerald-800"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            {form.status === 'DEPOSITED' ? 'Ngày hẹn nhận phòng' : 'Ngày bắt đầu thuê'}
                          </label>
                          <input
                            type="date"
                            value={form.leaseStartDate}
                            onChange={(e) => setForm({ ...form, leaseStartDate: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            {form.status === 'SOON_TO_BE_AVAILABLE'
                              ? 'Hạn kết thúc HĐ (Khách dự kiến dọn đi)'
                              : 'Hạn kết thúc HĐ'}
                          </label>
                          <input
                            type="date"
                            value={form.leaseEndDate}
                            onChange={(e) => setForm({ ...form, leaseEndDate: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600"
                          />

                          {/* Phím bấm gia hạn nhanh */}
                          {(form.status === 'RENTED' || form.status === 'SOON_TO_BE_AVAILABLE') && (
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="text-[11px] text-stone-500 font-medium">Gia hạn nhanh:</span>
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, leaseEndDate: addMonthsToDate(form.leaseEndDate, 3) })}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer transition-colors"
                              >
                                +3 tháng
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, leaseEndDate: addMonthsToDate(form.leaseEndDate, 6) })}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer transition-colors"
                              >
                                +6 tháng
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, leaseEndDate: addMonthsToDate(form.leaseEndDate, 12) })}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer transition-colors"
                              >
                                +1 năm
                              </button>
                            </div>
                          )}

                          {/* Cảnh báo thông minh nếu hạn HĐ vẫn trong vòng 30 ngày */}
                          {form.status === 'RENTED' && form.leaseEndDate && (() => {
                            const remaining = getDaysRemaining(form.leaseEndDate);
                            if (remaining === null || remaining > 30) return null;
                            return (
                              <div className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2.5 flex items-start gap-1.5 leading-snug">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                  <strong>Lưu ý gia hạn HĐ:</strong> Hạn HĐ hiện tại ({formatDateDisplay(form.leaseEndDate)}) {remaining <= 0 ? `đã quá hạn ${Math.abs(remaining)} ngày` : `chỉ còn ${remaining} ngày`}. Để hệ thống không còn cảnh báo sắp hết hạn, bạn hãy bấm các nút <strong>+6 tháng</strong> hoặc <strong>+1 năm</strong> ở trên để cập nhật thời hạn mới nhé.
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Số người ở
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={form.tenantCount}
                            onChange={(e) => setForm({ ...form, tenantCount: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Số lượng xe
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={form.vehicleCount}
                            onChange={(e) => setForm({ ...form, vehicleCount: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Ghi chú hợp đồng & Bàn giao đồ đạc
                        </label>
                        <textarea
                          rows={2}
                          value={form.rentalNotes}
                          onChange={(e) => setForm({ ...form, rentalNotes: e.target.value })}
                          placeholder="VD: Bàn giao 1 máy lạnh Daikin, 2 thẻ từ thang máy, 2 chìa khóa phòng."
                          className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-emerald-600 font-medium"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* LỊCH SỬ CHUYỂN ĐỔI / GHI CHÚ TRƯỚC ĐÓ (KHI PHÒNG TRỐNG) */}
              {(form.status === 'AVAILABLE' || form.status === 'SOON_TO_BE_AVAILABLE') && form.rentalNotes && (
                <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                    <History className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                    <span>Lịch sử chuyển đổi trạng thái &amp; ghi chú phòng</span>
                  </label>
                  <p className="font-sans text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                    {form.rentalNotes}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Mô tả tiện nghi chi tiết
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Gác cao 1m8, máy lạnh Inverter, tủ lạnh, bếp riêng, khóa vân tay…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>
              </div>

              <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div>
                  {editingProperty && editingProperty.status !== 'AVAILABLE' && Boolean(editingProperty.tenantName?.trim()) && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingProperty;
                        closeModal();
                        setContractProperty(target);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>Xem &amp; in hợp đồng</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span className="whitespace-nowrap">
                      {submitting
                        ? 'Đang lưu…'
                        : editingProperty
                          ? 'Cập nhật phòng'
                          : 'Tạo phòng mới'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Duyệt Đề Xuất Phòng Sắp Hết Hạn Hợp Đồng */}
      {showExpiringModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-stone-900 text-base sm:text-lg flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-amber-800 shrink-0" />
                  <span>Đề Xuất Duyệt Chuyển Trạng Thái Phòng Sắp Hết Hạn</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 tabular-nums">
                    {expiringProperties.length} phòng
                  </span>
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Duyệt nhanh để chuyển phòng sang <strong>Sắp trống</strong> (tự động nhận ngày dự kiến trống và giữ nguyên thông tin khách) hoặc <strong>Gia hạn hợp đồng</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {expiringProperties.length > 1 && (
                  <button
                    type="button"
                    id="btn-approve-all-expiring"
                    onClick={() => void handleApproveAllExpiring()}
                    disabled={approvingAll}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold text-xs cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {approvingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="whitespace-nowrap">
                      {approvingAll
                        ? 'Đang duyệt tất cả…'
                        : `Duyệt tất cả (${expiringProperties.length})`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  id="btn-close-expiring-modal"
                  onClick={() => setShowExpiringModal(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {expiringProperties.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                  <p className="font-semibold text-stone-800">Không có phòng nào sắp hết hạn hợp đồng!</p>
                  <p className="text-xs mt-1">Toàn bộ các phòng đang cho thuê đều còn thời hạn trên 30 ngày.</p>
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-700 font-semibold">
                      <tr>
                        <th className="p-3">Phòng</th>
                        <th className="p-3">Khách đang thuê</th>
                        <th className="p-3">Hạn hợp đồng &amp; Thời gian</th>
                        <th className="p-3 text-right">Thao tác xử lý</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {expiringProperties.map((item) => (
                        <tr key={item.propertyId} className="hover:bg-amber-50/40 transition-colors">
                          <td className="p-3 font-semibold text-stone-900">
                            <span className="inline-block px-2 py-0.5 rounded-md font-mono text-xs bg-stone-100 border border-stone-200 mr-2">
                              {item.code}
                            </span>
                            <span>{item.name}</span>
                          </td>
                          <td className="p-3 text-stone-700">
                            <div className="flex items-center gap-1.5 font-medium">
                              <User className="w-3.5 h-3.5 text-stone-400" />
                              <span>{item.tenantName || '(Chưa cập nhật tên)'}</span>
                            </div>
                            {item.tenantPhone && (
                              <div className="text-xs text-stone-500 mt-0.5">
                                SĐT: <span className="font-mono">{item.tenantPhone}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-stone-800">
                              Hạn: {formatDateDisplay(item.leaseEndDate)}
                            </div>
                            <div className="mt-1">
                              {item.isOverdue ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  Đã quá hạn {Math.abs(item.diffDays)} ngày
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  Còn {item.diffDays} ngày nữa
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                id={`btn-approve-soon-${item.code}`}
                                onClick={() => void handleApproveSoonToBeAvailable(item)}
                                disabled={approvingId === item.propertyId || approvingAll}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {approvingId === item.propertyId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="whitespace-nowrap">
                                  {approvingId === item.propertyId ? 'Đang duyệt…' : 'Duyệt Sắp trống'}
                                </span>
                              </button>
                              <button
                                type="button"
                                id={`btn-extend-lease-${item.code}`}
                                onClick={() => handleExtendLeaseFromModal(item)}
                                disabled={approvingAll}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                                <span>Gia hạn HĐ</span>
                              </button>
                              <button
                                type="button"
                                id={`btn-dismiss-expiring-${item.code}`}
                                onClick={() => {
                                  setDismissedExpiringIds((prev) => [...prev, item.propertyId]);
                                  setBannerSuccess(`Đã tạm ẩn đề xuất cho phòng "${item.code}".`);
                                }}
                                disabled={approvingAll}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-500 hover:text-stone-700 border border-stone-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                                title="Tạm ẩn lời nhắc cho phòng này"
                              >
                                <span>Bỏ qua</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Quy tắc nghiệp vụ an toàn:</strong> Khi bạn bấm <em>Duyệt Sắp trống</em>, phòng sẽ được mở bán sớm trên website và kênh tư vấn để đón khách mới với ngày trống dự kiến là ngày hết hạn hợp đồng. Toàn bộ thông tin khách đang ở sẽ được giữ nguyên 100% để bạn quản lý cho đến ngày bàn giao phòng.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExpiringModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Đóng / Bỏ qua tạm thời
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal đề xuất nghiệm thu bàn giao & đối soát cọc */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60">
          <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-stone-900 text-base sm:text-lg flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Đề Xuất Nghiệm Thu Bàn Giao Phòng &amp; Đối Soát Hoàn Cọc</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                    {handoverProperties.length} phòng
                  </span>
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Các phòng &ldquo;Sắp trống&rdquo; đã đến hạn bàn giao. Xác nhận để đối soát hoàn cọc và chuyển phòng về <strong>Đang trống</strong>, sẵn sàng đón khách mới.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {handoverProperties.length > 1 && (
                  <button
                    type="button"
                    id="btn-complete-all-handover"
                    onClick={() => void handleCompleteAllHandover()}
                    disabled={completingAllHandover}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold text-xs cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {completingAllHandover ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="whitespace-nowrap">
                      {completingAllHandover
                        ? 'Đang nghiệm thu tất cả…'
                        : `Nghiệm thu tất cả (${handoverProperties.length})`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  id="btn-close-handover-modal"
                  onClick={() => setShowHandoverModal(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {handoverProperties.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                  <p className="font-semibold text-stone-800">Không có phòng nào cần nghiệm thu hôm nay!</p>
                  <p className="text-xs mt-1">Các phòng sắp trống hiện tại đều chưa đến ngày bàn giao.</p>
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-700 font-semibold">
                      <tr>
                        <th className="p-3">Phòng</th>
                        <th className="p-3">Khách cũ &amp; Đối soát cọc</th>
                        <th className="p-3">Ngày bàn giao &amp; Thời hạn</th>
                        <th className="p-3 text-right">Thao tác xử lý</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {handoverProperties.map((item) => (
                        <tr key={item.propertyId} className="hover:bg-stone-50 transition-colors">
                          <td className="p-3 font-semibold text-stone-900">
                            <span className="inline-block px-2 py-0.5 rounded-md font-mono text-xs bg-stone-100 border border-stone-200 mr-2">
                              {item.code}
                            </span>
                            <span>{item.name}</span>
                          </td>
                          <td className="p-3 text-stone-700">
                            <div className="flex items-center gap-1.5 font-medium">
                              <User className="w-3.5 h-3.5 text-stone-400" />
                              <span>{item.tenantName || '(Sửa chữa/Bảo trì - Không có khách)'}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {item.tenantPhone && (
                                <span className="text-xs text-stone-500">
                                  SĐT: <span className="font-mono">{item.tenantPhone}</span>
                                </span>
                              )}
                              {item.tenantCitizenId && (
                                <span className="text-xs text-stone-500">
                                  CCCD: <span className="font-mono">{item.tenantCitizenId}</span>
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                                Tiền cọc đã nộp: {item.depositPaid ? formatVND(item.depositPaid) : '0 ₫'}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-stone-800">
                              Ngày bàn giao: {formatDateDisplay(item.availableFrom)}
                            </div>
                            <div className="mt-1">
                              {item.diffDays === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Hôm nay là ngày bàn giao
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                                  Đã quá hạn bàn giao {Math.abs(item.diffDays)} ngày
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                id={`btn-handover-${item.code}`}
                                onClick={() => void handleCompleteHandover(item)}
                                disabled={completingHandoverId === item.propertyId || completingAllHandover}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {completingHandoverId === item.propertyId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="whitespace-nowrap">
                                  {completingHandoverId === item.propertyId ? 'Đang nghiệm thu…' : 'Nghiệm thu'}
                                </span>
                              </button>
                              <button
                                type="button"
                                id={`btn-extend-from-handover-${item.code}`}
                                onClick={() => handleExtendLeaseFromHandoverModal(item)}
                                disabled={completingAllHandover}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                                <span>Gia hạn HĐ</span>
                              </button>
                              <button
                                type="button"
                                id={`btn-dismiss-handover-${item.code}`}
                                onClick={() => {
                                  handleDismissHandover(item.propertyId);
                                  setBannerSuccess(`Đã tạm ẩn nhắc nhở nghiệm thu cho phòng "${item.code}".`);
                                }}
                                disabled={completingAllHandover}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-500 hover:text-stone-700 border border-stone-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                                title="Tạm ẩn lời nhắc cho phòng này"
                              >
                                <span>Bỏ qua</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Quy tắc nghiệp vụ an toàn khi Nghiệm thu:</strong> Khi bạn bấm <em>Nghiệm thu &amp; Về phòng trống</em>, phòng sẽ được chuyển sang trạng thái <strong>Đang trống</strong>, đồng thời hệ thống tự động làm sạch thông tin khách thuê cũ để bảo vệ dữ liệu cá nhân và lưu vết lịch sử hoàn tất đối soát cọc vào nhật ký phòng.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowHandoverModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Đóng / Bỏ qua tạm thời
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm / Sửa Tòa nhà */}
      {isHouseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
          onClick={() => !submittingHouse && setIsHouseModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-stone-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{editingHouse ? `Chỉnh sửa Tòa nhà: ${editingHouse.code}` : 'Thêm Tòa Nhà / Cơ Sở Mới'}</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Cấu hình địa chỉ và đơn giá điện nước mặc định cho toàn bộ phòng trong tòa nhà
                </p>
              </div>
              <button
                type="button"
                onClick={() => !submittingHouse && setIsHouseModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitHouse} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {houseFormError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{houseFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Mã tòa nhà (A-Z, 0-9) *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={50}
                    value={houseForm.code}
                    onChange={(e) => setHouseForm({ ...houseForm, code: e.target.value })}
                    placeholder="VD: NHA-04"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Tên tòa nhà / Cơ sở *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={houseForm.name}
                    onChange={(e) => setHouseForm({ ...houseForm, name: e.target.value })}
                    placeholder="VD: Nhà Trọ 185 Võ Oanh"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Địa chỉ tòa nhà *
                </label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={houseForm.address}
                  onChange={(e) => setHouseForm({ ...houseForm, address: e.target.value })}
                  placeholder="VD: 185 Võ Oanh, Phường 25, Quận Bình Thạnh, TP.HCM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Giá điện mặc định (đ/kWh)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={houseForm.defaultElectricityRate}
                    onChange={(e) =>
                      setHouseForm({ ...houseForm, defaultElectricityRate: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Giá nước mặc định (đ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={houseForm.defaultWaterRate}
                    onChange={(e) =>
                      setHouseForm({ ...houseForm, defaultWaterRate: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Phí dịch vụ mặc định (đ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={houseForm.defaultServiceFee}
                    onChange={(e) =>
                      setHouseForm({ ...houseForm, defaultServiceFee: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Mô tả / Ghi chú tòa nhà
                </label>
                <textarea
                  rows={2}
                  value={houseForm.description}
                  onChange={(e) => setHouseForm({ ...houseForm, description: e.target.value })}
                  placeholder="Ghi chú về bãi xe, nội quy, thang máy hoặc ghi chú chung…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>
              </div>

              <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsHouseModalOpen(false)}
                  disabled={submittingHouse}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingHouse}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {submittingHouse
                    ? 'Đang lưu…'
                    : editingHouse
                      ? 'Lưu thay đổi'
                      : 'Tạo tòa nhà'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xem Trước & In Hợp Đồng Thuê Phòng / Mặt Bằng */}
      {contractProperty &&
        (() => {
          const enrichedContract = toContractProperty(contractProperty);
          const isCommercial = contractProperty.type === 'COMMERCIAL_SPACE';
          const brand = contractSettings.brandName?.trim() || 'DRLAND';
          const hotline = contractSettings.hotline?.trim() || '0943.257.089';
          const bankName = contractSettings.bankName?.trim() || 'Ví điện tử ZaloPay';
          const accountNumber = contractSettings.accountNumber?.trim() || '0943257089';
          const accountName = contractSettings.accountName?.trim() || 'VO HAI LONG';
          const houseName = contractProperty.house?.name?.trim() || brand;
          const fullAddress =
            contractProperty.address?.trim() ||
            contractProperty.house?.address?.trim() ||
            'TP. Hồ Chí Minh';
          const rentVal = Number(contractProperty.monthlyRent ?? 0);
          const depositVal = Number(
            contractProperty.depositPaid ??
              contractProperty.deposit ??
              contractProperty.monthlyRent ??
              0,
          );
          const leaseMonths = calculateLeaseMonths(
            contractProperty.leaseStartDate,
            contractProperty.leaseEndDate,
          );
          const elecIdxLabel =
            typeof enrichedContract.initialElectricityIndex === 'number' &&
            Number.isFinite(enrichedContract.initialElectricityIndex)
              ? `${new Intl.NumberFormat('vi-VN').format(enrichedContract.initialElectricityIndex)} kWh`
              : '........ kWh';
          const waterIdxLabel =
            typeof enrichedContract.initialWaterIndex === 'number' &&
            Number.isFinite(enrichedContract.initialWaterIndex)
              ? `${new Intl.NumberFormat('vi-VN').format(enrichedContract.initialWaterIndex)} m³`
              : '........ m³';

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4"
              onClick={() => setContractProperty(null)}
            >
              <div
                className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-white">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                      <span>
                        {isCommercial
                          ? `Hợp Đồng Thuê Mặt Bằng ${contractProperty.code}`
                          : `Hợp Đồng Thuê Phòng ${contractProperty.code}`}
                      </span>
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Khách thuê: {contractProperty.tenantName || 'Chưa cập nhật'} · Tự động điền từ hồ sơ phòng
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setContractProperty(null)}
                    className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                    title="Đóng (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-stone-100/80">
                  <div className="bg-white border border-stone-200 rounded-lg p-5 sm:p-8 space-y-4 text-xs sm:text-sm text-stone-800 leading-relaxed max-w-2xl mx-auto shadow-xs font-sans">
                    <div className="text-center space-y-1">
                      <p className="text-sm sm:text-base font-bold text-stone-900">
                        Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam
                      </p>
                      <p className="font-semibold underline text-stone-800">
                        Độc lập - Tự do - Hạnh phúc
                      </p>
                      <h4 className="text-base sm:text-lg font-bold text-stone-900 pt-3">
                        {isCommercial
                          ? 'Hợp Đồng Thuê Mặt Bằng Kinh Doanh'
                          : 'Hợp Đồng Thuê Phòng Trọ'}
                      </h4>
                      <p className="text-xs italic text-stone-500 tabular-nums">
                        Số: {contractProperty.code}/{CURRENT_CONTRACT_YEAR}/HĐT-{brand.toUpperCase()}
                      </p>
                    </div>

                    <div className="border-l-2 border-stone-300 pl-3 text-xs italic text-stone-600 space-y-0.5">
                      <p>Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;</p>
                      <p>Căn cứ Luật Nhà ở số 27/2023/QH15 và các văn bản hướng dẫn thi hành;</p>
                      <p>Căn cứ vào nhu cầu và thỏa thuận tự nguyện giữa hai bên.</p>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-stone-200 bg-stone-50/80 rounded-lg p-3">
                      <p className="text-sm font-bold text-stone-900">
                        Bên cho thuê (Bên A): Hệ thống {brand}
                      </p>
                      <p>
                        Đơn vị quản lý: <strong>{houseName}</strong>, Hotline:{' '}
                        <strong className="tabular-nums">{hotline}</strong>
                      </p>
                      <p>Địa chỉ cơ sở: {fullAddress}</p>
                      <p className="tabular-nums">
                        Tài khoản thanh toán: <strong>{accountName}</strong>, STK{' '}
                        <strong>{accountNumber}</strong> ({bankName})
                      </p>
                    </div>

                    <div className="space-y-1.5 border border-stone-200 bg-stone-50/80 rounded-lg p-3">
                      <p className="text-sm font-bold text-stone-900">Bên thuê (Bên B):</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 tabular-nums">
                        <div>
                          Họ và tên: <strong>{contractProperty.tenantName || 'Chưa cập nhật'}</strong>
                        </div>
                        <div>
                          Số điện thoại: <strong>{contractProperty.tenantPhone || 'Chưa cập nhật'}</strong>
                        </div>
                        <div>
                          Số CCCD / CMND: <strong>{contractProperty.tenantCitizenId || 'Chưa cập nhật'}</strong>
                        </div>
                        <div>
                          Ngày cấp: ..../..../20...., Nơi cấp: ....................
                        </div>
                        <div className="sm:col-span-2">
                          Địa chỉ thường trú: ........................................................
                        </div>
                        <div className="sm:col-span-2">
                          Số người &amp; xe: {contractProperty.tenantCount ?? 1} người ở,{' '}
                          {contractProperty.vehicleCount ?? 0} xe máy
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-1 tabular-nums">
                      <div>
                        <p className="font-bold text-stone-900">
                          Điều 1. Đối tượng cho thuê và Hiện trạng bàn giao
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Bên A cho Bên B thuê {isCommercial ? 'mặt bằng kinh doanh' : 'phòng trọ'}{' '}
                            <strong>
                              {contractProperty.code} ({contractProperty.name})
                            </strong>{' '}
                            thuộc tòa nhà <strong>{houseName}</strong> ({fullAddress}), diện tích{' '}
                            <strong>{contractProperty.area} m²</strong>.
                          </li>
                          <li>
                            Mục đích thuê:{' '}
                            {isCommercial
                              ? 'kinh doanh hợp pháp theo đúng quy định pháp luật và nội quy tòa nhà.'
                              : 'để ở sinh hoạt hợp pháp, không sử dụng cho hoạt động trái pháp luật.'}
                          </li>
                          <li>
                            Chỉ số bàn giao đầu kỳ: Điện <strong>{elecIdxLabel}</strong>, Nước{' '}
                            <strong>{waterIdxLabel}</strong>; trang thiết bị và khóa cửa hoạt động bình thường.
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-stone-900">Điều 2. Thời hạn thuê</p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Thời hạn:{' '}
                            <strong>
                              {leaseMonths ? `${leaseMonths} tháng (` : ''}
                              từ ngày {formatContractDate(contractProperty.leaseStartDate)} đến hết ngày{' '}
                              {formatContractDate(contractProperty.leaseEndDate)}
                              {leaseMonths ? ')' : ''}
                            </strong>
                            .
                          </li>
                          <li>
                            Gia hạn: Hai bên trao đổi trước khi hết hạn hợp đồng ít nhất 30 ngày để ký phụ lục tiếp tục hoặc thanh lý bàn giao.
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-stone-900">
                          Điều 3. Giá thuê, Tiền đặt cọc và Thanh toán
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Giá thuê hàng tháng:{' '}
                            <strong>{formatContractCurrency(rentVal)} / tháng</strong>{' '}
                            <span className="italic text-stone-600">
                              (Bằng chữ: {numberToVietnameseWords(rentVal)})
                            </span>
                            . Không tăng giá trong suốt thời hạn hợp đồng.
                          </li>
                          <li>
                            Tiền đặt cọc bảo đảm:{' '}
                            <strong>{formatContractCurrency(depositVal)}</strong>{' '}
                            <span className="italic text-stone-600">
                              (Bằng chữ: {numberToVietnameseWords(depositVal)})
                            </span>
                            . Không tự ý cấn trừ vào tiền thuê tháng cuối nếu chưa có sự đồng ý của Bên A.
                          </li>
                          <li>
                            Đơn giá điện: <strong>{formatContractCurrency(contractProperty.electricityRate)} / kWh</strong>, đơn giá nước:{' '}
                            <strong>{formatContractCurrency(contractProperty.waterRate)} / m³</strong>, phí dịch vụ:{' '}
                            <strong>
                              {Number(contractProperty.serviceFee ?? 0) > 0
                                ? `${formatContractCurrency(contractProperty.serviceFee)} / tháng`
                                : 'Miễn phí'}
                            </strong>
                            .
                          </li>
                          <li>
                            Kỳ hạn thanh toán: Từ <strong>ngày 01 đến ngày 05 hàng tháng</strong> qua chuyển khoản hoặc tiền mặt có biên nhận.
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-stone-900">
                          Điều 4. Quyền và Nghĩa vụ của Bên A
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Bàn giao đúng hiện trạng, đảm bảo quyền sử dụng ổn định và riêng tư cho Bên B; thông báo trước khi cần kiểm tra hoặc sửa chữa (trừ tình huống khẩn cấp).
                          </li>
                          <li>
                            Giữ cố định giá thuê theo Điều 3, thông báo minh bạch chỉ số điện nước hàng tháng, hỗ trợ đăng ký tạm trú khi Bên B cung cấp đủ giấy tờ.
                          </li>
                          <li>
                            Bảo trì kết cấu chính, hệ thống điện nước âm tường, PCCC chung và hoàn trả 100% tiền cọc khi thanh lý đúng hạn.
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-stone-900">
                          Điều 5. Quyền và Nghĩa vụ của Bên B
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Thanh toán đúng hạn từ ngày 01 đến ngày 05 hàng tháng; cung cấp CCCD để khai báo tạm trú đầy đủ.
                          </li>
                          <li>
                            Giữ gìn vệ sinh, trật tự sau 22:00 giờ; không sang nhượng/cho thuê lại khi chưa có sự đồng ý bằng văn bản của Bên A.
                          </li>
                          <li>
                            Không tàng trữ chất cấm, chất cháy nổ; không tự ý đục phá kết cấu phòng và bồi thường nếu làm hư hỏng tài sản bàn giao do lỗi chủ quan.
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-stone-900">
                          Điều 6. Chấm dứt hợp đồng, Hoàn trả cọc và Vi phạm
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Bên muốn chấm dứt trước hạn phải báo trước tối thiểu <strong>30 ngày</strong> bằng văn bản/tin nhắn xác nhận.
                          </li>
                          <li>
                            Bên B tự ý bỏ hợp đồng hoặc trả phòng không báo trước đủ 30 ngày sẽ mất toàn bộ tiền cọc; Bên A đơn phương chấm dứt trái thỏa thuận phải hoàn cọc và bồi thường tương đương tiền cọc.
                          </li>
                          <li>
                            Khi kết thúc đúng hạn hoặc báo trước hợp lệ 30 ngày, Bên A kiểm tra hiện trạng, đối soát điện nước cuối kỳ và hoàn trả <strong>100% tiền đặt cọc</strong> trong vòng 03 ngày làm việc.
                          </li>
                          <li>
                            Nếu Bên B chậm thanh toán quá <strong>07 ngày</strong> sau hạn cuối hàng tháng mà không có lý do được chấp thuận, Bên A có quyền chấm dứt hợp đồng, thu hồi phòng và cấn trừ công nợ vào tiền cọc.
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-bold text-stone-900">
                          Điều 7. Điều khoản chung và Ghi chú bàn giao
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-1">
                          <li>
                            Mọi sửa đổi, bổ sung phải lập thành phụ lục văn bản; tranh chấp ưu tiên thương lượng hòa giải trước khi nhờ Tòa án có thẩm quyền giải quyết.
                          </li>
                          <li>
                            Hợp đồng lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản và có hiệu lực kể từ ngày ký.
                          </li>
                          {contractProperty.rentalNotes && (
                            <li className="text-stone-700 whitespace-pre-line">
                              Thỏa thuận &amp; ghi chú bàn giao: <strong>{contractProperty.rentalNotes}</strong>
                            </li>
                          )}
                        </ul>
                      </div>

                      <div className="grid grid-cols-2 gap-6 pt-5 mt-4 border-t border-stone-200 text-center">
                        <div className="pb-8">
                          <p className="font-bold text-stone-900">Đại diện Bên A (Bên cho thuê)</p>
                          <p className="text-xs italic text-stone-500">(Ký và ghi rõ họ tên)</p>
                        </div>
                        <div className="pb-8">
                          <p className="font-bold text-stone-900">Bên B (Bên thuê)</p>
                          <p className="text-xs italic text-stone-500">(Ký và ghi rõ họ tên)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setContractProperty(null)}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Đóng (Esc)
                  </button>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      id="btn-download-contract-doc"
                      onClick={() => void downloadRentalContractDoc(enrichedContract, contractSettings)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-800 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Tải file Word (.docx)</span>
                    </button>
                    <button
                      type="button"
                      id="btn-print-contract"
                      onClick={() => printRentalContract(enrichedContract, contractSettings)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4 shrink-0" />
                      <span>In hợp đồng / Xuất PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
