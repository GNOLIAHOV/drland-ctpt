import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Zap,
  Droplets,
  Check,
  Copy,
  Search,
  QrCode,
  Download,
  CreditCard,
  Image as ImageIcon,
  CalendarClock,
  ReceiptText,
  ChevronRight,
  Trash2,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  Banknote,
  Building2,
  MapPin,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import axiosClient from '../api/axiosClient';
import type { HouseItem, HouseSummary, PropertyItem } from './Properties';
import {
  getDueBillingProperties,
  calculateBillingPreview,
  type DueBillingCandidate,
} from '../utils/billing-automation';

export type BillingStatus = 'UNPAID' | 'PAID';

export interface PaymentConfig {
  bankCode: string;
  bankSlug: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

const POPULAR_BANKS = [
  { code: '971101', slug: 'zalopay', name: 'Ví điện tử ZaloPay (Mặc định)' },
  { code: '970422', slug: 'mbbank', name: 'MB Bank (Quân Đội)' },
  { code: '970436', slug: 'vietcombank', name: 'Vietcombank' },
  { code: '970407', slug: 'techcombank', name: 'Techcombank' },
  { code: '970415', slug: 'vietinbank', name: 'VietinBank' },
  { code: '970418', slug: 'bidv', name: 'BIDV' },
  { code: '970416', slug: 'acb', name: 'ACB' },
  { code: '970423', slug: 'tpbank', name: 'TPBank' },
  { code: '970432', slug: 'vpbank', name: 'VPBank' },
];

const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  bankCode: '971101',
  bankSlug: 'zalopay',
  bankName: 'Ví điện tử ZaloPay',
  accountNumber: '0943257089',
  accountName: 'VO HAI LONG',
};

const getVietQrUrl = (item: BillingItem, config: PaymentConfig): string => {
  const memo = `DRLAND ${item.property?.code || ''} T${item.periodMonth}`.trim();
  const encMemo = encodeURIComponent(memo);
  const encName = encodeURIComponent(config.accountName.trim());
  return `https://img.vietqr.io/image/${config.bankSlug}-${config.accountNumber}-compact2.png?amount=${item.totalAmount}&addInfo=${encMemo}&accountName=${encName}`;
};

export interface BillingItem {
  id: string;
  property: {
    id: string;
    code: string;
    name: string;
    type?: string;
    address?: string;
    houseId?: string | null;
    house?: HouseSummary | null;
    tenantName?: string | null;
    tenantPhone?: string | null;
  };
  periodMonth: number;
  periodYear: number;
  electricity: {
    oldIndex: number;
    newIndex: number;
    usage: number;
    rate: number;
    amount: number;
  };
  water: {
    oldIndex: number;
    newIndex: number;
    usage: number;
    rate: number;
    amount: number;
  };
  rentAmount: number;
  serviceFee: number;
  adjustmentAmount: number;
  adjustmentNote: string | null;
  totalAmount: number;
  status: BillingStatus;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
}

interface PaginatedBillingsResponse {
  data: BillingItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface BillingFormState {
  propertyId: string;
  periodMonth: string;
  periodYear: string;
  electricityOldIndex: string;
  electricityNewIndex: string;
  waterOldIndex: string;
  waterNewIndex: string;
  adjustmentAmount: string;
  adjustmentNote: string;
  note: string;
}

const now = new Date();
const defaultBillingForm: BillingFormState = {
  propertyId: '',
  periodMonth: String(now.getMonth() + 1),
  periodYear: String(now.getFullYear()),
  electricityOldIndex: '0',
  electricityNewIndex: '0',
  waterOldIndex: '0',
  waterNewIndex: '0',
  adjustmentAmount: '0',
  adjustmentNote: '',
  note: '',
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

const HIGH_ELEC_USAGE_THRESHOLD = 400;
const HIGH_WATER_USAGE_THRESHOLD = 30;

function getAnomalyWarning(elecUsage: number, waterUsage: number): string | null {
  const parts: string[] = [];
  if (elecUsage > HIGH_ELEC_USAGE_THRESHOLD) {
    parts.push(`điện ${elecUsage} kWh (> ${HIGH_ELEC_USAGE_THRESHOLD} kWh)`);
  }
  if (waterUsage > HIGH_WATER_USAGE_THRESHOLD) {
    parts.push(`nước ${waterUsage} m³ (> ${HIGH_WATER_USAGE_THRESHOLD} m³)`);
  }
  if (parts.length === 0) return null;
  return `Tiêu thụ cao đột biến (${parts.join(', ')}), vui lòng kiểm tra lại tránh gõ dư chữ số!`;
}

function getLatestReadingsForProperty(
  propertyId: string,
  allBillings: BillingItem[],
): { electricityOldIndex: number; waterOldIndex: number } {
  if (!propertyId) return { electricityOldIndex: 0, waterOldIndex: 0 };
  const latest = allBillings
    .filter((b) => b.property?.id === propertyId)
    .sort((a, b) => b.periodYear * 12 + b.periodMonth - (a.periodYear * 12 + a.periodMonth))[0];
  return {
    electricityOldIndex: latest?.electricity?.newIndex ?? 0,
    waterOldIndex: latest?.water?.newIndex ?? 0,
  };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export default function Billings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [billings, setBillings] = useState<BillingItem[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [houses, setHouses] = useState<HouseItem[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<string>(
    () => searchParams.get('houseId') || 'ALL',
  );
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Filters & Period State (Tự động đồng bộ kỳ tháng/năm hiện tại)
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState<BillingStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Danh sách các kỳ hóa đơn thực tế (chỉ các tháng có dữ liệu + tháng hiện tại)
  const availablePeriods = useMemo(() => {
    const periodSet = new Set<string>();
    const cur = new Date();
    const curM = cur.getMonth() + 1;
    const curY = cur.getFullYear();

    // 1. Luôn có Tháng hiện tại
    periodSet.add(`${curY}-${curM}`);

    // 2. Chỉ đưa vào các kỳ THỰC TẾ đã có hóa đơn trong dữ liệu
    for (const b of billings) {
      periodSet.add(`${b.periodYear}-${b.periodMonth}`);
    }

    // 3. Nếu người dùng đang chọn 1 kỳ hợp lệ nào đó thì giữ kỳ đó
    if (selectedMonth !== 'ALL') {
      periodSet.add(`${selectedYear}-${selectedMonth}`);
    }

    return Array.from(periodSet)
      .map((key) => {
        const [year, month] = key.split('-').map(Number);
        return { year, month };
      })
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  }, [billings, selectedMonth, selectedYear]);

  // Vị trí của kỳ đang chọn trong danh sách kỳ có sẵn
  const currentPeriodIndex = useMemo(() => {
    if (selectedMonth === 'ALL') return -1;
    return availablePeriods.findIndex(
      (p) => p.month === selectedMonth && p.year === selectedYear
    );
  }, [availablePeriods, selectedMonth, selectedYear]);

  // Có thể lùi về tháng cũ hơn không?
  const canGoPrev = currentPeriodIndex !== -1 && currentPeriodIndex < availablePeriods.length - 1;

  // Có thể tiến về tháng mới hơn không?
  const canGoNext = currentPeriodIndex > 0;

  const handlePrevMonth = () => {
    if (canGoPrev) {
      const target = availablePeriods[currentPeriodIndex + 1];
      if (target) {
        setSelectedMonth(target.month);
        setSelectedYear(target.year);
      }
    }
  };

  const handleNextMonth = () => {
    if (canGoNext) {
      const target = availablePeriods[currentPeriodIndex - 1];
      if (target) {
        setSelectedMonth(target.month);
        setSelectedYear(target.year);
      }
    }
  };

  const handleResetToCurrentMonth = () => {
    setSelectedMonth(currentMonth);
    setSelectedYear(currentYear);
  };

  const isCurrentPeriod = selectedMonth === currentMonth && selectedYear === currentYear;

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<BillingFormState>(defaultBillingForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // VietQR & Payment Config
  const [selectedQrBill, setSelectedQrBill] = useState<BillingItem | null>(null);
  const [modalPaymentMode, setModalPaymentMode] = useState<'TRANSFER' | 'CASH'>('TRANSFER');
  const [activeMsgMenuId, setActiveMsgMenuId] = useState<string | null>(null);
  const [copiedCashId, setCopiedCashId] = useState<string | null>(null);
  const [copiedTransferId, setCopiedTransferId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyingQrId, setCopyingQrId] = useState<string | null>(null);
  const [copiedQrId, setCopiedQrId] = useState<string | null>(null);

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(() => {
    try {
      const saved = localStorage.getItem('drland_payment_config');
      if (saved) return JSON.parse(saved) as PaymentConfig;
    } catch {
      // ignore
    }
    return DEFAULT_PAYMENT_CONFIG;
  });

  const [settingsForm, setSettingsForm] = useState<PaymentConfig>(paymentConfig);

  const handleSelectHouse = (houseId: string) => {
    setSelectedHouseId(houseId);
    const nextParams = new URLSearchParams(searchParams);
    if (houseId === 'ALL') {
      nextParams.delete('houseId');
    } else {
      nextParams.set('houseId', houseId);
    }
    setSearchParams(nextParams, { replace: true });
  };

  // Auto-Billing State (Giải pháp A: Tự động phát hiện phòng đến hạn trước 5 ngày)
  const dueCandidates = useMemo(() => {
    return getDueBillingProperties(properties, billings);
  }, [properties, billings]);

  // Chỉ hiển thị đề xuất cho kỳ đang xem và ngôi nhà đang chọn
  const currentPeriodCandidates = useMemo(() => {
    return dueCandidates.filter((c) => {
      if (selectedMonth !== 'ALL' && (c.periodMonth !== selectedMonth || c.periodYear !== selectedYear)) {
        return false;
      }
      if (selectedHouseId !== 'ALL' && c.houseId !== selectedHouseId) {
        return false;
      }
      return true;
    });
  }, [dueCandidates, selectedMonth, selectedYear, selectedHouseId]);

  const [isAutoBillingModalOpen, setIsAutoBillingModalOpen] = useState(false);
  const [autoBillingInputs, setAutoBillingInputs] = useState<
    Record<string, { elecNew: string; waterNew: string; adjustmentAmount: string; adjustmentNote: string; note: string }>
  >({});
  const [submittingCandidateId, setSubmittingCandidateId] = useState<string | null>(null);
  const [submittingAllCandidates, setSubmittingAllCandidates] = useState(false);
  const [batchModalError, setBatchModalError] = useState<string | null>(null);

  const batchSummary = useMemo(() => {
    let totalAmount = 0;
    let hasInvalidIndex = false;
    for (const c of currentPeriodCandidates) {
      const input = autoBillingInputs[c.propertyId] || {
        elecNew: String(c.lastElectricityIndex),
        waterNew: String(c.lastWaterIndex),
        adjustmentAmount: '0',
        adjustmentNote: '',
        note: '',
      };
      const elecVal = Number(input.elecNew);
      const waterVal = Number(input.waterNew);
      const adjVal = Number(input.adjustmentAmount || 0);
      if (input.elecNew === '' || input.waterNew === '' || isNaN(elecVal) || isNaN(waterVal) || isNaN(adjVal)) {
        hasInvalidIndex = true;
      }
      const preview = calculateBillingPreview(
        c,
        isNaN(elecVal) ? 0 : elecVal,
        isNaN(waterVal) ? 0 : waterVal,
        isNaN(adjVal) ? 0 : adjVal,
      );
      if (preview.hasIndexError || preview.totalAmount < 0) {
        hasInvalidIndex = true;
      }
      totalAmount += preview.totalAmount;
    }
    return { totalAmount, hasInvalidIndex };
  }, [currentPeriodCandidates, autoBillingInputs]);

  const openAutoBillingModal = () => {
    const initial: Record<
      string,
      { elecNew: string; waterNew: string; adjustmentAmount: string; adjustmentNote: string; note: string }
    > = {};
    for (const c of currentPeriodCandidates) {
      initial[c.propertyId] = {
        elecNew: autoBillingInputs[c.propertyId]?.elecNew ?? String(c.lastElectricityIndex),
        waterNew: autoBillingInputs[c.propertyId]?.waterNew ?? String(c.lastWaterIndex),
        adjustmentAmount: autoBillingInputs[c.propertyId]?.adjustmentAmount ?? '0',
        adjustmentNote: autoBillingInputs[c.propertyId]?.adjustmentNote ?? '',
        note: autoBillingInputs[c.propertyId]?.note ?? '',
      };
    }
    setAutoBillingInputs(initial);
    setBatchModalError(null);
    setIsAutoBillingModalOpen(true);
  };

  const handleEmitCandidateBilling = async (
    candidate: DueBillingCandidate,
    input: { elecNew: string; waterNew: string; adjustmentAmount: string; adjustmentNote: string; note: string }
  ) => {
    setSubmittingCandidateId(candidate.propertyId);
    setBatchModalError(null);
    setBannerError(null);
    setBannerSuccess(null);

    const adjNum = Number(input.adjustmentAmount || 0);
    const payload = {
      propertyId: candidate.propertyId,
      periodMonth: candidate.periodMonth,
      periodYear: candidate.periodYear,
      electricityOldIndex: candidate.lastElectricityIndex,
      electricityNewIndex: Number(input.elecNew),
      waterOldIndex: candidate.lastWaterIndex,
      waterNewIndex: Number(input.waterNew),
      adjustmentAmount: Number.isFinite(adjNum) ? adjNum : 0,
      adjustmentNote: input.adjustmentNote.trim() || undefined,
      note: input.note.trim() || undefined,
    };

    try {
      const res = await axiosClient.post<BillingItem>('/billings', payload);
      setBannerSuccess(
        `Đã lập và phát hành hóa đơn kỳ ${String(res.data.periodMonth).padStart(2, '0')}/${res.data.periodYear} cho phòng ${res.data.property.code} thành công!`
      );
      setSelectedMonth(res.data.periodMonth);
      setSelectedYear(res.data.periodYear);
      await fetchData();
    } catch (err: unknown) {
      const msg = extractErrorMessage(
        err,
        `Không thể phát hành hóa đơn cho phòng ${candidate.code}. Vui lòng kiểm tra lại.`
      );
      setBatchModalError(msg);
      setBannerError(msg);
    } finally {
      setSubmittingCandidateId(null);
    }
  };

  const handleEmitAllCandidates = async () => {
    if (currentPeriodCandidates.length === 0) return;
    if (batchSummary.hasInvalidIndex) {
      setBatchModalError('Vui lòng kiểm tra lại: chỉ số mới phải lớn hơn hoặc bằng chỉ số cũ ở tất cả các phòng.');
      return;
    }

    setSubmittingAllCandidates(true);
    setBatchModalError(null);
    setBannerError(null);
    setBannerSuccess(null);

    let successCount = 0;
    const failedMessages: string[] = [];
    let lastPeriod: { month: number; year: number } | null = null;

    for (const candidate of currentPeriodCandidates) {
      const input = autoBillingInputs[candidate.propertyId] || {
        elecNew: String(candidate.lastElectricityIndex),
        waterNew: String(candidate.lastWaterIndex),
        adjustmentAmount: '0',
        adjustmentNote: '',
        note: '',
      };
      const adjNum = Number(input.adjustmentAmount || 0);
      try {
        const res = await axiosClient.post<BillingItem>('/billings', {
          propertyId: candidate.propertyId,
          periodMonth: candidate.periodMonth,
          periodYear: candidate.periodYear,
          electricityOldIndex: candidate.lastElectricityIndex,
          electricityNewIndex: Number(input.elecNew),
          waterOldIndex: candidate.lastWaterIndex,
          waterNewIndex: Number(input.waterNew),
          adjustmentAmount: Number.isFinite(adjNum) ? adjNum : 0,
          adjustmentNote: input.adjustmentNote.trim() || undefined,
          note: input.note.trim() || undefined,
        });
        successCount += 1;
        lastPeriod = { month: res.data.periodMonth, year: res.data.periodYear };
      } catch (err: unknown) {
        failedMessages.push(
          `${candidate.code}: ${extractErrorMessage(err, 'Lỗi phát hành')}`
        );
      }
    }

    await fetchData();
    if (lastPeriod) {
      setSelectedMonth(lastPeriod.month);
      setSelectedYear(lastPeriod.year);
    }

    if (successCount > 0) {
      setBannerSuccess(`Đã phát hành hàng loạt thành công ${successCount}/${currentPeriodCandidates.length} hóa đơn!`);
    }
    if (failedMessages.length > 0) {
      const errText = `Một số phòng chưa phát hành được: ${failedMessages.join('; ')}`;
      setBatchModalError(errText);
      setBannerError(errText);
    } else {
      setIsAutoBillingModalOpen(false);
    }
    setSubmittingAllCandidates(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [billRes, propRes, houseRes, settingsRes] = await Promise.all([
        axiosClient.get<PaginatedBillingsResponse>('/billings', {
          params: { limit: 100 },
        }),
        axiosClient.get<{ data: PropertyItem[] }>('/properties', {
          params: { limit: 100 },
        }),
        axiosClient.get<HouseItem[]>('/houses'),
        axiosClient.get<Partial<PaymentConfig>>('/settings').catch(() => null),
      ]);
      setBillings(billRes.data.data || []);
      setProperties(propRes.data.data || []);
      setHouses(Array.isArray(houseRes.data) ? houseRes.data : []);
      if (settingsRes?.data?.accountNumber && settingsRes.data.bankSlug) {
        const synced: PaymentConfig = {
          bankCode: settingsRes.data.bankCode || DEFAULT_PAYMENT_CONFIG.bankCode,
          bankSlug: settingsRes.data.bankSlug,
          bankName: settingsRes.data.bankName || DEFAULT_PAYMENT_CONFIG.bankName,
          accountNumber: settingsRes.data.accountNumber,
          accountName: settingsRes.data.accountName || DEFAULT_PAYMENT_CONFIG.accountName,
        };
        setPaymentConfig(synced);
        setSettingsForm(synced);
        localStorage.setItem('drland_payment_config', JSON.stringify(synced));
      }
    } catch {
      setBannerError('Không thể tải dữ liệu hóa đơn từ máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  // Lắng nghe phím Escape để đóng nhanh mọi Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMsgMenuId(null);
        setSelectedQrBill(null);
        setIsSettingsOpen(false);
        if (!submittingCandidateId && !submittingAllCandidates) {
          setIsAutoBillingModalOpen(false);
        }
        if (!submitting) {
          setIsModalOpen(false);
          setFormError(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitting, submittingCandidateId, submittingAllCandidates]);

  const openCreateModal = () => {
    const scopedProps =
      selectedHouseId === 'ALL'
        ? properties
        : properties.filter((p) => (p.houseId || p.house?.id) === selectedHouseId);
    const defaultPropId = scopedProps[0]?.id ?? properties[0]?.id ?? '';
    const readings = getLatestReadingsForProperty(defaultPropId, billings);
    setForm({
      ...defaultBillingForm,
      propertyId: defaultPropId,
      periodMonth: selectedMonth === 'ALL' ? defaultBillingForm.periodMonth : String(selectedMonth),
      periodYear: selectedMonth === 'ALL' ? defaultBillingForm.periodYear : String(selectedYear),
      electricityOldIndex: String(readings.electricityOldIndex),
      electricityNewIndex: String(readings.electricityOldIndex),
      waterOldIndex: String(readings.waterOldIndex),
      waterNewIndex: String(readings.waterOldIndex),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (!submitting) {
      setIsModalOpen(false);
      setFormError(null);
    }
  };

  const handleCreateBilling = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setBannerError(null);
    setBannerSuccess(null);

    if (!form.propertyId) {
      setFormError('Vui lòng chọn phòng cần lập hóa đơn.');
      return;
    }

    const adjNum = Number(form.adjustmentAmount || 0);
    const payload = {
      propertyId: form.propertyId,
      periodMonth: Number(form.periodMonth),
      periodYear: Number(form.periodYear),
      electricityOldIndex: Number(form.electricityOldIndex),
      electricityNewIndex: Number(form.electricityNewIndex),
      waterOldIndex: Number(form.waterOldIndex),
      waterNewIndex: Number(form.waterNewIndex),
      adjustmentAmount: Number.isFinite(adjNum) ? adjNum : 0,
      adjustmentNote: form.adjustmentNote.trim() || undefined,
      note: form.note.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const res = await axiosClient.post<BillingItem>('/billings', payload);
      setBannerSuccess(
        `Đã lập hóa đơn kỳ ${String(res.data.periodMonth).padStart(2, '0')}/${res.data.periodYear} cho phòng ${res.data.property.code} (Tổng: ${formatVND(res.data.totalAmount)}).`,
      );
      setSelectedMonth(res.data.periodMonth);
      setSelectedYear(res.data.periodYear);
      setIsModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      setFormError(
        extractErrorMessage(
          err,
          'Không thể lập hóa đơn. Vui lòng kiểm tra lại chỉ số điện/nước hoặc kỳ hóa đơn.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (item: BillingItem) => {
    setBannerError(null);
    setBannerSuccess(null);

    const periodLabel = `${String(item.periodMonth).padStart(2, '0')}/${item.periodYear}`;
    const confirmed = window.confirm(
      `Xác nhận gạch nợ (đã thanh toán) hóa đơn kỳ ${periodLabel} của phòng "${item.property.code}" với số tiền ${formatVND(item.totalAmount)}?`,
    );
    if (!confirmed) return;

    setPayingId(item.id);
    try {
      const res = await axiosClient.patch<BillingItem>(
        `/billings/${item.id}/pay`,
      );
      setBillings((prev) =>
        prev.map((b) => (b.id === item.id ? res.data : b)),
      );
      setBannerSuccess(
        `Đã xác nhận thanh toán hóa đơn kỳ ${periodLabel} cho phòng ${item.property.code}.`,
      );
    } catch (err: unknown) {
      setBannerError(extractErrorMessage(err, 'Không thể cập nhật trạng thái thanh toán.'));
    } finally {
      setPayingId(null);
    }
  };

  const handleDeleteBilling = async (item: BillingItem) => {
    const periodLabel = `${String(item.periodMonth).padStart(2, '0')}/${item.periodYear}`;
    const confirmed = window.confirm(
      `Xác nhận hủy / xóa hóa đơn kỳ ${periodLabel} của phòng "${item.property.code}"?\n\nSau khi xóa, phòng này sẽ tự động xuất hiện lại trong danh sách đề xuất để bạn có thể lập lại hóa đơn mới nếu có nhầm lẫn chỉ số.`
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setBannerError(null);
    setBannerSuccess(null);
    try {
      await axiosClient.delete(`/billings/${item.id}`);
      setBannerSuccess(`Đã hủy / xóa thành công hóa đơn kỳ ${periodLabel} của phòng ${item.property.code}.`);
      await fetchData();
    } catch (err: unknown) {
      setBannerError(extractErrorMessage(err, 'Không thể xóa hóa đơn. Vui lòng thử lại.'));
    } finally {
      setDeletingId(null);
    }
  };

  // Tạo Phiếu Hóa Đơn Trọn Gói Kèm Mã VietQR Dạng Ảnh (Chuẩn hóa phiếu thu thực tế, không dùng icon/emoji AI)
  const generateInvoiceCardBlob = async (bill: BillingItem): Promise<Blob> => {
    const qrUrl = getVietQrUrl(bill, paymentConfig);
    const res = await axiosClient.get(
      `/billings/qr-proxy?url=${encodeURIComponent(qrUrl)}`,
      { responseType: 'blob' },
    );
    const svgBlob = res.data as Blob;
    const qrBlobUrl = URL.createObjectURL(svgBlob);

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    return new Promise((resolve, reject) => {
      const qrImg = new Image();
      qrImg.onload = () => {
        try {
          const W = 640;
          const hasService = bill.serviceFee > 0;
          const adjAmount = Number(bill.adjustmentAmount || 0);
          const hasAdjustment = adjAmount !== 0;
          const extraRows = (hasService ? 1 : 0) + (hasAdjustment ? 1 : 0);
          const H = 800 + extraRows * 28;
          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(qrBlobUrl);
            resolve(svgBlob);
            return;
          }

          // Nền tổng thể
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, W, H);

          // Khung viền phiếu Hóa Đơn
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(20, 20, W - 40, H - 40, 16);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Header Slate 900 trang trọng, chuyên nghiệp
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(20, 20, W - 40, 88, [16, 16, 0, 0]);
          ctx.fill();

          // Tiêu đề & thông tin thương hiệu
          const houseTitle = bill.property?.house?.name
            ? `HỆ THỐNG DRLAND - ${bill.property.house.name.toUpperCase()}`
            : 'HỆ THỐNG PHÒNG TRỌ & MẶT BẰNG DRLAND';
          const houseAddr =
            bill.property?.house?.address ||
            bill.property?.address ||
            'TP.HCM';
          const isCommercial = bill.property?.type === 'COMMERCIAL_SPACE';

          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 11px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(houseTitle, 40, 48);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(
            isCommercial
              ? 'GIẤY BÁO TIỀN MẶT BẰNG & ĐIỆN NƯỚC'
              : 'GIẤY BÁO TIỀN PHÒNG & ĐIỆN NƯỚC',
            40,
            73,
          );

          ctx.fillStyle = '#cbd5e1';
          ctx.font = 'normal 12px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(
            `Kỳ thanh toán: Tháng ${String(bill.periodMonth).padStart(2, '0')}/${bill.periodYear} - ${houseAddr}`,
            40,
            94,
          );

          // Khung thông tin phòng & khách thuê
          const barY = 122;
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(40, barY, W - 80, 50, 10);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#64748b';
          ctx.font = '11px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(isCommercial ? 'MẶT BẰNG THUÊ' : 'PHÒNG THUÊ', 54, barY + 20);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 15px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(
            `${bill.property?.code || ''} · ${bill.property?.name || ''}`,
            54,
            barY + 39,
          );

          if (bill.property?.tenantName) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#64748b';
            ctx.font = '11px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
            ctx.fillText('KHÁCH THUÊ', W - 54, barY + 20);

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 13px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
            ctx.fillText(
              bill.property.tenantPhone
                ? `${bill.property.tenantName} (${bill.property.tenantPhone})`
                : bill.property.tenantName,
              W - 54,
              barY + 39,
            );
            ctx.textAlign = 'left';
          }

          // Bảng kê chi tiết khoản thu
          let y = 194;
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 11px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText('CHI TIẾT KHOẢN THU', 40, y);
          ctx.textAlign = 'right';
          ctx.fillText('THÀNH TIỀN', W - 40, y);
          ctx.textAlign = 'left';

          ctx.strokeStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(40, y + 8);
          ctx.lineTo(W - 40, y + 8);
          ctx.stroke();

          y += 26;
          const items: [string, string][] = [
            ['Tiền thuê phòng:', formatVND(bill.rentAmount)],
            [
              `Tiền điện (${bill.electricity.usage} kWh: ${bill.electricity.oldIndex} → ${bill.electricity.newIndex}):`,
              formatVND(bill.electricity.amount),
            ],
            [
              `Tiền nước (${bill.water.usage} m³: ${bill.water.oldIndex} → ${bill.water.newIndex}):`,
              formatVND(bill.water.amount),
            ],
          ];
          if (hasService) {
            items.push(['Phí dịch vụ tòa nhà:', formatVND(bill.serviceFee)]);
          }
          if (hasAdjustment) {
            const adjPrefix = adjAmount > 0 ? 'Phụ thu phát sinh' : 'Giảm trừ';
            const adjSuffix = bill.adjustmentNote ? ` (${bill.adjustmentNote})` : '';
            const signedVal = `${adjAmount > 0 ? '+' : ''}${formatVND(adjAmount)}`;
            items.push([`${adjPrefix}${adjSuffix}:`, signedVal]);
          }

          for (const [label, val] of items) {
            ctx.fillStyle = '#334155';
            ctx.font = '13px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
            ctx.fillText(label, 40, y);

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 13px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(val, W - 40, y);
            ctx.textAlign = 'left';

            ctx.strokeStyle = '#f1f5f9';
            ctx.beginPath();
            ctx.moveTo(40, y + 8);
            ctx.lineTo(W - 40, y + 8);
            ctx.stroke();
            y += 28;
          }

          // Khung tổng tiền thanh toán
          y += 4;
          ctx.fillStyle = '#ecfdf5';
          ctx.beginPath();
          ctx.roundRect(40, y, W - 80, 46, 10);
          ctx.fill();
          ctx.strokeStyle = '#a7f3d0';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#065f46';
          ctx.font = 'bold 13px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText('TỔNG CỘNG THANH TOÁN:', 54, y + 28);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#047857';
          ctx.font = 'bold 19px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(formatVND(bill.totalAmount), W - 54, y + 30);
          ctx.textAlign = 'left';

          // Vùng mã VietQR
          const qrY = y + 56;
          const qrFrameW = 270;
          const qrX = (W - qrFrameW) / 2;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(qrX, qrY, qrFrameW, qrFrameW, 12);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.stroke();

          const qrSize = 250;
          ctx.drawImage(qrImg, qrX + 10, qrY + 10, qrSize, qrSize);

          // Khung thông tin tài khoản dưới QR
          const infoY = qrY + qrFrameW + 12;
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(40, infoY, W - 80, 54, 10);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.stroke();

          const memo = `DRLAND ${bill.property?.code || ''} T${bill.periodMonth}`.trim();
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(
            `Kênh nhận: ${paymentConfig.bankName} · STK: ${paymentConfig.accountNumber} (${paymentConfig.accountName})`,
            54,
            infoY + 23,
          );

          ctx.fillStyle = '#475569';
          ctx.font = 'normal 11px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.fillText(
            `Nội dung CK: ${memo} · Quét mã bằng ứng dụng Ngân hàng hoặc ZaloPay`,
            54,
            infoY + 42,
          );

          // Chân phiếu
          ctx.fillStyle = '#94a3b8';
          ctx.font = '11px "Be Vietnam Pro", system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            'Vui lòng kiểm tra lại chỉ số điện nước. Mọi thắc mắc xin liên hệ quản lý để được hỗ trợ.',
            W / 2,
            H - 32,
          );
          ctx.textAlign = 'left';

          URL.revokeObjectURL(qrBlobUrl);

          canvas.toBlob((pngBlob) => {
            if (pngBlob) {
              resolve(pngBlob);
            } else {
              resolve(svgBlob);
            }
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(qrBlobUrl);
          reject(err);
        }
      };
      qrImg.onerror = (e) => {
        URL.revokeObjectURL(qrBlobUrl);
        reject(e);
      };
      qrImg.src = qrBlobUrl;
    });
  };

  // Sao Chép Phiếu Hóa Đơn Trọn Gói Kèm QR (Chỉ 1 Click Là Dán Vào Zalo Xong Ngay)
  const handleCopyInvoiceSlip = async (bill: BillingItem) => {
    setBannerError(null);
    setBannerSuccess(null);
    setCopyingQrId(bill.id);
    try {
      const cardBlob = await generateInvoiceCardBlob(bill);

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        // Chỉ nạp image/png để Zalo PC / Zalo Web nhận diện là file ảnh và hiển thị trọn vẹn Phiếu Hóa Đơn kèm QR khi bấm Ctrl+V
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': cardBlob,
          }),
        ]);
        setCopiedQrId(bill.id);
        setTimeout(() => setCopiedQrId(null), 3000);
      } else {
        await handleDownloadInvoiceSlip(bill);
        setBannerSuccess('Đã tự động tải phiếu hóa đơn kèm mã QR về máy để bạn gửi Zalo.');
      }
    } catch {
      await handleDownloadInvoiceSlip(bill);
      setBannerError('Không thể copy tự động, đã tải phiếu hóa đơn về máy để bạn gửi qua Zalo.');
    } finally {
      setCopyingQrId(null);
    }
  };

  // Tải Phiếu Hóa Đơn Trọn Gói Về Máy (.png)
  const handleDownloadInvoiceSlip = async (bill: BillingItem) => {
    try {
      const cardBlob = await generateInvoiceCardBlob(bill);
      const blobUrl = URL.createObjectURL(cardBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `PhieuHoaDon_DRLAND_${bill.property?.code || 'PHONG'}_T${bill.periodMonth}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      setBannerSuccess(`Đã tải phiếu hóa đơn PhieuHoaDon_DRLAND_${bill.property?.code}_T${bill.periodMonth}.png về máy!`);
      setTimeout(() => setBannerSuccess(null), 3000);
    } catch {
      const url = getVietQrUrl(bill, paymentConfig);
      window.open(url, '_blank');
    }
  };

  // Tin nhắn thông báo tiền phòng / mặt bằng thu TIỀN MẶT (Không chứa STK/QR)
  const getFormattedCashMessage = (item: BillingItem): string => {
    const periodLabel = `${String(item.periodMonth).padStart(2, '0')}/${item.periodYear}`;
    const tenantGreeting = item.property?.tenantName
      ? `Chào bạn ${item.property.tenantName},`
      : 'Chào bạn,';
    const unitKind = item.property?.type === 'COMMERCIAL_SPACE' ? 'mặt bằng' : 'phòng';
    const houseSuffix = item.property?.house?.name ? ` (${item.property.house.name})` : '';

    const lines = [
      tenantGreeting,
      `DRLAND gửi bạn thông báo tiền ${unitKind} ${item.property?.code}${houseSuffix} kỳ tháng ${periodLabel}:`,
      '',
      `- Tiền ${unitKind}: ${formatVND(item.rentAmount)}`,
      `- Tiền điện: ${item.electricity.oldIndex} → ${item.electricity.newIndex} (${item.electricity.usage} kWh x ${formatVND(item.electricity.rate)}) = ${formatVND(item.electricity.amount)}`,
      `- Tiền nước: ${item.water.oldIndex} → ${item.water.newIndex} (${item.water.usage} m³ x ${formatVND(item.water.rate)}) = ${formatVND(item.water.amount)}`,
    ];

    if (item.serviceFee > 0) {
      lines.push(`- Phí dịch vụ: ${formatVND(item.serviceFee)}`);
    }
    if (Number(item.adjustmentAmount || 0) !== 0) {
      const adj = Number(item.adjustmentAmount);
      const label = adj > 0 ? 'Phụ thu phát sinh' : 'Giảm trừ';
      const noteText = item.adjustmentNote ? ` (${item.adjustmentNote})` : '';
      lines.push(`- ${label}${noteText}: ${adj > 0 ? '+' : ''}${formatVND(adj)}`);
    }

    lines.push(`=> Tổng cộng: ${formatVND(item.totalAmount)}`);
    lines.push('');
    lines.push('Kỳ này bên mình thu tiền mặt trực tiếp. Khi nào thuận tiện bạn nhắn giúp để quản lý ghé nhận nhé, hoặc bạn gửi cho quản lý tại cơ sở. Cảm ơn bạn!');

    return lines.join('\n');
  };

  // Tin nhắn thông báo tiền phòng / mặt bằng CHUYỂN KHOẢN
  const getFormattedTransferMessage = (item: BillingItem): string => {
    const periodLabel = `${String(item.periodMonth).padStart(2, '0')}/${item.periodYear}`;
    const tenantGreeting = item.property?.tenantName
      ? `Chào bạn ${item.property.tenantName},`
      : 'Chào bạn,';
    const unitKind = item.property?.type === 'COMMERCIAL_SPACE' ? 'mặt bằng' : 'phòng';
    const houseSuffix = item.property?.house?.name ? ` (${item.property.house.name})` : '';
    const memo = `DRLAND ${item.property?.code || ''} T${item.periodMonth}`.trim();

    const lines = [
      tenantGreeting,
      `DRLAND gửi bạn thông báo tiền ${unitKind} ${item.property?.code}${houseSuffix} kỳ tháng ${periodLabel}:`,
      '',
      `- Tiền ${unitKind}: ${formatVND(item.rentAmount)}`,
      `- Tiền điện: ${item.electricity.oldIndex} → ${item.electricity.newIndex} (${item.electricity.usage} kWh x ${formatVND(item.electricity.rate)}) = ${formatVND(item.electricity.amount)}`,
      `- Tiền nước: ${item.water.oldIndex} → ${item.water.newIndex} (${item.water.usage} m³ x ${formatVND(item.water.rate)}) = ${formatVND(item.water.amount)}`,
    ];

    if (item.serviceFee > 0) {
      lines.push(`- Phí dịch vụ: ${formatVND(item.serviceFee)}`);
    }
    if (Number(item.adjustmentAmount || 0) !== 0) {
      const adj = Number(item.adjustmentAmount);
      const label = adj > 0 ? 'Phụ thu phát sinh' : 'Giảm trừ';
      const noteText = item.adjustmentNote ? ` (${item.adjustmentNote})` : '';
      lines.push(`- ${label}${noteText}: ${adj > 0 ? '+' : ''}${formatVND(adj)}`);
    }

    lines.push(`=> Tổng cộng: ${formatVND(item.totalAmount)}`);
    lines.push('');
    lines.push('Thông tin chuyển khoản:');
    lines.push(`- Ngân hàng: ${paymentConfig.bankName}`);
    lines.push(`- Số tài khoản: ${paymentConfig.accountNumber}`);
    lines.push(`- Chủ tài khoản: ${paymentConfig.accountName}`);
    lines.push(`- Nội dung chuyển khoản: ${memo}`);
    lines.push('');
    lines.push('(Hoặc bạn quét mã QR trong ảnh gửi kèm để chuyển khoản nhanh nhé). Cảm ơn bạn!');

    return lines.join('\n');
  };

  const handleCopyCashMessage = (item: BillingItem) => {
    const textMsg = getFormattedCashMessage(item);
    void navigator.clipboard.writeText(textMsg);
    setCopiedCashId(item.id);
    setActiveMsgMenuId(null);
    setBannerSuccess(`Đã sao chép tin nhắn thu tiền mặt phòng ${item.property?.code}!`);
    setTimeout(() => setCopiedCashId(null), 2500);
    setTimeout(() => setBannerSuccess(null), 3000);
  };

  const handleCopyTransferMessage = (item: BillingItem) => {
    const textMsg = getFormattedTransferMessage(item);
    void navigator.clipboard.writeText(textMsg);
    setCopiedTransferId(item.id);
    setActiveMsgMenuId(null);
    setBannerSuccess(`Đã sao chép tin nhắn chuyển khoản phòng ${item.property?.code}!`);
    setTimeout(() => setCopiedTransferId(null), 2500);
    setTimeout(() => setBannerSuccess(null), 3000);
  };

  const handleCopyField = (text: string, fieldKey: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSavingSettings(true);
    const cleanPayload: PaymentConfig = {
      bankCode: settingsForm.bankCode,
      bankSlug: settingsForm.bankSlug.trim().toLowerCase(),
      bankName: settingsForm.bankName.trim(),
      accountNumber: settingsForm.accountNumber.trim(),
      accountName: settingsForm.accountName.trim().toUpperCase(),
    };

    try {
      const res = await axiosClient.patch<PaymentConfig>('/settings', cleanPayload);
      const savedConfig: PaymentConfig = {
        bankCode: res.data?.bankCode || cleanPayload.bankCode,
        bankSlug: res.data?.bankSlug || cleanPayload.bankSlug,
        bankName: res.data?.bankName || cleanPayload.bankName,
        accountNumber: res.data?.accountNumber || cleanPayload.accountNumber,
        accountName: res.data?.accountName || cleanPayload.accountName,
      };
      setPaymentConfig(savedConfig);
      setSettingsForm(savedConfig);
      localStorage.setItem('drland_payment_config', JSON.stringify(savedConfig));
      window.dispatchEvent(new CustomEvent('drland:settings-updated', { detail: res.data }));
      setIsSettingsOpen(false);
      setBannerSuccess('Đã lưu và đồng bộ thông tin tài khoản nhận tiền vào cơ sở dữ liệu!');
      setTimeout(() => setBannerSuccess(null), 3500);
    } catch (err: unknown) {
      setSettingsError(
        extractErrorMessage(err, 'Không thể lưu cấu hình tài khoản ngân hàng. Vui lòng kiểm tra lại.'),
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const periodBillings = useMemo(() => {
    if (selectedMonth === 'ALL') {
      return billings;
    }
    return billings.filter(
      (b) => b.periodMonth === selectedMonth && b.periodYear === selectedYear
    );
  }, [billings, selectedMonth, selectedYear]);

  // Hóa đơn theo kỳ VÀ theo Ngôi nhà đang chọn
  const houseScopedPeriodBillings = useMemo(() => {
    if (selectedHouseId === 'ALL') return periodBillings;
    return periodBillings.filter(
      (b) => (b.property?.houseId || b.property?.house?.id) === selectedHouseId,
    );
  }, [periodBillings, selectedHouseId]);

  // Tổng hợp thanh toán theo từng Ngôi nhà trong kỳ đang chọn (tách rõ Phòng trọ & Mặt bằng)
  const housePaymentSummaries = useMemo(() => {
    return houses.map((house) => {
      const hBillings = periodBillings.filter(
        (b) => (b.property?.houseId || b.property?.house?.id) === house.id,
      );
      const paidAmount = hBillings
        .filter((b) => b.status === 'PAID')
        .reduce((s, b) => s + (b.totalAmount || 0), 0);
      const unpaidAmount = hBillings
        .filter((b) => b.status === 'UNPAID')
        .reduce((s, b) => s + (b.totalAmount || 0), 0);
      const totalAmount = paidAmount + unpaidAmount;
      const roomBills = hBillings.filter((b) => b.property?.type !== 'COMMERCIAL_SPACE');
      const commercialBills = hBillings.filter((b) => b.property?.type === 'COMMERCIAL_SPACE');
      const roomRevenue = roomBills.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const commercialRevenue = commercialBills.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const dueInHouseCount = dueCandidates.filter((c) => {
        if (c.houseId !== house.id) return false;
        if (selectedMonth !== 'ALL' && (c.periodMonth !== selectedMonth || c.periodYear !== selectedYear)) {
          return false;
        }
        return true;
      }).length;

      return {
        house,
        billCount: hBillings.length,
        paidCount: hBillings.filter((b) => b.status === 'PAID').length,
        unpaidCount: hBillings.filter((b) => b.status === 'UNPAID').length,
        totalAmount,
        paidAmount,
        unpaidAmount,
        roomBillCount: roomBills.length,
        commercialBillCount: commercialBills.length,
        roomRevenue,
        commercialRevenue,
        dueCount: dueInHouseCount,
        progressPct: totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0,
      };
    });
  }, [houses, periodBillings, dueCandidates, selectedMonth, selectedYear]);

  const selectedHouseObj = useMemo(
    () => houses.find((h) => h.id === selectedHouseId) || null,
    [houses, selectedHouseId],
  );

  const filteredBillings = useMemo(() => {
    return houseScopedPeriodBillings
      .filter((item) => {
        if (statusFilter !== 'ALL' && item.status !== statusFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchCode = (item.property?.code || '').toLowerCase().includes(q);
          const matchName = (item.property?.name || '').toLowerCase().includes(q);
          const matchHouse = (item.property?.house?.name || '').toLowerCase().includes(q);
          const matchTenant = (item.property?.tenantName || '').toLowerCase().includes(q);
          if (!matchCode && !matchName && !matchHouse && !matchTenant) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'UNPAID' ? -1 : 1;
        }
        return 0;
      });
  }, [houseScopedPeriodBillings, statusFilter, searchQuery]);

  const singleModalPreview = useMemo(() => {
    const prop = properties.find((p) => p.id === form.propertyId);
    if (!prop) return null;
    const elecOld = Number(form.electricityOldIndex) || 0;
    const elecNew = Number(form.electricityNewIndex) || 0;
    const waterOld = Number(form.waterOldIndex) || 0;
    const waterNew = Number(form.waterNewIndex) || 0;
    const adjustmentAmount = Number(form.adjustmentAmount) || 0;
    const hasIndexError = elecNew < elecOld || waterNew < waterOld;
    const elecUsage = Math.max(0, elecNew - elecOld);
    const waterUsage = Math.max(0, waterNew - waterOld);
    const electricityAmount = elecUsage * (Number(prop.electricityRate) || 0);
    const waterAmount = waterUsage * (Number(prop.waterRate) || 0);
    const rentAmount = Number(prop.monthlyRent) || 0;
    const serviceFee = Number(prop.serviceFee) || 0;
    const totalAmount = rentAmount + serviceFee + electricityAmount + waterAmount + adjustmentAmount;
    const hasNegativeTotal = totalAmount < 0;
    const anomalyWarning = !hasIndexError ? getAnomalyWarning(elecUsage, waterUsage) : null;
    return {
      elecUsage,
      waterUsage,
      electricityAmount,
      waterAmount,
      rentAmount,
      serviceFee,
      adjustmentAmount,
      totalAmount,
      hasIndexError,
      hasNegativeTotal,
      anomalyWarning,
    };
  }, [
    properties,
    form.propertyId,
    form.electricityOldIndex,
    form.electricityNewIndex,
    form.waterOldIndex,
    form.waterNewIndex,
    form.adjustmentAmount,
  ]);

  const handleExportCsv = () => {
    if (filteredBillings.length === 0) return;

    const headers = [
      'Mã tòa nhà',
      'Tên tòa nhà',
      'Mã phòng',
      'Tên phòng',
      'Loại hình',
      'Khách thuê',
      'SĐT',
      'Kỳ thu',
      'Điện cũ',
      'Điện mới',
      'Tiêu thụ điện (kWh)',
      'Tiền điện (VNĐ)',
      'Nước cũ',
      'Nước mới',
      'Tiêu thụ nước (m3)',
      'Tiền nước (VNĐ)',
      'Tiền phòng (VNĐ)',
      'Phí dịch vụ (VNĐ)',
      'Phụ thu / Giảm trừ (VNĐ)',
      'Diễn giải phát sinh',
      'Tổng cộng (VNĐ)',
      'Trạng thái',
    ];

    const rows = filteredBillings.map((item) => [
      item.property?.house?.code || '',
      item.property?.house?.name || '',
      item.property?.code || '',
      item.property?.name || '',
      item.property?.type === 'COMMERCIAL_SPACE' ? 'Mặt bằng' : 'Phòng trọ',
      item.property?.tenantName || '',
      item.property?.tenantPhone || '',
      `T${String(item.periodMonth).padStart(2, '0')}/${item.periodYear}`,
      item.electricity.oldIndex,
      item.electricity.newIndex,
      item.electricity.usage,
      item.electricity.amount,
      item.water.oldIndex,
      item.water.newIndex,
      item.water.usage,
      item.water.amount,
      item.rentAmount,
      item.serviceFee,
      item.adjustmentAmount ?? 0,
      item.adjustmentNote || '',
      item.totalAmount,
      item.status === 'PAID' ? 'Đã thu' : 'Chưa thu',
    ]);

    const sumElec = filteredBillings.reduce((s, b) => s + (b.electricity.amount || 0), 0);
    const sumWater = filteredBillings.reduce((s, b) => s + (b.water.amount || 0), 0);
    const sumRent = filteredBillings.reduce((s, b) => s + (b.rentAmount || 0), 0);
    const sumService = filteredBillings.reduce((s, b) => s + (b.serviceFee || 0), 0);
    const sumAdjustment = filteredBillings.reduce((s, b) => s + (b.adjustmentAmount || 0), 0);
    const sumTotal = filteredBillings.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const sumPaid = filteredBillings
      .filter((b) => b.status === 'PAID')
      .reduce((s, b) => s + (b.totalAmount || 0), 0);
    const sumUnpaid = sumTotal - sumPaid;

    rows.push([
      'TỔNG CỘNG',
      `${filteredBillings.length} hóa đơn`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      sumElec,
      '',
      '',
      '',
      sumWater,
      sumRent,
      sumService,
      sumAdjustment,
      '',
      sumTotal,
      `Đã thu: ${sumPaid} | Còn nợ: ${sumUnpaid}`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');

    const houseSlug = selectedHouseObj ? selectedHouseObj.code : 'tat-ca-toa-nha';
    const periodSlug =
      selectedMonth === 'ALL'
        ? 'tat-ca-ky'
        : `T${String(selectedMonth).padStart(2, '0')}-${selectedYear}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-hoa-don-${houseSlug}-${periodSlug}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalPaid = useMemo(() => {
    return houseScopedPeriodBillings
      .filter((b) => b.status === 'PAID')
      .reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  }, [houseScopedPeriodBillings]);

  const totalUnpaid = useMemo(() => {
    return houseScopedPeriodBillings
      .filter((b) => b.status === 'UNPAID')
      .reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  }, [houseScopedPeriodBillings]);

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-stone-900">
            Quản Lý Hóa Đơn & Điện Nước
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Ghi chỉ số điện nước, tự động tính tổng tiền theo đơn giá niêm yết và theo dõi gạch nợ.
          </p>
        </div>

        <div className="flex items-center sm:justify-end gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => {
              setSettingsForm(paymentConfig);
              setSettingsError(null);
              setIsSettingsOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 active:scale-[0.98] text-stone-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            title="Cài đặt tài khoản ngân hàng / ZaloPay nhận tiền"
          >
            <CreditCard className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Tài khoản nhận ({paymentConfig.bankSlug.toUpperCase()})</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredBillings.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 active:scale-[0.98] text-stone-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            title="Xuất danh sách hóa đơn đang hiển thị ra file Excel (CSV)"
          >
            <Download className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Xuất Excel</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 active:scale-[0.98] text-stone-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-700 shrink-0 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Lập hóa đơn mới</span>
          </button>
        </div>
      </div>

      {/* Thanh Điều Hướng Kỳ Hóa Đơn (Tháng / Năm) */}
      <div className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs text-stone-500 font-medium block">Kỳ hóa đơn đang chọn</span>
          <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
            <span className="text-base sm:text-lg font-bold text-stone-900 tabular-nums whitespace-nowrap">
              {selectedMonth === 'ALL'
                ? 'Tất cả các kỳ'
                : `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`}
            </span>
            {isCurrentPeriod ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                Kỳ hiện tại
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResetToCurrentMonth}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                title="Quay lại tháng hiện tại"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Về tháng này</span>
              </button>
            )}
            <span className="text-xs text-stone-500 tabular-nums flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="whitespace-nowrap">{houseScopedPeriodBillings.length} hóa đơn,</span>
              <span className="whitespace-nowrap">
                Đã thu <strong className="text-emerald-700 font-semibold">{formatVND(totalPaid)}</strong>,
              </span>
              <span className="whitespace-nowrap">
                Còn nợ <strong className={totalUnpaid > 0 ? 'text-rose-700 font-semibold' : 'text-stone-600 font-semibold'}>{formatVND(totalUnpaid)}</strong>
              </span>
            </span>
          </div>
        </div>

        {/* Nút điều hướng tháng trước / tháng sau & Dropdown chọn nhanh kỳ (Vị trí cố định, không bị xê dịch) */}
        <div className="flex items-center gap-1.5 shrink-0 justify-start xl:justify-end">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={handlePrevMonth}
            className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border text-xs font-bold transition-colors shadow-2xs ${
              canGoPrev
                ? 'border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700 cursor-pointer'
                : 'border-stone-200/60 bg-stone-100/70 text-stone-300 cursor-not-allowed'
            }`}
            title={canGoPrev ? 'Xem kỳ trước đó' : 'Đã ở kỳ cũ nhất'}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Tháng trước</span>
          </button>

          {/* Dropdown danh sách tháng cố định độ rộng để các nút hai bên không bị xê dịch */}
          <div className="relative w-52 sm:w-56">
            <select
              value={selectedMonth === 'ALL' ? 'ALL' : `${selectedMonth}-${selectedYear}`}
              onChange={(e) => {
                if (e.target.value === 'ALL') {
                  setSelectedMonth('ALL');
                } else {
                  const [m, y] = e.target.value.split('-').map(Number);
                  setSelectedMonth(m);
                  setSelectedYear(y);
                }
              }}
              className="w-full px-3.5 py-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs hover:border-emerald-600"
            >
              {availablePeriods.map((p) => (
                <option key={`${p.month}-${p.year}`} value={`${p.month}-${p.year}`}>
                  Tháng {String(p.month).padStart(2, '0')}/{p.year}
                  {p.month === currentMonth && p.year === currentYear ? ' (Hiện tại)' : ''}
                </option>
              ))}
              <option value="ALL">Tất cả các kỳ</option>
            </select>
          </div>

          <button
            type="button"
            disabled={!canGoNext}
            onClick={handleNextMonth}
            className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border text-xs font-bold transition-colors shadow-2xs ${
              canGoNext
                ? 'border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700 cursor-pointer'
                : 'border-stone-200/60 bg-stone-100/70 text-stone-300 cursor-not-allowed'
            }`}
            title={canGoNext ? 'Xem kỳ mới hơn' : 'Đang ở kỳ mới nhất'}
          >
            <span className="hidden sm:inline">Tháng sau</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tổng hợp thanh toán theo từng Ngôi nhà trong kỳ đang chọn */}
      {houses.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-700" />
              <h2 className="text-xs font-bold text-stone-700">
                Tổng hợp thanh toán theo Tòa nhà ({selectedMonth === 'ALL' ? 'Tất cả các kỳ' : `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`})
              </h2>
            </div>
            {selectedHouseObj && (
              <button
                type="button"
                onClick={() => handleSelectHouse('ALL')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                Xem tất cả tòa nhà
              </button>
            )}
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 ${houses.length >= 3 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'} gap-3.5`}>
            {/* Card Tất cả tòa nhà */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectHouse('ALL')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectHouse('ALL');
                }
              }}
              className={`text-left rounded-xl border p-4 transition-colors cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                selectedHouseId === 'ALL'
                  ? 'bg-emerald-50/60 border-emerald-700 ring-1 ring-emerald-700 text-stone-900'
                  : 'bg-white border-stone-200 hover:border-emerald-300 text-stone-900'
              }`}
            >
              <div>
                <div className="text-[11px] font-medium text-stone-500">
                  Toàn bộ hệ thống
                </div>
                <div className={`text-base font-bold mt-0.5 ${selectedHouseId === 'ALL' ? 'text-emerald-900' : 'text-stone-900'}`}>
                  Tất cả các tòa nhà ({houses.length})
                </div>
                <div className="text-xs text-stone-500 mt-0.5 truncate">
                  Tổng hợp {periodBillings.length} hóa đơn trong kỳ
                </div>
                <div className="mt-2 text-xs text-stone-600 tabular-nums">
                  <span>{periodBillings.filter((b) => b.property?.type !== 'COMMERCIAL_SPACE').length} HĐ phòng trọ</span>
                  {periodBillings.some((b) => b.property?.type === 'COMMERCIAL_SPACE') && (
                    <span>
                      {', '}
                      <strong className="font-semibold text-amber-900">
                        {periodBillings.filter((b) => b.property?.type === 'COMMERCIAL_SPACE').length} HĐ mặt bằng
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-stone-200 space-y-1.5 text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Đã thu ({periodBillings.filter((b) => b.status === 'PAID').length}):</span>
                  <span className="font-bold text-emerald-700">
                    {formatVND(periodBillings.filter((b) => b.status === 'PAID').reduce((s, b) => s + (b.totalAmount || 0), 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Còn nợ ({periodBillings.filter((b) => b.status === 'UNPAID').length}):</span>
                  <span className="font-bold text-rose-700">
                    {formatVND(periodBillings.filter((b) => b.status === 'UNPAID').reduce((s, b) => s + (b.totalAmount || 0), 0))}
                  </span>
                </div>
                <div className="w-full h-1 rounded-full bg-stone-100 overflow-hidden mt-1">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{
                      width: `${
                        periodBillings.length > 0
                          ? Math.round(
                              (periodBillings.filter((b) => b.status === 'PAID').length /
                                periodBillings.length) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Card từng Ngôi nhà */}
            {housePaymentSummaries.map((summary) => {
              const isSelected = selectedHouseId === summary.house.id;
              return (
                <div
                  key={summary.house.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectHouse(summary.house.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectHouse(summary.house.id);
                    }
                  }}
                  className={`text-left rounded-xl border p-4 transition-colors cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    isSelected
                      ? 'bg-emerald-50/50 border-emerald-700 ring-1 ring-emerald-700'
                      : 'bg-white border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono text-[11px] font-semibold ${isSelected ? 'text-emerald-800' : 'text-stone-500'}`}>
                        {summary.house.code}
                      </span>
                      {summary.dueCount > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 tabular-nums">
                          {summary.dueCount} đến kỳ thu
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-stone-900 mt-1 truncate">
                      {summary.house.name}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 min-w-0">
                      <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                      <span className="truncate">{summary.house.address}</span>
                    </div>
                    <div className="mt-2 text-xs text-stone-600 tabular-nums">
                      <span>{summary.roomBillCount} HĐ phòng trọ</span>
                      {summary.commercialBillCount > 0 && (
                        <span>
                          {', '}
                          <strong className="font-semibold text-amber-900">{summary.commercialBillCount} HĐ mặt bằng</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-200 space-y-1.5 text-xs tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">Đã thu ({summary.paidCount}):</span>
                      <span className="font-bold text-emerald-700">{formatVND(summary.paidAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">Còn nợ ({summary.unpaidCount}):</span>
                      <span className={`font-bold ${summary.unpaidAmount > 0 ? 'text-rose-600' : 'text-stone-400'}`}>
                        {formatVND(summary.unpaidAmount)}
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-stone-100 overflow-hidden mt-1">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${summary.progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Banners */}
      {bannerError && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
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
        <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-800">
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

      {/* Banner Đề xuất lập hóa đơn chu kỳ thu tiền */}
      {currentPeriodCandidates.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl bg-amber-50/70 border border-amber-200 border-l-4 border-l-amber-600 p-4 text-xs sm:text-sm">
          <div>
            <div className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2 flex-wrap">
              <CalendarClock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Đề xuất lập hóa đơn chu kỳ thu tiền</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 tabular-nums">
                {currentPeriodCandidates.length} phòng đến kỳ
              </span>
            </div>
            <p className="text-stone-700 text-xs sm:text-sm mt-1">
              Có <strong>{currentPeriodCandidates.length} phòng đang thuê</strong> đã đến hạn đóng tiền hoặc sắp đến hạn trong vòng 5 ngày tới. Hệ thống đã tự động kế thừa chỉ số cũ và đơn giá, bạn chỉ cần nhập số điện nước mới để phát hành.
            </p>
          </div>
          <button
            type="button"
            id="btn-open-auto-billing-modal"
            onClick={openAutoBillingModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 active:bg-amber-900 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm transition-colors shrink-0 cursor-pointer whitespace-nowrap"
          >
            <ReceiptText className="w-4 h-4 shrink-0" />
            <span>Chốt số ({currentPeriodCandidates.length} phòng)</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      )}

      {/* Bộ lọc & Tìm kiếm */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
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
            Tất cả ({houseScopedPeriodBillings.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('UNPAID')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
              statusFilter === 'UNPAID'
                ? 'bg-rose-700 text-white'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            Chưa thanh toán ({houseScopedPeriodBillings.filter((b) => b.status === 'UNPAID').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PAID')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              statusFilter === 'PAID'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Đã thanh toán ({houseScopedPeriodBillings.filter((b) => b.status === 'PAID').length})
          </button>
        </div>

        {/* Ô Tìm kiếm theo phòng / mặt bằng / nhà */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mã phòng, mặt bằng, tòa nhà…"
            className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 focus:bg-white text-stone-900 rounded-xl border border-stone-200 focus:border-emerald-600 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Bảng danh sách Hóa đơn */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-700">
                <th className="py-3 px-2.5 whitespace-nowrap">Mã phòng &amp; Kỳ</th>
                <th className="py-3 px-2.5 whitespace-nowrap">Điện &amp; Nước (Chỉ số &amp; Tiền)</th>
                <th className="py-3 px-2.5 whitespace-nowrap">Tổng tiền</th>
                <th className="py-3 px-2.5 whitespace-nowrap">Trạng thái</th>
                <th className="py-3 px-2.5 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400">
                    Đang tải danh sách hóa đơn…
                  </td>
                </tr>
              ) : filteredBillings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-500">
                    <p className="font-semibold text-stone-700">
                      {selectedMonth !== 'ALL'
                        ? `Chưa có hóa đơn nào được lập trong kỳ Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}.`
                        : 'Không tìm thấy hóa đơn nào phù hợp.'}
                    </p>
                    {dueCandidates.length > 0 && isCurrentPeriod && (
                      <p className="mt-2 text-xs text-amber-800 font-medium">
                        Gợi ý: Đang có <strong>{dueCandidates.length} phòng đến kỳ thu tiền</strong> ở bảng đề xuất phía trên, bạn có thể bấm &ldquo;Chốt số &amp; Phát hành&rdquo; để lập nhanh.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredBillings.map((item) => {
                  const isPaid = item.status === 'PAID';
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-stone-50/80 transition-colors"
                    >
                      {/* Cột 1: Mã phòng & Kỳ thu */}
                      <td className="py-3 px-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-emerald-800 text-sm font-mono">
                            {item.property?.code}
                          </span>
                          <span className="text-xs font-semibold text-stone-600 tabular-nums">
                            T{String(item.periodMonth).padStart(2, '0')}/{item.periodYear}
                          </span>
                          {item.property?.type === 'COMMERCIAL_SPACE' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-semibold">
                              Mặt bằng
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-600 mt-0.5 truncate max-w-[180px]">
                          {item.property?.name}
                        </div>
                        {item.property?.house && (
                          <div className="text-[11px] text-stone-500 truncate max-w-[180px]">
                            {item.property.house.name}
                          </div>
                        )}
                        {item.property?.tenantName && (
                          <div className="text-[11px] font-semibold text-emerald-700 mt-0.5 truncate max-w-[180px]">
                            Khách: {item.property.tenantName}
                          </div>
                        )}
                      </td>

                      {/* Cột 2: Điện & Nước gộp gọn gàng 2 dòng */}
                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <div className="space-y-1 text-xs tabular-nums text-stone-700">
                          <div className="flex items-center justify-between gap-2.5">
                            <span>
                              <span className="text-stone-500">Điện:</span>{' '}
                              {item.electricity.oldIndex}&rarr;{item.electricity.newIndex} ({item.electricity.usage} kWh)
                            </span>
                            <strong className="text-stone-900 font-semibold">{formatVND(item.electricity.amount)}</strong>
                          </div>
                          <div className="flex items-center justify-between gap-2.5">
                            <span>
                              <span className="text-stone-500">Nước:</span>{' '}
                              {item.water.oldIndex}&rarr;{item.water.newIndex} ({item.water.usage} m³)
                            </span>
                            <strong className="text-stone-900 font-semibold">{formatVND(item.water.amount)}</strong>
                          </div>
                        </div>
                      </td>

                      {/* Cột 3: Tổng tiền */}
                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <div className="font-extrabold text-sm text-stone-900 tabular-nums">
                          {formatVND(item.totalAmount)}
                        </div>
                        <div className="text-[11px] text-stone-500 tabular-nums">
                          Thuê: {formatVND(item.rentAmount)}
                        </div>
                        {item.serviceFee > 0 && (
                          <div className="text-[11px] text-stone-500 tabular-nums">
                            Dịch vụ: {formatVND(item.serviceFee)}
                          </div>
                        )}
                        {Number(item.adjustmentAmount || 0) !== 0 && (
                          <div
                            className={`text-[11px] font-medium tabular-nums truncate max-w-[190px] ${
                              item.adjustmentAmount > 0 ? 'text-amber-800' : 'text-emerald-700'
                            }`}
                            title={item.adjustmentNote || undefined}
                          >
                            {item.adjustmentAmount > 0 ? 'Phát sinh: +' : 'Giảm trừ: '}
                            {formatVND(item.adjustmentAmount)}
                            {item.adjustmentNote ? ` (${item.adjustmentNote})` : ''}
                          </div>
                        )}
                      </td>

                      {/* Cột 4: Trạng thái */}
                      <td className="py-3 px-2 whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            ✓ Đã thu
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                            Chưa thu
                          </span>
                        )}
                      </td>

                      {/* Cột 5: Thao tác */}
                      <td className="py-3 px-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1 min-w-[205px]">
                          <button
                            type="button"
                            disabled={copyingQrId === item.id}
                            onClick={() => void handleCopyInvoiceSlip(item)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white hover:bg-stone-50 active:bg-stone-100 active:scale-95 text-stone-800 border border-stone-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                            title="Sao chép Phiếu Hóa Đơn có sẵn mã QR (Dán Ctrl+V vào Zalo)"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                            <span>
                              {copyingQrId === item.id
                                ? 'Đang tạo…'
                                : copiedQrId === item.id
                                  ? '✓ Đã copy!'
                                  : 'Ảnh Zalo'}
                            </span>
                          </button>

                          {/* Nút Copy tin nhắn nhanh (Tiền mặt / Chuyển khoản) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveMsgMenuId(activeMsgMenuId === item.id ? null : item.id)
                              }
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-95 text-stone-700 border border-stone-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                              title="Sao chép tin nhắn gửi khách thuê"
                            >
                              <Copy className="w-3.5 h-3.5 text-stone-500" />
                              <span>
                                {copiedCashId === item.id
                                  ? '✓ Đã chép'
                                  : copiedTransferId === item.id
                                    ? '✓ Đã chép'
                                    : 'Copy tin'}
                              </span>
                              <ChevronDown className="w-3 h-3 text-stone-400" />
                            </button>

                            {activeMsgMenuId === item.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-20"
                                  onClick={() => setActiveMsgMenuId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-md border border-stone-200 p-1.5 z-30 text-xs text-left">
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleCopyCashMessage(item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleCopyCashMessage(item);
                                      }
                                    }}
                                    className="w-full text-left p-2.5 hover:bg-emerald-50 rounded-lg flex items-start gap-2.5 text-stone-800 font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  >
                                    <Banknote className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-stone-900 text-xs">Tin nhắn thu tiền mặt</div>
                                      <div className="text-[11px] text-stone-500 mt-0.5">Không kèm STK, hẹn nộp tại phòng</div>
                                    </div>
                                  </div>

                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleCopyTransferMessage(item)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleCopyTransferMessage(item);
                                      }
                                    }}
                                    className="w-full text-left p-2.5 hover:bg-stone-50 rounded-lg flex items-start gap-2.5 text-stone-800 font-medium cursor-pointer transition-colors mt-0.5 border-t border-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  >
                                    <CreditCard className="w-4 h-4 text-stone-600 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-stone-900 text-xs">Tin nhắn chuyển khoản</div>
                                      <div className="text-[11px] text-stone-500 mt-0.5">Kèm STK và nội dung chuyển khoản</div>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedQrBill(item);
                              setModalPaymentMode('TRANSFER');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-95 text-stone-700 border border-stone-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                            title="Xem chi tiết hóa đơn, mã VietQR hoặc hướng dẫn thu tiền mặt"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Mã QR</span>
                          </button>

                          {!isPaid ? (
                            <button
                              type="button"
                              disabled={payingId === item.id}
                              onClick={() => void handleMarkAsPaid(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-95 disabled:bg-emerald-400 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>
                                {payingId === item.id ? 'Đang lưu…' : 'Gạch nợ'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-stone-400 font-medium px-2 py-1">
                              ✓ Xong
                            </span>
                          )}

                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => void handleDeleteBilling(item)}
                            className="inline-flex items-center justify-center p-1.5 rounded-xl border border-stone-200 text-stone-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 active:bg-rose-100 active:scale-95 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                            title="Hủy / Xóa hóa đơn này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal Lập hóa đơn mới */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-stone-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  Lập Hóa Đơn Điện Nước & Tiền Phòng
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">Tính toán tự động theo đơn giá niêm yết của phòng</p>
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

            <form onSubmit={handleCreateBilling} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Chọn phòng lập hóa đơn *
                </label>
                <select
                  required
                  value={form.propertyId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const readings = getLatestReadingsForProperty(nextId, billings);
                    setForm({
                      ...form,
                      propertyId: nextId,
                      electricityOldIndex: String(readings.electricityOldIndex),
                      electricityNewIndex: String(readings.electricityOldIndex),
                      waterOldIndex: String(readings.waterOldIndex),
                      waterNewIndex: String(readings.waterOldIndex),
                    });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                >
                  <option value="">-- Chọn phòng / mặt bằng --</option>
                  {properties
                    .filter((p) => selectedHouseId === 'ALL' || (p.houseId || p.house?.id) === selectedHouseId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.house?.code ? `[${p.house.code}] ` : ''}
                        {p.type === 'COMMERCIAL_SPACE' ? 'Mặt bằng ' : 'Phòng '}
                        {p.code} - {p.name} ({formatVND(p.monthlyRent)}/tháng)
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Tháng kỳ thu (1-12) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={form.periodMonth}
                    onChange={(e) =>
                      setForm({ ...form, periodMonth: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Năm *
                  </label>
                  <input
                    type="number"
                    required
                    min={2020}
                    max={2050}
                    value={form.periodYear}
                    onChange={(e) =>
                      setForm({ ...form, periodYear: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Chỉ số điện CŨ *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={form.electricityOldIndex}
                    onChange={(e) =>
                      setForm({ ...form, electricityOldIndex: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Chỉ số điện MỚI *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={form.electricityNewIndex}
                    onChange={(e) =>
                      setForm({ ...form, electricityNewIndex: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Chỉ số nước CŨ *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={form.waterOldIndex}
                    onChange={(e) =>
                      setForm({ ...form, waterOldIndex: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Chỉ số nước MỚI *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={form.waterNewIndex}
                    onChange={(e) =>
                      setForm({ ...form, waterNewIndex: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-800">
                    Phụ thu / Giảm trừ phát sinh (Tùy chọn)
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, adjustmentAmount: '0', adjustmentNote: '' })
                      }
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white hover:bg-stone-100 text-stone-600 border border-stone-200 cursor-pointer"
                    >
                      0 đ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          adjustmentAmount: '100000',
                          adjustmentNote:
                            !form.adjustmentNote ||
                            form.adjustmentNote === 'Khấu trừ chi phí sửa chữa'
                              ? 'Phụ thu gửi thêm xe / phát sinh'
                              : form.adjustmentNote,
                        })
                      }
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer"
                    >
                      +100.000 đ (Phụ phí)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          adjustmentAmount: '-100000',
                          adjustmentNote:
                            !form.adjustmentNote ||
                            form.adjustmentNote === 'Phụ thu gửi thêm xe / phát sinh'
                              ? 'Khấu trừ chi phí sửa chữa'
                              : form.adjustmentNote,
                        })
                      }
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                    >
                      -100.000 đ (Giảm trừ)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Số tiền phát sinh / giảm trừ (VNĐ)
                    </label>
                    <input
                      type="number"
                      step={1000}
                      value={form.adjustmentAmount}
                      onChange={(e) =>
                        setForm({ ...form, adjustmentAmount: e.target.value })
                      }
                      placeholder="VD: 150000 hoặc -100000"
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:border-emerald-600 font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Diễn giải lý do phát sinh
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={form.adjustmentNote}
                      onChange={(e) =>
                        setForm({ ...form, adjustmentNote: e.target.value })
                      }
                      placeholder="VD: Thêm 1 xe máy / Trừ tiền sửa bóng đèn"
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Ghi chú (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="VD: Thu tiền trước ngày 05 hàng tháng"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              {singleModalPreview && (
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-y-1 text-stone-600 tabular-nums">
                    <span>Tiền phòng:</span>
                    <span className="text-right font-semibold text-stone-900">{formatVND(singleModalPreview.rentAmount)}</span>
                    <span>Điện ({singleModalPreview.elecUsage} kWh):</span>
                    <span className="text-right font-semibold text-stone-900">{formatVND(singleModalPreview.electricityAmount)}</span>
                    <span>Nước ({singleModalPreview.waterUsage} m³):</span>
                    <span className="text-right font-semibold text-stone-900">{formatVND(singleModalPreview.waterAmount)}</span>
                    {singleModalPreview.serviceFee > 0 && (
                      <>
                        <span>Phí dịch vụ:</span>
                        <span className="text-right font-semibold text-stone-900">{formatVND(singleModalPreview.serviceFee)}</span>
                      </>
                    )}
                    {singleModalPreview.adjustmentAmount !== 0 && (
                      <>
                        <span>
                          {singleModalPreview.adjustmentAmount > 0 ? 'Phụ thu phát sinh:' : 'Giảm trừ phát sinh:'}
                        </span>
                        <span
                          className={`text-right font-semibold ${
                            singleModalPreview.adjustmentAmount > 0 ? 'text-amber-800' : 'text-emerald-700'
                          }`}
                        >
                          {singleModalPreview.adjustmentAmount > 0 ? '+' : ''}
                          {formatVND(singleModalPreview.adjustmentAmount)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-sm font-bold text-emerald-800 tabular-nums">
                    <span>Tổng thanh toán dự kiến:</span>
                    <span>{formatVND(singleModalPreview.totalAmount)}</span>
                  </div>
                  {singleModalPreview.hasIndexError && (
                    <div className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Chỉ số mới không được nhỏ hơn chỉ số cũ!</span>
                    </div>
                  )}
                  {singleModalPreview.hasNegativeTotal && (
                    <div className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Khoản giảm trừ vượt quá tổng tiền hóa đơn!</span>
                    </div>
                  )}
                  {singleModalPreview.anomalyWarning && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-medium flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>{singleModalPreview.anomalyWarning}</span>
                    </div>
                  )}
                </div>
              )}

              </div>

              <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    Boolean(singleModalPreview?.hasIndexError) ||
                    Boolean(singleModalPreview?.hasNegativeTotal)
                  }
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] disabled:bg-emerald-400 text-white text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap"
                >
                  {submitting ? 'Đang tính toán…' : 'Lập hóa đơn ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Thông Báo & Thanh Toán (Chuyển khoản VietQR hoặc Thu tiền mặt) */}
      {selectedQrBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4"
          onClick={() => setSelectedQrBill(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
                  <ReceiptText className="w-5 h-5 text-emerald-700" />
                  <span>Thông báo &amp; Thanh toán</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {selectedQrBill.property?.type === 'COMMERCIAL_SPACE' ? 'Mặt bằng' : 'Phòng'} {selectedQrBill.property?.code}, Kỳ {String(selectedQrBill.periodMonth).padStart(2, '0')}/{selectedQrBill.periodYear}
                  {selectedQrBill.property?.house?.name ? ` - ${selectedQrBill.property.house.name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQrBill(null)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-95 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thanh chuyển đổi hình thức: Chuyển khoản vs Thu tiền mặt */}
            <div className="px-6 pt-3.5 pb-3 bg-stone-50 border-b border-stone-200">
              <div className="grid grid-cols-2 gap-2 bg-stone-200/80 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setModalPaymentMode('TRANSFER')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    modalPaymentMode === 'TRANSFER'
                      ? 'bg-white text-stone-900 shadow-xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-blue-700" />
                  <span>Chuyển khoản (VietQR)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalPaymentMode('CASH')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    modalPaymentMode === 'CASH'
                      ? 'bg-white text-stone-900 shadow-xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Thu tiền mặt</span>
                </button>
              </div>
            </div>

            {/* Thân Modal */}
            <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
              {modalPaymentMode === 'TRANSFER' ? (
                <>
                  {/* Chế độ Chuyển khoản: Mã VietQR */}
                  <div className="flex flex-col items-center justify-center bg-stone-50 p-3 rounded-2xl border border-stone-200">
                    <img
                      src={getVietQrUrl(selectedQrBill, paymentConfig)}
                      alt={`VietQR ${selectedQrBill.property?.code}`}
                      className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-xl bg-white p-2 shadow-xs border border-stone-200"
                    />
                    <div className="mt-2 text-center">
                      <span className="text-[11px] font-medium text-stone-600">
                        Quét bằng ứng dụng Ngân hàng hoặc ví ZaloPay
                      </span>
                    </div>
                  </div>

                  {/* Chi tiết thông tin chuyển khoản */}
                  <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                      <span className="text-stone-500">Ngân hàng nhận:</span>
                      <span className="font-semibold text-stone-900">{paymentConfig.bankName}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                      <span className="text-stone-500">Số tài khoản / SĐT:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-stone-900 text-sm">
                          {paymentConfig.accountNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyField(paymentConfig.accountNumber, 'stk')}
                          className="p-1 text-stone-500 hover:text-emerald-700 active:scale-90 cursor-pointer"
                          title="Sao chép số tài khoản"
                        >
                          {copiedField === 'stk' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                      <span className="text-stone-500">Chủ tài khoản:</span>
                      <span className="font-semibold text-stone-900">{paymentConfig.accountName}</span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                      <span className="text-stone-500">Số tiền cần đóng:</span>
                      <span className="font-extrabold text-sm sm:text-base text-emerald-800">
                        {formatVND(selectedQrBill.totalAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">Nội dung chuyển:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-stone-900">
                          DRLAND {selectedQrBill.property?.code} T{selectedQrBill.periodMonth}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyField(
                              `DRLAND ${selectedQrBill.property?.code} T${selectedQrBill.periodMonth}`,
                              'nd',
                            )
                          }
                          className="p-1 text-stone-500 hover:text-emerald-700 active:scale-90 cursor-pointer"
                          title="Sao chép nội dung chuyển khoản"
                        >
                          {copiedField === 'nd' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Hành động Chuyển khoản */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      disabled={copyingQrId === selectedQrBill.id}
                      onClick={() => void handleCopyInvoiceSlip(selectedQrBill)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>
                        {copyingQrId === selectedQrBill.id
                          ? 'Đang tạo phiếu ảnh…'
                          : copiedQrId === selectedQrBill.id
                            ? '✓ Đã copy ảnh! Mở Zalo dán (Ctrl+V) ngay'
                            : 'Sao chép ảnh phiếu gửi Zalo'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyTransferMessage(selectedQrBill)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-[0.98] text-stone-800 font-semibold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Copy className="w-4 h-4 text-stone-600 shrink-0" />
                      <span>Chép tin chuyển khoản</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDownloadInvoiceSlip(selectedQrBill)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-stone-200 hover:bg-stone-50 active:bg-stone-100 active:scale-[0.98] text-stone-700 font-medium text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Tải phiếu hóa đơn (.png)</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Chế độ Thu Tiền Mặt */}
                  <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
                      <span className="text-stone-600">Tiền thuê phòng:</span>
                      <span className="font-semibold text-stone-900">{formatVND(selectedQrBill.rentAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
                      <span className="text-stone-600">
                        Tiền điện ({selectedQrBill.electricity.usage} kWh):
                      </span>
                      <span className="font-semibold text-stone-900">{formatVND(selectedQrBill.electricity.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
                      <span className="text-stone-600">
                        Tiền nước ({selectedQrBill.water.usage} m³):
                      </span>
                      <span className="font-semibold text-stone-900">{formatVND(selectedQrBill.water.amount)}</span>
                    </div>
                    {selectedQrBill.serviceFee > 0 && (
                      <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
                        <span className="text-stone-600">Phí dịch vụ:</span>
                        <span className="font-semibold text-stone-900">{formatVND(selectedQrBill.serviceFee)}</span>
                      </div>
                    )}
                    {Number(selectedQrBill.adjustmentAmount || 0) !== 0 && (
                      <div className="flex items-center justify-between pb-1.5 border-b border-stone-200">
                        <span className="text-stone-600">
                          {selectedQrBill.adjustmentAmount > 0 ? 'Phụ thu phát sinh' : 'Giảm trừ'}
                          {selectedQrBill.adjustmentNote ? ` (${selectedQrBill.adjustmentNote})` : ''}:
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${
                            selectedQrBill.adjustmentAmount > 0 ? 'text-amber-800' : 'text-emerald-700'
                          }`}
                        >
                          {selectedQrBill.adjustmentAmount > 0 ? '+' : ''}
                          {formatVND(selectedQrBill.adjustmentAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-bold text-stone-900 text-xs">Tổng tiền mặt cần thu:</span>
                      <span className="font-extrabold text-base text-emerald-800">
                        {formatVND(selectedQrBill.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Thông báo hướng dẫn thu trực tiếp */}
                  <div className="bg-emerald-50/70 rounded-xl p-2.5 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
                    <Banknote className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <span className="font-bold">Hình thức thu tiền mặt:</span> Quản lý thu trực tiếp tại phòng và bấm &ldquo;Gạch nợ&rdquo; sau khi đã nhận tiền. Bạn có thể gửi tin nhắn bên dưới để khách chuẩn bị tiền trước.
                    </div>
                  </div>

                  {/* Hộp xem trước tin nhắn gửi khách */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-stone-700">Xem trước tin nhắn gửi khách:</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs text-stone-800 font-sans whitespace-pre-line leading-relaxed select-all max-h-36 overflow-y-auto">
                      {getFormattedCashMessage(selectedQrBill)}
                    </div>
                  </div>

                  {/* Hành động Thu tiền mặt */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCopyCashMessage(selectedQrBill)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Chép tin thu tiền mặt</span>
                    </button>
                  </div>
                </>
              )}

              {/* Nút đóng modal chung */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedQrBill(null)}
                  className="w-full py-2 px-4 rounded-xl border border-stone-200 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] text-stone-600 font-semibold text-xs transition-colors cursor-pointer text-center whitespace-nowrap"
                >
                  Đóng cửa sổ (Esc)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cài Đặt Tài Khoản Nhận Tiền */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-stone-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-700" />
                  <span>Cài Đặt Nhận Tiền Thanh Toán</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">Dùng để sinh mã VietQR và mẫu tin nhắn Zalo</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-95 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {settingsError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{settingsError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Kênh / Ngân hàng nhận tiền
                </label>
                <select
                  value={settingsForm.bankCode}
                  onChange={(e) => {
                    const found = POPULAR_BANKS.find((b) => b.code === e.target.value);
                    if (found) {
                      setSettingsForm({
                        ...settingsForm,
                        bankCode: found.code,
                        bankSlug: found.slug,
                        bankName: found.name,
                      });
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 cursor-pointer font-medium"
                >
                  {POPULAR_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Số tài khoản / Số điện thoại liên kết ZaloPay
                </label>
                <input
                  type="text"
                  required
                  value={settingsForm.accountNumber}
                  onChange={(e) => setSettingsForm({ ...settingsForm, accountNumber: e.target.value.trim() })}
                  placeholder="VD: 0943257089"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Tên chủ tài khoản (Viết hoa không dấu)
                </label>
                <input
                  type="text"
                  required
                  value={settingsForm.accountName}
                  onChange={(e) => setSettingsForm({ ...settingsForm, accountName: e.target.value.toUpperCase() })}
                  placeholder="VD: VO HAI LONG"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-bold"
                />
              </div>

              </div>

              <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 active:bg-stone-200 active:scale-[0.98] text-xs sm:text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-[0.98] disabled:bg-emerald-400 text-white text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap"
                >
                  {savingSettings ? 'Đang lưu…' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL LẬP HÓA ĐƠN HÀNG LOẠT KIỂU BẢNG NHANH (EXCEL GRID) */}
      {isAutoBillingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-3 sm:p-4"
          onClick={() => {
            if (!submittingCandidateId && !submittingAllCandidates) {
              setIsAutoBillingModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-stone-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-amber-200/80 bg-amber-50/70 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2 flex-wrap">
                  <CalendarClock className="w-5 h-5 text-amber-700 shrink-0" />
                  <span>Chốt Số &amp; Phát Hành Hóa Đơn Hàng Loạt</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 tabular-nums">
                    {currentPeriodCandidates.length} phòng đến kỳ
                  </span>
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Nhập nhanh chỉ số điện/nước mới theo hàng (nhấn Tab để nhảy ô), hệ thống tự tính tiền và cảnh báo số bất thường.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!submittingCandidateId && !submittingAllCandidates) {
                    setIsAutoBillingModalOpen(false);
                  }
                }}
                disabled={Boolean(submittingCandidateId || submittingAllCandidates)}
                className="w-8 h-8 rounded-full bg-white hover:bg-stone-100 active:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer border border-stone-200 disabled:opacity-50"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Candidate Grid */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {batchModalError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm text-rose-800">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{batchModalError}</span>
                </div>
              )}

              {currentPeriodCandidates.length === 0 ? (
                <div className="text-center py-8 text-stone-500 text-sm">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="font-bold text-stone-800">Tất cả các phòng đang thuê đã được lập hóa đơn đầy đủ cho kỳ này.</p>
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-stone-700 font-bold">
                        <th className="py-3 px-3">Phòng / Tòa nhà &amp; Khách</th>
                        <th className="py-3 px-3 whitespace-nowrap">Tiền thuê &amp; DV</th>
                        <th className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5 text-amber-600" />
                            <span>Điện (Số cũ ➔ Mới)</span>
                          </span>
                        </th>
                        <th className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="w-3.5 h-3.5 text-sky-600" />
                            <span>Nước (Số cũ ➔ Mới)</span>
                          </span>
                        </th>
                        <th className="py-3 px-3 text-right whitespace-nowrap">Tổng &amp; Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {currentPeriodCandidates.map((candidate) => {
                        const input = autoBillingInputs[candidate.propertyId] || {
                          elecNew: String(candidate.lastElectricityIndex),
                          waterNew: String(candidate.lastWaterIndex),
                          adjustmentAmount: '0',
                          adjustmentNote: '',
                          note: '',
                        };
                        const preview = calculateBillingPreview(
                          candidate,
                          Number(input.elecNew) || 0,
                          Number(input.waterNew) || 0,
                          Number(input.adjustmentAmount) || 0,
                        );
                        const hasNegativeTotal = preview.totalAmount < 0;
                        const anomalyWarning = !preview.hasIndexError
                          ? getAnomalyWarning(preview.elecUsage, preview.waterUsage)
                          : null;
                        const isSubmittingThis = submittingCandidateId === candidate.propertyId;

                        return (
                          <tr key={candidate.propertyId} className="hover:bg-amber-50/20 align-top">
                            {/* Cột 1: Phòng & Khách */}
                            <td className="py-3 px-3 min-w-[200px]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  {candidate.code}
                                </span>
                                <span className="font-semibold text-stone-900">
                                  T{candidate.periodMonth}/{candidate.periodYear}
                                </span>
                                {candidate.type === 'COMMERCIAL_SPACE' && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold">
                                    Mặt bằng
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-stone-600 mt-1 font-medium line-clamp-1">
                                {candidate.houseName || candidate.name}
                              </div>
                              <div className="text-[11px] text-stone-500 mt-0.5">
                                Khách: <strong className="text-stone-800">{candidate.tenantName || 'N/A'}</strong>
                              </div>
                              <div className="mt-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    candidate.isOverdue
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                      : candidate.diffDays === 0
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-stone-100 text-stone-700 border border-stone-200'
                                  }`}
                                >
                                  {candidate.isOverdue
                                    ? `Quá hạn ${Math.abs(candidate.diffDays)} ngày`
                                    : candidate.diffDays === 0
                                    ? 'Đến hạn hôm nay'
                                    : `Hạn ngày ${candidate.dueDay} (còn ${candidate.diffDays}d)`}
                                </span>
                              </div>
                            </td>

                            {/* Cột 2: Tiền thuê, DV & Phát sinh */}
                            <td className="py-3 px-3 whitespace-nowrap tabular-nums text-stone-700 min-w-[175px]">
                              <div className="font-semibold text-stone-900">
                                Thuê: {formatVND(preview.rentAmount)}
                              </div>
                              {preview.serviceFee > 0 && (
                                <div className="text-[11px] text-stone-500 mt-0.5">
                                  DV: {formatVND(preview.serviceFee)}
                                </div>
                              )}
                              <div className="text-[10px] text-stone-400 mt-0.5">
                                Điện {formatVND(candidate.electricityRate)} · Nước {formatVND(candidate.waterRate)}
                              </div>
                              <div className="mt-2 pt-1.5 border-t border-stone-100 space-y-1">
                                <input
                                  type="number"
                                  step={1000}
                                  value={input.adjustmentAmount}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAutoBillingInputs((prev) => ({
                                      ...prev,
                                      [candidate.propertyId]: { ...input, adjustmentAmount: val },
                                    }));
                                  }}
                                  disabled={submittingAllCandidates}
                                  placeholder="Phụ thu / trừ (±đ)"
                                  title="Nhập số dương để phụ thu (vd 100000) hoặc số âm để giảm trừ (vd -50000)"
                                  className="w-36 px-2 py-1 rounded-md border border-stone-300 bg-white font-semibold text-xs text-stone-800 tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-600"
                                />
                                <input
                                  type="text"
                                  maxLength={120}
                                  value={input.adjustmentNote}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAutoBillingInputs((prev) => ({
                                      ...prev,
                                      [candidate.propertyId]: { ...input, adjustmentNote: val },
                                    }));
                                  }}
                                  disabled={submittingAllCandidates}
                                  placeholder="Lý do phát sinh…"
                                  className="w-36 block px-2 py-1 rounded-md border border-stone-200 bg-stone-50 text-[11px] text-stone-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
                                />
                              </div>
                            </td>

                            {/* Cột 3: Điện */}
                            <td className="py-3 px-3 min-w-[165px]">
                              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mb-1">
                                <span>Cũ: <strong className="font-mono text-stone-800">{candidate.lastElectricityIndex}</strong></span>
                                <span>➔</span>
                              </div>
                              <input
                                type="number"
                                min={candidate.lastElectricityIndex}
                                value={input.elecNew}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAutoBillingInputs((prev) => ({
                                    ...prev,
                                    [candidate.propertyId]: { ...input, elecNew: val },
                                  }));
                                }}
                                disabled={submittingAllCandidates}
                                className="w-28 px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white font-mono font-bold text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                placeholder={`>= ${candidate.lastElectricityIndex}`}
                              />
                              <div className="text-[11px] text-stone-500 mt-1 tabular-nums">
                                {preview.elecUsage} kWh · <strong className="text-amber-900">{formatVND(preview.electricityAmount)}</strong>
                              </div>
                            </td>

                            {/* Cột 4: Nước */}
                            <td className="py-3 px-3 min-w-[165px]">
                              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mb-1">
                                <span>Cũ: <strong className="font-mono text-stone-800">{candidate.lastWaterIndex}</strong></span>
                                <span>➔</span>
                              </div>
                              <input
                                type="number"
                                min={candidate.lastWaterIndex}
                                value={input.waterNew}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAutoBillingInputs((prev) => ({
                                    ...prev,
                                    [candidate.propertyId]: { ...input, waterNew: val },
                                  }));
                                }}
                                disabled={submittingAllCandidates}
                                className="w-28 px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white font-mono font-bold text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                placeholder={`>= ${candidate.lastWaterIndex}`}
                              />
                              <div className="text-[11px] text-stone-500 mt-1 tabular-nums">
                                {preview.waterUsage} m³ · <strong className="text-sky-900">{formatVND(preview.waterAmount)}</strong>
                              </div>
                            </td>

                            {/* Cột 5: Tổng & Thao tác */}
                            <td className="py-3 px-3 text-right min-w-[175px]">
                              <div className="text-sm font-extrabold text-emerald-800 tabular-nums">
                                {formatVND(preview.totalAmount)}
                              </div>

                              {preview.hasIndexError && (
                                <p className="text-[11px] font-bold text-rose-600 mt-1">
                                  Số mới &lt; số cũ!
                                </p>
                              )}

                              {hasNegativeTotal && (
                                <p className="text-[11px] font-bold text-rose-600 mt-1">
                                  Giảm trừ vượt tổng tiền!
                                </p>
                              )}

                              {anomalyWarning && (
                                <div className="flex items-start gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1 text-left">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                  <span>{anomalyWarning}</span>
                                </div>
                              )}

                              <button
                                type="button"
                                disabled={
                                  preview.hasIndexError ||
                                  hasNegativeTotal ||
                                  isSubmittingThis ||
                                  submittingAllCandidates ||
                                  !input.elecNew ||
                                  !input.waterNew
                                }
                                onClick={() => void handleEmitCandidateBilling(candidate, input)}
                                className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {isSubmittingThis ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                                    <span>Đang lập…</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Phát hành</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-stone-600 tabular-nums">
                {currentPeriodCandidates.length > 0 ? (
                  <span>
                    Tổng dự kiến ({currentPeriodCandidates.length} phòng):{' '}
                    <strong className="text-sm font-bold text-emerald-800">
                      {formatVND(batchSummary.totalAmount)}
                    </strong>
                  </span>
                ) : (
                  <span>Sau khi phát hành, hóa đơn tự động có mã VietQR để gửi khách qua Zalo.</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 justify-end">
                <button
                  type="button"
                  disabled={Boolean(submittingCandidateId || submittingAllCandidates)}
                  onClick={() => setIsAutoBillingModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 active:bg-stone-200 text-stone-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Đóng
                </button>
                {currentPeriodCandidates.length > 0 && (
                  <button
                    type="button"
                    disabled={
                      batchSummary.hasInvalidIndex ||
                      submittingAllCandidates ||
                      Boolean(submittingCandidateId)
                    }
                    onClick={() => void handleEmitAllCandidates()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {submittingAllCandidates ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="whitespace-nowrap">
                      {submittingAllCandidates
                        ? 'Đang phát hành…'
                        : `Phát hành tất cả (${currentPeriodCandidates.length} phòng)`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
