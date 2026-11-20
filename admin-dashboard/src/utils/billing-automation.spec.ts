import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDueBillingProperties,
  calculateBillingPreview,
  type BillingPropertyInput,
  type ExistingBillingInput,
  type DueBillingCandidate,
} from './billing-automation.ts';

test('phát hiện đúng các phòng đến hạn trong vòng 5 ngày hoặc quá hạn', () => {
  const refDate = new Date(2026, 10, 7); // 07/11/2026 (Month index 10 = Nov)

  const sampleProperties: BillingPropertyInput[] = [
    {
      id: 'prop-1',
      code: 'P101',
      name: 'Phòng Ban Công',
      status: 'RENTED',
      monthlyRent: 4000000,
      serviceFee: 100000,
      electricityRate: 3800,
      waterRate: 20000,
      tenantName: 'Nguyễn Văn A',
      tenantPhone: '0912345678',
      leaseStartDate: '2026-11-10', // Đến hạn ngày 10 (còn 3 ngày)
    },
    {
      id: 'prop-2',
      code: 'P102',
      name: 'Phòng Cửa Sổ',
      status: 'RENTED',
      monthlyRent: 3500000,
      serviceFee: 50000,
      electricityRate: 3800,
      waterRate: 20000,
      tenantName: 'Trần Thị B',
      tenantPhone: '0987654321',
      leaseStartDate: '2026-11-05', // Đến hạn ngày 5 (quá hạn 2 ngày)
    },
    {
      id: 'prop-3',
      code: 'P103',
      name: 'Phòng Studio',
      status: 'RENTED',
      monthlyRent: 5000000,
      serviceFee: 150000,
      electricityRate: 3800,
      waterRate: 20000,
      tenantName: 'Lê Văn C',
      tenantPhone: '0909123456',
      leaseStartDate: '2026-11-20', // Đến hạn ngày 20 (còn 13 ngày -> Không nằm trong 5 ngày)
    },
    {
      id: 'prop-4',
      code: 'P104',
      name: 'Phòng Trống',
      status: 'AVAILABLE',
      monthlyRent: 3000000,
      serviceFee: 50000,
      electricityRate: 3800,
      waterRate: 20000,
      leaseStartDate: null,
    },
  ];

  const billings: ExistingBillingInput[] = [];
  const candidates = getDueBillingProperties(sampleProperties, billings, refDate);

  // P101 (còn 3 ngày) và P102 (quá hạn 2 ngày) thỏa mãn
  // P103 (còn 13 ngày) và P104 (AVAILABLE) không thỏa mãn
  assert.equal(candidates.length, 2);

  const p102 = candidates.find((c) => c.code === 'P102');
  assert.ok(p102);
  assert.equal(p102?.isOverdue, true);
  assert.equal(p102?.diffDays, -2);
  assert.equal(p102?.periodMonth, 11);
  assert.equal(p102?.periodYear, 2026);

  const p101 = candidates.find((c) => c.code === 'P101');
  assert.ok(p101);
  assert.equal(p101?.isOverdue, false);
  assert.equal(p101?.diffDays, 3);
});

test('bỏ qua phòng đã có hóa đơn kỳ hiện tại', () => {
  const refDate = new Date(2026, 10, 7);
  const sampleProperties: BillingPropertyInput[] = [
    {
      id: 'prop-1',
      code: 'P101',
      name: 'Phòng Ban Công',
      status: 'RENTED',
      monthlyRent: 4000000,
      serviceFee: 100000,
      electricityRate: 3800,
      waterRate: 20000,
      tenantName: 'Nguyễn Văn A',
      leaseStartDate: '2026-11-10',
    },
    {
      id: 'prop-2',
      code: 'P102',
      name: 'Phòng Cửa Sổ',
      status: 'RENTED',
      monthlyRent: 3500000,
      serviceFee: 50000,
      electricityRate: 3800,
      waterRate: 20000,
      tenantName: 'Trần Thị B',
      leaseStartDate: '2026-11-05',
    },
  ];

  // Giả sử P102 đã được lập hóa đơn tháng 11/2026
  const billings: ExistingBillingInput[] = [
    {
      id: 'bill-1',
      property: { id: 'prop-2', code: 'P102' },
      periodMonth: 11,
      periodYear: 2026,
      electricity: { newIndex: 500 },
      water: { newIndex: 40 },
    },
  ];

  const candidates = getDueBillingProperties(sampleProperties, billings, refDate);
  // P102 đã có bill tháng 11 nên không còn được đề xuất cho tháng 11
  assert.equal(candidates.find((c) => c.code === 'P102'), undefined);
  // P101 vẫn chưa có bill nên vẫn được đề xuất
  assert.ok(candidates.find((c) => c.code === 'P101'));
});

test('kế thừa đúng chỉ số điện/nước cuối kỳ trước làm chỉ số đầu kỳ mới', () => {
  const refDate = new Date(2026, 10, 7);
  const sampleProperties: BillingPropertyInput[] = [
    {
      id: 'prop-1',
      code: 'P101',
      name: 'Phòng Ban Công',
      status: 'RENTED',
      monthlyRent: 4000000,
      serviceFee: 100000,
      electricityRate: 3800,
      waterRate: 20000,
      tenantName: 'Nguyễn Văn A',
      leaseStartDate: '2026-11-10',
    },
  ];

  const billings: ExistingBillingInput[] = [
    {
      id: 'bill-old',
      property: { id: 'prop-1', code: 'P101' },
      periodMonth: 10,
      periodYear: 2026,
      electricity: { newIndex: 1250 },
      water: { newIndex: 85 },
    },
  ];

  const candidates = getDueBillingProperties(sampleProperties, billings, refDate);
  const p101 = candidates.find((c) => c.code === 'P101');
  assert.equal(p101?.lastElectricityIndex, 1250);
  assert.equal(p101?.lastWaterIndex, 85);
});

test('tính toán số tiền dự kiến chính xác theo thời gian thực trong calculateBillingPreview', () => {
  const candidate: DueBillingCandidate = {
    propertyId: 'prop-1',
    code: 'P101',
    name: 'Phòng Ban Công',
    tenantName: 'Nguyễn Văn A',
    tenantPhone: '0912345678',
    dueDay: 10,
    dueDate: '2026-11-10',
    diffDays: 3,
    isOverdue: false,
    periodMonth: 11,
    periodYear: 2026,
    monthlyRent: 4000000,
    serviceFee: 100000,
    electricityRate: 3800,
    waterRate: 20000,
    lastElectricityIndex: 1200,
    lastWaterIndex: 80,
  };

  // Nhập chỉ số mới: Điện 1250 (tiêu thụ 50 kWh), Nước 85 (tiêu thụ 5 m3)
  const preview = calculateBillingPreview(candidate, 1250, 85);

  assert.equal(preview.elecUsage, 50);
  assert.equal(preview.waterUsage, 5);
  assert.equal(preview.electricityAmount, 50 * 3800); // 190.000
  assert.equal(preview.waterAmount, 5 * 20000); // 100.000
  assert.equal(preview.rentAmount, 4000000);
  assert.equal(preview.serviceFee, 100000);
  assert.equal(preview.adjustmentAmount, 0);
  assert.equal(preview.totalAmount, 4000000 + 100000 + 190000 + 100000); // 4.390.000
  assert.equal(preview.hasIndexError, false);

  const withSurcharge = calculateBillingPreview(candidate, 1250, 85, 150000);
  assert.equal(withSurcharge.adjustmentAmount, 150000);
  assert.equal(withSurcharge.totalAmount, 4540000);

  const withDeduction = calculateBillingPreview(candidate, 1250, 85, -90000);
  assert.equal(withDeduction.adjustmentAmount, -90000);
  assert.equal(withDeduction.totalAmount, 4300000);
});

test('báo lỗi hasIndexError nếu chỉ số mới nhỏ hơn chỉ số cũ', () => {
  const candidate: DueBillingCandidate = {
    propertyId: 'prop-1',
    code: 'P101',
    name: 'Phòng Ban Công',
    tenantName: 'Nguyễn Văn A',
    tenantPhone: '0912345678',
    dueDay: 10,
    dueDate: '2026-11-10',
    diffDays: 3,
    isOverdue: false,
    periodMonth: 11,
    periodYear: 2026,
    monthlyRent: 4000000,
    serviceFee: 100000,
    electricityRate: 3800,
    waterRate: 20000,
    lastElectricityIndex: 1200,
    lastWaterIndex: 80,
  };

  // Nhập số điện mới 1100 < 1200
  const preview = calculateBillingPreview(candidate, 1100, 85);
  assert.equal(preview.hasIndexError, true);
});
