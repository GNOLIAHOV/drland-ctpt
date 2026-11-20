import { Prisma } from '../generated/prisma/client.js';
import {
  BillingCalculationError,
  calculateBilling,
  MAX_METER_INDEX,
  type BillingInput,
} from './billing.calculator.js';

const base: BillingInput = {
  electricity: { oldIndex: 1200, newIndex: 1350 }, // 150 kWh
  water: { oldIndex: 300, newIndex: 312 }, //          12 m³
  electricityRate: 3500,
  waterRate: 15000,
  rentAmount: 3_000_000,
  serviceFee: 0,
};

const with_ = (patch: Partial<BillingInput>): BillingInput => ({ ...base, ...patch });
const expectCalcError = (input: BillingInput, msg: RegExp) =>
  expect(() => calculateBilling(input)).toThrow(
    expect.objectContaining({ name: 'BillingCalculationError', message: expect.stringMatching(msg) }),
  );

describe('calculateBilling', () => {
  // ───────────── Happy path ─────────────

  it('computes usage × rate and total = rent + electricity + water', () => {
    const r = calculateBilling(base);
    expect(r.electricityUsage).toBe(150);
    expect(r.waterUsage).toBe(12);
    expect(r.electricityAmount.toNumber()).toBe(525_000); // 150 × 3 500
    expect(r.waterAmount.toNumber()).toBe(180_000); //       12 × 15 000
    expect(r.totalAmount.toNumber()).toBe(3_705_000); //     3 000 000 + 525 000 + 180 000
  });

  it('adds the property service fee to the total', () => {
    const r = calculateBilling(with_({ serviceFee: 150_000 }));
    expect(r.totalAmount.toNumber()).toBe(3_855_000);
  });

  it('returns the rate snapshot it used', () => {
    const r = calculateBilling(base);
    expect(r.electricityRate.toNumber()).toBe(3500);
    expect(r.waterRate.toNumber()).toBe(15000);
    expect(r.rentAmount.toNumber()).toBe(3_000_000);
  });

  it('accepts Prisma Decimal and numeric-string inputs', () => {
    const r = calculateBilling(
      with_({ electricityRate: new Prisma.Decimal('3500'), waterRate: '15000' }),
    );
    expect(r.totalAmount.toNumber()).toBe(3_705_000);
  });

  // ───────────── Boundaries: usage ─────────────

  it('allows zero consumption (newIndex === oldIndex) → only rent', () => {
    const r = calculateBilling(
      with_({
        electricity: { oldIndex: 500, newIndex: 500 },
        water: { oldIndex: 20, newIndex: 20 },
      }),
    );
    expect(r.electricityAmount.toNumber()).toBe(0);
    expect(r.waterAmount.toNumber()).toBe(0);
    expect(r.totalAmount.toNumber()).toBe(3_000_000);
  });

  it('allows index 0 (brand-new meter)', () => {
    const r = calculateBilling(with_({ electricity: { oldIndex: 0, newIndex: 1 } }));
    expect(r.electricityAmount.toNumber()).toBe(3500);
  });

  it('allows the max INT meter index', () => {
    expect(() =>
      calculateBilling(
        with_({
          electricity: { oldIndex: MAX_METER_INDEX - 1, newIndex: MAX_METER_INDEX },
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['electricity', { electricity: { oldIndex: 1350, newIndex: 1200 } }, /điện mới \(1200\).*cũ \(1350\)/],
    ['water', { water: { oldIndex: 312, newIndex: 311 } }, /nước mới \(311\).*cũ \(312\)/],
  ])('rejects %s newIndex < oldIndex', (_l, patch, msg) => {
    expectCalcError(with_(patch as Partial<BillingInput>), msg);
  });

  it.each([
    ['negative oldIndex', { electricity: { oldIndex: -1, newIndex: 10 } }],
    ['negative newIndex', { water: { oldIndex: 0, newIndex: -5 } }],
    ['both negative (new ≥ old)', { electricity: { oldIndex: -10, newIndex: -2 } }],
  ])('rejects %s', (_l, patch) => {
    expectCalcError(with_(patch as Partial<BillingInput>), /không được âm/);
  });

  it.each([
    ['fractional index', { electricity: { oldIndex: 10.5, newIndex: 20 } }],
    ['NaN index', { water: { oldIndex: Number.NaN, newIndex: 5 } }],
    ['Infinity index', { water: { oldIndex: 0, newIndex: Number.POSITIVE_INFINITY } }],
  ])('rejects %s', (_l, patch) => {
    expectCalcError(with_(patch as Partial<BillingInput>), /số nguyên/);
  });

  it('rejects an index above the INT limit', () => {
    expectCalcError(
      with_({ electricity: { oldIndex: 0, newIndex: MAX_METER_INDEX + 1 } }),
      /vượt quá giới hạn/,
    );
  });

  // ───────────── Boundaries: money ─────────────

  it.each([
    ['electricityRate', { electricityRate: -1 }, /Đơn giá điện không được âm/],
    ['waterRate', { waterRate: -0.01 }, /Đơn giá nước không được âm/],
    ['rentAmount', { rentAmount: -3_000_000 }, /Tiền thuê không được âm/],
    ['serviceFee', { serviceFee: -1 }, /Phí dịch vụ không được âm/],
  ])('rejects negative %s', (_l, patch, msg) => {
    expectCalcError(with_(patch), msg);
  });

  it.each([
    ['NaN rate', { electricityRate: Number.NaN }],
    ['Infinity rent', { rentAmount: Number.POSITIVE_INFINITY }],
    ['garbage string', { waterRate: 'abc' }],
  ])('rejects %s', (_l, patch) => {
    expectCalcError(with_(patch), /không hợp lệ/);
  });

  it('treats a missing serviceFee as 0', () => {
    const { serviceFee: _omit, ...noFee } = base;
    expect(calculateBilling(noFee).serviceFee.toNumber()).toBe(0);
  });

  it('rejects totals that overflow Decimal(14,2)', () => {
    expectCalcError(
      with_({
        electricity: { oldIndex: 0, newIndex: MAX_METER_INDEX },
        electricityRate: 99_999_999,
      }),
      /Tiền điện vượt quá giới hạn/,
    );
  });

  // ───────────── Precision ─────────────

  it('has no floating-point drift (0.1 × 3 = 0.3 exactly)', () => {
    const r = calculateBilling(
      with_({
        electricity: { oldIndex: 0, newIndex: 3 },
        electricityRate: 0.1,
        water: { oldIndex: 0, newIndex: 0 },
        rentAmount: 0,
      }),
    );
    expect(0.1 * 3).not.toBe(0.3); // JS float
    expect(r.electricityAmount.toString()).toBe('0.3');
    expect(r.totalAmount.toString()).toBe('0.3');
  });

  it('rounds each line item HALF_UP to 2 decimals and total = sum of items', () => {
    const r = calculateBilling(
      with_({
        electricity: { oldIndex: 0, newIndex: 1 },
        electricityRate: '1234.565', // → 1234.57
        water: { oldIndex: 0, newIndex: 1 },
        waterRate: '0.004', //          → 0.00
        rentAmount: '100.005', //       → 100.01
      }),
    );
    expect(r.electricityAmount.toString()).toBe('1234.57');
    expect(r.waterAmount.toString()).toBe('0');
    expect(r.rentAmount.toString()).toBe('100.01');
    expect(r.totalAmount.toString()).toBe(
      r.rentAmount.add(r.electricityAmount).add(r.waterAmount).add(r.serviceFee).toString(),
    );
  });

  it('adds positive adjustmentAmount and subtracts negative adjustmentAmount', () => {
    const surcharge = calculateBilling(with_({ adjustmentAmount: 150_000 }));
    expect(surcharge.adjustmentAmount.toNumber()).toBe(150_000);
    expect(surcharge.totalAmount.toNumber()).toBe(3_855_000);

    const discount = calculateBilling(with_({ adjustmentAmount: -200_000 }));
    expect(discount.adjustmentAmount.toNumber()).toBe(-200_000);
    expect(discount.totalAmount.toNumber()).toBe(3_505_000);
  });

  it('rejects negative totalAmount when deduction exceeds invoice sum', () => {
    expectCalcError(
      with_({ adjustmentAmount: -5_000_000 }),
      /Tổng tiền hóa đơn sau giảm trừ không được âm/,
    );
  });

  it('throws a BillingCalculationError instance (for HTTP 400 mapping)', () => {
    expect(() =>
      calculateBilling(with_({ electricity: { oldIndex: 2, newIndex: 1 } })),
    ).toThrow(BillingCalculationError);
  });
});
