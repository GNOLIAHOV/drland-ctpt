import { Prisma } from '../generated/prisma/client.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type DecimalLike = Decimal | number | string;

/** Postgres INT upper bound — meter indexes are stored as `Int`. */
export const MAX_METER_INDEX = 2_147_483_647;
/** Decimal(14,2) upper bound for any money column. */
export const MAX_AMOUNT = new Decimal('999999999999.99');

export interface MeterReading {
  oldIndex: number;
  newIndex: number;
}

export interface BillingInput {
  electricity: MeterReading;
  water: MeterReading;
  electricityRate: DecimalLike; // VNĐ / kWh (snapshot from Property)
  waterRate: DecimalLike; // VNĐ / m³   (snapshot from Property)
  rentAmount: DecimalLike; // monthly rent (snapshot from Property)
  serviceFee?: DecimalLike; // monthly service fee (snapshot from Property)
  adjustmentAmount?: DecimalLike; // phát sinh cộng (+) hoặc giảm trừ (-)
}

export interface BillingBreakdown {
  electricityUsage: number;
  waterUsage: number;
  electricityRate: Decimal;
  waterRate: Decimal;
  rentAmount: Decimal;
  electricityAmount: Decimal;
  waterAmount: Decimal;
  serviceFee: Decimal;
  adjustmentAmount: Decimal;
  totalAmount: Decimal;
}

/** Thrown for any invalid calculation input; mapped to HTTP 400 by the service. */
export class BillingCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingCalculationError';
  }
}

function assertMeter(label: string, r: MeterReading): number {
  for (const [key, v] of Object.entries(r)) {
    if (!Number.isInteger(v)) {
      throw new BillingCalculationError(`Chỉ số ${label} (${key}) phải là số nguyên`);
    }
    if (v < 0) {
      throw new BillingCalculationError(`Chỉ số ${label} (${key}) không được âm`);
    }
    if (v > MAX_METER_INDEX) {
      throw new BillingCalculationError(`Chỉ số ${label} (${key}) vượt quá giới hạn`);
    }
  }
  if (r.newIndex < r.oldIndex) {
    throw new BillingCalculationError(
      `Chỉ số ${label} mới (${r.newIndex}) phải lớn hơn hoặc bằng chỉ số cũ (${r.oldIndex})`,
    );
  }
  return r.newIndex - r.oldIndex;
}

function toMoney(label: string, value: DecimalLike): Decimal {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    throw new BillingCalculationError(`${label} không hợp lệ`);
  }
  if (!d.isFinite()) {
    throw new BillingCalculationError(`${label} không hợp lệ`);
  }
  if (d.isNegative()) {
    throw new BillingCalculationError(`${label} không được âm`);
  }
  return d;
}

function toSignedMoney(label: string, value: DecimalLike): Decimal {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    throw new BillingCalculationError(`${label} không hợp lệ`);
  }
  if (!d.isFinite()) {
    throw new BillingCalculationError(`${label} không hợp lệ`);
  }
  if (d.abs().gt(MAX_AMOUNT)) {
    throw new BillingCalculationError(`${label} vượt quá giới hạn lưu trữ`);
  }
  return d;
}

const round2 = (d: Decimal): Decimal =>
  d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Pure billing calculation.
 *
 *   electricityAmount = (newIndex − oldIndex) × electricityRate
 *   waterAmount       = (newIndex − oldIndex) × waterRate
 *   totalAmount       = rentAmount + electricityAmount + waterAmount + serviceFee + adjustmentAmount
 *
 * Uses arbitrary-precision decimals (no float drift) and rounds each line item
 * to 2 decimals (ROUND_HALF_UP) before summing, so the total always equals the
 * sum of the stored line items.
 */
export function calculateBilling(input: BillingInput): BillingBreakdown {
  const electricityUsage = assertMeter('điện', input.electricity);
  const waterUsage = assertMeter('nước', input.water);

  const electricityRate = toMoney('Đơn giá điện', input.electricityRate);
  const waterRate = toMoney('Đơn giá nước', input.waterRate);
  const rentAmount = toMoney('Tiền thuê', input.rentAmount);
  const serviceFee = toMoney('Phí dịch vụ', input.serviceFee ?? 0);
  const adjustmentAmount = round2(
    toSignedMoney('Khoản phụ thu / giảm trừ', input.adjustmentAmount ?? 0),
  );

  const electricityAmount = round2(electricityRate.mul(electricityUsage));
  const waterAmount = round2(waterRate.mul(waterUsage));
  const totalAmount = round2(rentAmount)
    .add(electricityAmount)
    .add(waterAmount)
    .add(round2(serviceFee))
    .add(adjustmentAmount);

  if (totalAmount.isNegative()) {
    throw new BillingCalculationError(
      'Tổng tiền hóa đơn sau giảm trừ không được âm',
    );
  }

  for (const [label, amount] of [
    ['Tiền điện', electricityAmount],
    ['Tiền nước', waterAmount],
    ['Tổng tiền', totalAmount],
  ] as const) {
    if (amount.gt(MAX_AMOUNT)) {
      throw new BillingCalculationError(`${label} vượt quá giới hạn lưu trữ`);
    }
  }

  return {
    electricityUsage,
    waterUsage,
    electricityRate,
    waterRate,
    rentAmount: round2(rentAmount),
    electricityAmount,
    waterAmount,
    serviceFee: round2(serviceFee),
    adjustmentAmount,
    totalAmount,
  };
}
