export interface ExpiringLeaseInfo {
  propertyId: string;
  code: string;
  name: string;
  tenantName: string | null;
  tenantPhone: string | null;
  leaseEndDate: string;
  diffDays: number; // số ngày còn lại (âm nếu đã quá hạn)
  isOverdue: boolean;
}

export interface CandidateProperty {
  id: string;
  code: string;
  name: string;
  status: string;
  availableFrom?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantCitizenId?: string | null;
  depositPaid?: number | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  rentalNotes?: string | null;
}

export interface HandoverPropertyInfo {
  propertyId: string;
  code: string;
  name: string;
  tenantName: string | null;
  tenantPhone: string | null;
  tenantCitizenId: string | null;
  depositPaid: number | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  availableFrom: string;
  diffDays: number; // số ngày so với hôm nay (<= 0 tức là hôm nay hoặc đã quá hạn)
  isOverdue: boolean; // diffDays < 0
}

const toLocalDayUtcTimestamp = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Phân tích danh sách phòng để tìm các phòng đang thuê (RENTED)
 * có hợp đồng kết thúc trong vòng 30 ngày tới hoặc đã quá hạn.
 */
export function getExpiringRentedProperties(
  properties: CandidateProperty[],
  referenceDate: Date = new Date()
): ExpiringLeaseInfo[] {
  const refMidnight = toLocalDayUtcTimestamp(referenceDate);

  const results: ExpiringLeaseInfo[] = [];

  for (const property of properties) {
    if (property.status !== 'RENTED' || !property.leaseEndDate) {
      continue;
    }

    // Parse YYYY-MM-DD an toàn
    const parts = property.leaseEndDate.slice(0, 10).split('-');
    if (parts.length !== 3) {
      continue;
    }

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const endMidnight = Date.UTC(year, month, day);
    if (isNaN(endMidnight)) {
      continue;
    }

    const diffDays = Math.round((endMidnight - refMidnight) / (1000 * 60 * 60 * 24));

    // Thỏa mãn khi còn <= 30 ngày (bao gồm cả các phòng đã chạm hoặc quá hạn)
    if (diffDays <= 30) {
      results.push({
        propertyId: property.id,
        code: property.code,
        name: property.name,
        tenantName: property.tenantName ?? null,
        tenantPhone: property.tenantPhone ?? null,
        leaseEndDate: property.leaseEndDate.slice(0, 10),
        diffDays,
        isOverdue: diffDays <= 0,
      });
    }
  }

  // Sắp xếp ưu tiên các phòng đã quá hạn và các phòng sắp hết hạn sớm nhất lên đầu
  results.sort((a, b) => a.diffDays - b.diffDays);

  return results;
}

/**
 * Cộng thêm số tháng vào một ngày định dạng YYYY-MM-DD
 */
export function addMonthsToDate(dateStr: string | null | undefined, months: number): string {
  let base: Date;
  if (dateStr && dateStr.trim()) {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      base = new Date(Date.UTC(y, m + months, d));
    } else {
      base = new Date();
      base.setMonth(base.getMonth() + months);
    }
  } else {
    base = new Date();
    base.setMonth(base.getMonth() + months);
  }
  return base.toISOString().slice(0, 10);
}

/**
 * Tính số ngày còn lại đến hạn (âm nếu đã quá hạn)
 */
export function getDaysRemaining(
  dateStr: string | null | undefined,
  referenceDate: Date = new Date()
): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return null;

  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);

  const target = Date.UTC(y, m, d);
  const refMidnight = toLocalDayUtcTimestamp(referenceDate);

  if (isNaN(target)) return null;
  return Math.round((target - refMidnight) / (1000 * 60 * 60 * 24));
}

/**
 * Phân tích danh sách phòng để tìm các phòng "Sắp trống" (SOON_TO_BE_AVAILABLE)
 * đã đến hoặc đã qua ngày trống (availableFrom <= referenceDate).
 * Đây là các phòng cần nghiệm thu bàn giao và đối soát cọc để chuyển về "Đang trống" (AVAILABLE).
 */
export function getReadyForHandoverProperties(
  properties: CandidateProperty[],
  referenceDate: Date = new Date()
): HandoverPropertyInfo[] {
  const refMidnight = toLocalDayUtcTimestamp(referenceDate);

  const results: HandoverPropertyInfo[] = [];

  for (const property of properties) {
    if (property.status !== 'SOON_TO_BE_AVAILABLE' || !property.availableFrom) {
      continue;
    }

    const parts = property.availableFrom.slice(0, 10).split('-');
    if (parts.length !== 3) {
      continue;
    }

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const availMidnight = new Date(Date.UTC(year, month, day)).getTime();
    if (isNaN(availMidnight)) {
      continue;
    }

    const diffDays = Math.round((availMidnight - refMidnight) / (1000 * 60 * 60 * 24));

    // Thỏa mãn khi diffDays <= 0 (tức là hôm nay hoặc đã quá hạn bàn giao)
    if (diffDays <= 0) {
      results.push({
        propertyId: property.id,
        code: property.code,
        name: property.name,
        tenantName: property.tenantName ?? null,
        tenantPhone: property.tenantPhone ?? null,
        tenantCitizenId: property.tenantCitizenId ?? null,
        depositPaid:
          property.depositPaid !== undefined && property.depositPaid !== null
            ? Number(property.depositPaid)
            : null,
        leaseStartDate: property.leaseStartDate
          ? property.leaseStartDate.slice(0, 10)
          : null,
        leaseEndDate: property.leaseEndDate
          ? property.leaseEndDate.slice(0, 10)
          : null,
        availableFrom: property.availableFrom.slice(0, 10),
        diffDays,
        isOverdue: diffDays < 0,
      });
    }
  }

  // Sắp xếp ưu tiên các phòng đã quá hạn nhiều nhất lên trước
  results.sort((a, b) => a.diffDays - b.diffDays);

  return results;
}
