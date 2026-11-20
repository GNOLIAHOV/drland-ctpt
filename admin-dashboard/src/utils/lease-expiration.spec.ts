import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getExpiringRentedProperties,
  getReadyForHandoverProperties,
  addMonthsToDate,
  getDaysRemaining,
} from './lease-expiration.ts';

test('getExpiringRentedProperties identifies rented rooms expiring within 30 days or overdue', () => {
  const referenceDate = new Date('2026-11-07T00:00:00.000Z');

  const properties = [
    {
      id: 'p1',
      code: 'P101',
      name: 'Phòng 101',
      status: 'RENTED',
      tenantName: 'Nguyễn Văn A',
      tenantPhone: '0901111111',
      leaseEndDate: '2026-11-20', // Còn 13 ngày -> Hợp lệ
    },
    {
      id: 'p2',
      code: 'P102',
      name: 'Phòng 102',
      status: 'RENTED',
      tenantName: 'Trần Thị B',
      tenantPhone: '0902222222',
      leaseEndDate: '2026-11-05', // Đã quá hạn 2 ngày -> Hợp lệ (isOverdue = true)
    },
    {
      id: 'p3',
      code: 'P103',
      name: 'Phòng 103',
      status: 'RENTED',
      tenantName: 'Lê Văn C',
      tenantPhone: '0903333333',
      leaseEndDate: '2026-12-20', // Còn 43 ngày (> 30 ngày) -> Bỏ qua
    },
    {
      id: 'p4',
      code: 'P104',
      name: 'Phòng 104',
      status: 'AVAILABLE', // Trạng thái trống -> Bỏ qua dù hạn HĐ gần
      leaseEndDate: '2026-11-15',
    },
    {
      id: 'p5',
      code: 'P105',
      name: 'Phòng 105',
      status: 'SOON_TO_BE_AVAILABLE', // Đã là sắp trống -> Bỏ qua
      leaseEndDate: '2026-11-12',
    },
    {
      id: 'p6',
      code: 'P106',
      name: 'Phòng 106',
      status: 'RENTED',
      tenantName: 'Phạm Văn D',
      leaseEndDate: null, // Không có hạn HĐ -> Bỏ qua an toàn
    },
  ];

  const results = getExpiringRentedProperties(properties, referenceDate);

  assert.equal(results.length, 2);

  // P101: còn 13 ngày
  const item1 = results.find((r) => r.propertyId === 'p1');
  assert.ok(item1);
  assert.equal(item1?.diffDays, 13);
  assert.equal(item1?.isOverdue, false);
  assert.equal(item1?.code, 'P101');

  // P102: quá hạn 2 ngày
  const item2 = results.find((r) => r.propertyId === 'p2');
  assert.ok(item2);
  assert.equal(item2?.diffDays, -2);
  assert.equal(item2?.isOverdue, true);
  assert.equal(item2?.code, 'P102');
});

test('addMonthsToDate adds months accurately to YYYY-MM-DD string', () => {
  const result6 = addMonthsToDate('2026-11-25', 6);
  assert.equal(result6, '2027-05-25');

  const result12 = addMonthsToDate('2026-11-25', 12);
  assert.equal(result12, '2027-11-25');
});

test('getDaysRemaining returns accurate diff in days', () => {
  const ref = new Date('2026-11-07T00:00:00.000Z');
  assert.equal(getDaysRemaining('2026-11-25', ref), 18);
  assert.equal(getDaysRemaining('2026-11-01', ref), -6);
  assert.equal(getDaysRemaining(null, ref), null);
});

test('getReadyForHandoverProperties identifies SOON_TO_BE_AVAILABLE rooms whose availableFrom <= today', () => {
  const referenceDate = new Date('2026-11-07T00:00:00.000Z');

  const properties = [
    {
      id: 'h1',
      code: 'P201',
      name: 'Phòng 201',
      status: 'SOON_TO_BE_AVAILABLE',
      tenantName: 'Lê Hoàng Long',
      tenantPhone: '0988776655',
      tenantCitizenId: '079201009988',
      depositPaid: 3500000,
      leaseStartDate: '2026-05-07',
      leaseEndDate: '2026-11-07',
      availableFrom: '2026-11-07', // Đúng ngày hôm nay -> diffDays = 0 -> Sẵn sàng nghiệm thu
    },
    {
      id: 'h2',
      code: 'P202',
      name: 'Phòng 202',
      status: 'SOON_TO_BE_AVAILABLE',
      tenantName: 'Đặng Quốc Huy',
      depositPaid: 4000000,
      availableFrom: '2026-11-05', // Đã quá ngày trống 2 ngày -> diffDays = -2 -> Cần nghiệm thu gấp
    },
    {
      id: 'h3',
      code: 'P203',
      name: 'Phòng 203',
      status: 'SOON_TO_BE_AVAILABLE',
      availableFrom: '2026-11-20', // Còn 13 ngày nữa mới trống -> Bỏ qua
    },
    {
      id: 'h4',
      code: 'P204',
      name: 'Phòng 204',
      status: 'AVAILABLE', // Đang trống rồi -> Bỏ qua
      availableFrom: '2026-11-01',
    },
    {
      id: 'h5',
      code: 'P205',
      name: 'Phòng 205',
      status: 'SOON_TO_BE_AVAILABLE',
      availableFrom: null, // Thiếu ngày -> Bỏ qua
    },
  ];

  const results = getReadyForHandoverProperties(properties, referenceDate);

  assert.equal(results.length, 2);

  // h2 quá hạn 2 ngày nên được sắp xếp lên trước (diffDays = -2)
  assert.equal(results[0]?.propertyId, 'h2');
  assert.equal(results[0]?.diffDays, -2);
  assert.equal(results[0]?.isOverdue, true);

  // h1 đúng ngày hôm nay (diffDays = 0)
  assert.equal(results[1]?.propertyId, 'h1');
  assert.equal(results[1]?.code, 'P201');
  assert.equal(results[1]?.diffDays, 0);
  assert.equal(results[1]?.isOverdue, false);
  assert.equal(results[1]?.depositPaid, 3500000);
  assert.equal(results[1]?.tenantCitizenId, '079201009988');
});
