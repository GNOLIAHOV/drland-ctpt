export interface BillingPropertyInput {
  id: string;
  code: string;
  name: string;
  type?: string;
  houseId?: string | null;
  house?: {
    id: string;
    code: string;
    name: string;
    address: string;
  } | null;
  status: string;
  monthlyRent: number;
  serviceFee: number;
  electricityRate: number;
  waterRate: number;
  tenantName?: string | null;
  tenantPhone?: string | null;
  leaseStartDate?: string | null;
}

export interface ExistingBillingInput {
  id: string;
  property?: {
    id: string;
    code?: string;
  } | null;
  periodMonth: number;
  periodYear: number;
  electricity?: {
    newIndex: number;
  };
  water?: {
    newIndex: number;
  };
  createdAt?: string;
}

export interface DueBillingCandidate {
  propertyId: string;
  code: string;
  name: string;
  type?: string;
  houseId?: string | null;
  houseCode?: string | null;
  houseName?: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  dueDay: number;
  dueDate: string; // YYYY-MM-DD
  diffDays: number; // số ngày còn lại đến hạn (<= 5; 0: hôm nay; < 0: quá hạn)
  isOverdue: boolean;
  periodMonth: number;
  periodYear: number;
  monthlyRent: number;
  serviceFee: number;
  electricityRate: number;
  waterRate: number;
  lastElectricityIndex: number;
  lastWaterIndex: number;
}

/**
 * Trả về ngày cuối cùng của một tháng bất kỳ
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Phân tích danh sách phòng đang thuê và tìm các phòng cần lập hóa đơn
 * (Đến hạn trong vòng 5 ngày tới hoặc đã quá hạn của kỳ hiện tại mà chưa lập hóa đơn).
 */
export function getDueBillingProperties(
  properties: BillingPropertyInput[],
  billings: ExistingBillingInput[],
  referenceDate: Date = new Date()
): DueBillingCandidate[] {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1; // 1-12
  const refDay = referenceDate.getDate();
  const refMidnight = new Date(refYear, referenceDate.getMonth(), refDay).getTime();

  const results: DueBillingCandidate[] = [];

  for (const property of properties) {
    if (property.status !== 'RENTED') {
      continue;
    }

    // 1. Xác định ngày đến hạn thanh toán trong tháng (dueDay)
    let dueDay = 5; // Mặc định ngày 5 hàng tháng nếu không có ngày hợp đồng
    if (property.leaseStartDate && property.leaseStartDate.length >= 10) {
      const parsedDay = parseInt(property.leaseStartDate.slice(8, 10), 10);
      if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
        dueDay = parsedDay;
      }
    }

    // 2. Kiểm tra kỳ tháng hiện tại (refMonth, refYear)
    const maxDayInCurMonth = getDaysInMonth(refYear, refMonth);
    const clampedCurDueDay = Math.min(dueDay, maxDayInCurMonth);
    const curDueMidnight = new Date(refYear, refMonth - 1, clampedCurDueDay).getTime();
    const curDiffDays = Math.round((curDueMidnight - refMidnight) / (1000 * 60 * 60 * 24));

    // Kiểm tra xem phòng đã có hóa đơn kỳ này chưa
    const hasCurBilling = billings.some(
      (b) =>
        b.property?.id === property.id &&
        b.periodMonth === refMonth &&
        b.periodYear === refYear
    );

    // Tìm hóa đơn gần nhất của phòng để lấy chỉ số điện/nước cũ
    const propBillings = billings
      .filter((b) => b.property?.id === property.id)
      .sort((a, b) => {
        const valA = a.periodYear * 12 + a.periodMonth;
        const valB = b.periodYear * 12 + b.periodMonth;
        return valB - valA;
      });

    const latestBilling = propBillings[0];
    const lastElectricityIndex = latestBilling?.electricity?.newIndex ?? 0;
    const lastWaterIndex = latestBilling?.water?.newIndex ?? 0;

    let targetPeriodMonth = refMonth;
    let targetPeriodYear = refYear;
    let targetDiffDays = curDiffDays;
    let targetDueDateStr = `${refYear}-${String(refMonth).padStart(2, '0')}-${String(clampedCurDueDay).padStart(2, '0')}`;
    let isCandidate = false;

    if (!hasCurBilling) {
      // Chưa lập hóa đơn kỳ này
      if (curDiffDays <= 5) {
        // Đến hạn trong 5 ngày tới, hôm nay, hoặc đã quá hạn của kỳ này
        isCandidate = true;
      }
    } else {
      // Đã có hóa đơn kỳ này, kiểm tra xem có sắp đến hạn kỳ sau (tháng tới) trong 5 ngày tới không
      let nextMonth = refMonth + 1;
      let nextYear = refYear;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      const maxDayInNextMonth = getDaysInMonth(nextYear, nextMonth);
      const clampedNextDueDay = Math.min(dueDay, maxDayInNextMonth);
      const nextDueMidnight = new Date(nextYear, nextMonth - 1, clampedNextDueDay).getTime();
      const nextDiffDays = Math.round((nextDueMidnight - refMidnight) / (1000 * 60 * 60 * 24));

      const hasNextBilling = billings.some(
        (b) =>
          b.property?.id === property.id &&
          b.periodMonth === nextMonth &&
          b.periodYear === nextYear
      );

      if (!hasNextBilling && nextDiffDays <= 5) {
        targetPeriodMonth = nextMonth;
        targetPeriodYear = nextYear;
        targetDiffDays = nextDiffDays;
        targetDueDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedNextDueDay).padStart(2, '0')}`;
        isCandidate = true;
      }
    }

    if (isCandidate) {
      results.push({
        propertyId: property.id,
        code: property.code,
        name: property.name,
        type: property.type || 'ROOM',
        houseId: property.houseId || property.house?.id || null,
        houseCode: property.house?.code || null,
        houseName: property.house?.name || null,
        tenantName: property.tenantName ?? null,
        tenantPhone: property.tenantPhone ?? null,
        dueDay,
        dueDate: targetDueDateStr,
        diffDays: targetDiffDays,
        isOverdue: targetDiffDays < 0,
        periodMonth: targetPeriodMonth,
        periodYear: targetPeriodYear,
        monthlyRent: Number(property.monthlyRent) || 0,
        serviceFee: Number(property.serviceFee) || 0,
        electricityRate: Number(property.electricityRate) || 0,
        waterRate: Number(property.waterRate) || 0,
        lastElectricityIndex,
        lastWaterIndex,
      });
    }
  }

  // Sắp xếp: ưu tiên các phòng đã quá hạn trước, sau đó đến các phòng sát ngày đến hạn nhất
  results.sort((a, b) => a.diffDays - b.diffDays);

  return results;
}

export interface BillingPreviewResult {
  elecUsage: number;
  waterUsage: number;
  electricityAmount: number;
  waterAmount: number;
  rentAmount: number;
  serviceFee: number;
  adjustmentAmount: number;
  totalAmount: number;
  hasIndexError: boolean;
}

/**
 * Tính toán số tiền và kiểm tra chỉ số mới theo thời gian thực
 */
export function calculateBillingPreview(
  candidate: DueBillingCandidate,
  newElectricityIndex: number,
  newWaterIndex: number,
  adjustmentAmount = 0,
): BillingPreviewResult {
  const hasIndexError =
    newElectricityIndex < candidate.lastElectricityIndex ||
    newWaterIndex < candidate.lastWaterIndex;

  const elecUsage = Math.max(0, newElectricityIndex - candidate.lastElectricityIndex);
  const waterUsage = Math.max(0, newWaterIndex - candidate.lastWaterIndex);

  const electricityAmount = elecUsage * candidate.electricityRate;
  const waterAmount = waterUsage * candidate.waterRate;
  const rentAmount = candidate.monthlyRent;
  const serviceFee = candidate.serviceFee;
  const normalizedAdjustment = Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0;
  const totalAmount = rentAmount + serviceFee + electricityAmount + waterAmount + normalizedAdjustment;

  return {
    elecUsage,
    waterUsage,
    electricityAmount,
    waterAmount,
    rentAmount,
    serviceFee,
    adjustmentAmount: normalizedAdjustment,
    totalAmount,
    hasIndexError,
  };
}
