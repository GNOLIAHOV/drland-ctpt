/**
 * Seed script chuẩn hóa đồng bộ toàn diện mô hình 2 Tòa nhà (14B8 & 14B9 Ngô Tất Tố):
 * - Nhà 01 (NHA-01): Tòa Nhà 14B8 Ngô Tất Tố (5 phòng trọ, 0 mặt bằng, đầy đủ hợp đồng & chỉ số T10-T11 liên tiếp).
 * - Nhà 02 (NHA-02): Tòa Nhà 14B9 Ngô Tất Tố (1 mặt bằng đang mở thuê MB-14B9 và 3 phòng trọ).
 * - Thống nhất đơn giá điện 3.800 đ/kWh, nước 20.000 đ/m³, dọn sạch lịch hẹn & hóa đơn lệch/cũ.
 *
 * Chạy bằng: npx tsx src/prisma/seed-multi-house.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BillingStatus,
  BookingStatus,
  PrismaClient,
  PropertyStatus,
  PropertyType,
} from '../generated/prisma/client.js';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function deletePropertiesCascade(
  prisma: PrismaClient,
  propertyIds: string[],
): Promise<number> {
  if (propertyIds.length === 0) return 0;

  await prisma.billing.deleteMany({
    where: { propertyId: { in: propertyIds } },
  });
  await prisma.bookingRequest.deleteMany({
    where: { propertyId: { in: propertyIds } },
  });
  const deleted = await prisma.property.deleteMany({
    where: { id: { in: propertyIds } },
  });
  return deleted.count;
}

async function upsertRenamedProperty(
  prisma: PrismaClient,
  oldCode: string,
  data: {
    houseId: string;
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
    availableFrom?: Date | null;
    tenantName: string | null;
    tenantPhone: string | null;
    tenantCitizenId?: string | null;
    leaseStartDate: Date | null;
    leaseEndDate: Date | null;
    depositPaid: number | null;
    tenantCount: number;
    vehicleCount: number;
    rentalNotes?: string | null;
    description: string;
    images: string[];
  },
) {
  const existingNew = await prisma.property.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  const existingOld =
    oldCode !== data.code
      ? await prisma.property.findUnique({
          where: { code: oldCode },
          select: { id: true },
        })
      : null;

  if (existingNew) {
    if (existingOld) {
      await deletePropertiesCascade(prisma, [existingOld.id]);
    }
    return prisma.property.update({
      where: { id: existingNew.id },
      data,
    });
  }

  if (existingOld) {
    return prisma.property.update({
      where: { id: existingOld.id },
      data,
    });
  }

  return prisma.property.create({ data });
}

async function upsertBilling(
  prisma: PrismaClient,
  params: {
    propertyId: string;
    periodMonth: number;
    periodYear: number;
    electricityStart: number;
    electricityEnd: number;
    waterStart: number;
    waterEnd: number;
    electricityRate: number;
    waterRate: number;
    rentAmount: number;
    serviceFee: number;
    status: BillingStatus;
    paidAt?: Date | null;
    note?: string | null;
  },
) {
  const elecUsage = params.electricityEnd - params.electricityStart;
  const waterUsage = params.waterEnd - params.waterStart;
  const electricityAmount = elecUsage * params.electricityRate;
  const waterAmount = waterUsage * params.waterRate;
  const totalAmount =
    params.rentAmount + params.serviceFee + electricityAmount + waterAmount;

  return prisma.billing.upsert({
    where: {
      propertyId_periodYear_periodMonth: {
        propertyId: params.propertyId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
      },
    },
    update: {
      electricityStart: params.electricityStart,
      electricityEnd: params.electricityEnd,
      waterStart: params.waterStart,
      waterEnd: params.waterEnd,
      electricityRate: params.electricityRate,
      waterRate: params.waterRate,
      rentAmount: params.rentAmount,
      electricityAmount,
      waterAmount,
      serviceFee: params.serviceFee,
      totalAmount,
      status: params.status,
      paidAt: params.paidAt ?? null,
      note: params.note ?? null,
    },
    create: {
      propertyId: params.propertyId,
      periodMonth: params.periodMonth,
      periodYear: params.periodYear,
      electricityStart: params.electricityStart,
      electricityEnd: params.electricityEnd,
      waterStart: params.waterStart,
      waterEnd: params.waterEnd,
      electricityRate: params.electricityRate,
      waterRate: params.waterRate,
      rentAmount: params.rentAmount,
      electricityAmount,
      waterAmount,
      serviceFee: params.serviceFee,
      totalAmount,
      status: params.status,
      paidAt: params.paidAt ?? null,
      note: params.note ?? null,
    },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  try {
    // 0. Đảm bảo bản ghi cấu hình hệ thống mặc định luôn tồn tại
    await prisma.systemSetting.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });

    // 1. Chuẩn hóa tên, địa chỉ & đơn giá mặc định cho 2 Tòa nhà (14B8 & 14B9 Ngô Tất Tố)
    const house1 = await prisma.house.upsert({
      where: { code: 'NHA-01' },
      update: {
        name: 'Tòa Nhà 14B8 Ngô Tất Tố',
        address: '14B8 Ngô Tất Tố, Phường Thạnh Mỹ Tây, TP.HCM',
        defaultElectricityRate: 3800,
        defaultWaterRate: 20000,
        defaultServiceFee: 50000,
        description:
          'Cơ sở 14B8 Ngô Tất Tố gồm 5 phòng trọ có gác lửng, ban công thoáng sáng, khóa vân tay 2 lớp.',
      },
      create: {
        code: 'NHA-01',
        name: 'Tòa Nhà 14B8 Ngô Tất Tố',
        address: '14B8 Ngô Tất Tố, Phường Thạnh Mỹ Tây, TP.HCM',
        defaultElectricityRate: 3800,
        defaultWaterRate: 20000,
        defaultServiceFee: 50000,
        description:
          'Cơ sở 14B8 Ngô Tất Tố gồm 5 phòng trọ có gác lửng, ban công thoáng sáng, khóa vân tay 2 lớp.',
      },
    });

    const house2 = await prisma.house.upsert({
      where: { code: 'NHA-02' },
      update: {
        name: 'Tòa Nhà 14B9 Ngô Tất Tố',
        address: '14B9 Ngô Tất Tố, Phường Thạnh Mỹ Tây, TP.HCM',
        defaultElectricityRate: 3800,
        defaultWaterRate: 20000,
        defaultServiceFee: 50000,
        description:
          'Cơ sở 14B9 Ngô Tất Tố gồm 1 mặt bằng kinh doanh tầng trệt và 3 phòng trọ tiện nghi.',
      },
      create: {
        code: 'NHA-02',
        name: 'Tòa Nhà 14B9 Ngô Tất Tố',
        address: '14B9 Ngô Tất Tố, Phường Thạnh Mỹ Tây, TP.HCM',
        defaultElectricityRate: 3800,
        defaultWaterRate: 20000,
        defaultServiceFee: 50000,
        description:
          'Cơ sở 14B9 Ngô Tất Tố gồm 1 mặt bằng kinh doanh tầng trệt và 3 phòng trọ tiện nghi.',
      },
    });

    // 2. Gán các phòng trọ chưa phân loại về Nhà 01
    await prisma.property.updateMany({
      where: { houseId: null, type: PropertyType.ROOM },
      data: {
        houseId: house1.id,
        address: house1.address,
      },
    });

    // 3. Dọn dẹp triệt để dữ liệu thừa (mặt bằng ở Nhà 01, các tòa nhà ngoài NHA-01/NHA-02, dữ liệu test)
    const otherHouses = await prisma.house.findMany({
      where: { id: { notIn: [house1.id, house2.id] } },
      select: { id: true, code: true },
    });
    const otherHouseIds = otherHouses.map((h) => h.id);

    const propertiesToDelete = await prisma.property.findMany({
      where: {
        OR: [
          { houseId: house1.id, type: PropertyType.COMMERCIAL_SPACE },
          { houseId: null, type: PropertyType.COMMERCIAL_SPACE },
          ...(otherHouseIds.length > 0 ? [{ houseId: { in: otherHouseIds } }] : []),
          {
            code: {
              in: ['MB-NTT-01', 'MB-011', 'MB-01', 'MB-NGT-01', 'P101-NGT', 'P102-NGT'],
            },
          },
          { code: { startsWith: 'AI' } },
          { code: { startsWith: 'CH' } },
        ],
      },
      select: { id: true },
    });

    const removedPropsCount = await deletePropertiesCascade(
      prisma,
      propertiesToDelete.map((p) => p.id),
    );
    if (removedPropsCount > 0) {
      console.log(`✔ Đã xóa ${removedPropsCount} phòng/mặt bằng không liên quan.`);
    }

    if (otherHouseIds.length > 0) {
      await prisma.house.deleteMany({
        where: { id: { in: otherHouseIds } },
      });
    }

    // 4. Đồng bộ đơn giá & thông tin hợp đồng cho các phòng Nhà 01 (giữ nguyên khách thuê & tên phòng)
    await prisma.property.updateMany({
      where: { houseId: house1.id },
      data: {
        address: house1.address,
        electricityRate: 3800,
        waterRate: 20000,
        serviceFee: 50000,
      },
    });

    const p101 = await upsertRenamedProperty(prisma, 'P101', {
      houseId: house1.id,
      code: 'P101',
      name: 'Phòng Studio Ban công Thoáng sáng',
      type: PropertyType.ROOM,
      address: house1.address,
      area: 28,
      monthlyRent: 4200000,
      deposit: 4200000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.RENTED,
      availableFrom: null,
      tenantName: 'Lê Hoàng Nam',
      tenantPhone: '0988 123 456',
      tenantCitizenId: '079200001122',
      leaseStartDate: new Date('2026-03-07T00:00:00.000Z'),
      leaseEndDate: new Date('2027-03-07T00:00:00.000Z'),
      depositPaid: 4200000,
      tenantCount: 1,
      vehicleCount: 0,
      rentalNotes: null,
      description:
        'Phòng có gác lửng đúc kiên cố, ban công thoáng mát đón gió trời tự nhiên, cửa sổ lớn, máy lạnh Inverter, kệ bếp riêng biệt và WC khép kín.',
      images: [
        'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    await upsertRenamedProperty(prisma, 'P102', {
      houseId: house1.id,
      code: 'P102',
      name: 'Phòng Ban Công Mặt Tiền Thoáng Mát',
      type: PropertyType.ROOM,
      address: house1.address,
      area: 30,
      monthlyRent: 4500000,
      deposit: 4500000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.RENTED,
      availableFrom: null,
      tenantName: 'Nguyễn Văn An',
      tenantPhone: '0903 111 222',
      tenantCitizenId: '079201001234',
      leaseStartDate: new Date('2026-06-05T00:00:00.000Z'),
      leaseEndDate: new Date('2027-06-01T00:00:00.000Z'),
      depositPaid: 4500000,
      tenantCount: 2,
      vehicleCount: 2,
      rentalNotes: 'Bàn giao 1 máy lạnh Daikin, 2 thẻ từ thang máy, 2 chìa khóa phòng.',
      description: 'Phòng lầu 1 có ban công riêng rộng rãi, nội thất gỗ sồi cao cấp, máy nước nóng lạnh.',
      images: [
        'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    const p201 = await upsertRenamedProperty(prisma, 'P201', {
      houseId: house1.id,
      code: 'P201',
      name: 'Phòng Cửa Sổ Giếng Trời Yên Tĩnh',
      type: PropertyType.ROOM,
      address: house1.address,
      area: 25,
      monthlyRent: 3800000,
      deposit: 3800000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.RENTED,
      availableFrom: null,
      tenantName: 'Trần Thị Thu Thảo',
      tenantPhone: '0912 345 678',
      tenantCitizenId: '079199008765',
      leaseStartDate: new Date('2026-05-10T00:00:00.000Z'),
      leaseEndDate: new Date('2027-05-10T00:00:00.000Z'),
      depositPaid: 3800000,
      tenantCount: 1,
      vehicleCount: 0,
      rentalNotes: 'Bàn giao 1 máy lạnh Inverter, 1 tủ lạnh, 2 thẻ từ ra vào cổng.',
      description: 'Phòng lầu 2 yên tĩnh, phù hợp nhân viên văn phòng đi làm khu vực Quận 1, Bình Thạnh.',
      images: [
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    const p202 = await upsertRenamedProperty(prisma, 'P202', {
      houseId: house1.id,
      code: 'P202',
      name: 'Phòng Gác Cao Cửa Sổ Giếng Trời',
      type: PropertyType.ROOM,
      address: house1.address,
      area: 22,
      monthlyRent: 3500000,
      deposit: 3500000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.RENTED,
      availableFrom: null,
      tenantName: 'Võ Thị Kim Oanh',
      tenantPhone: '0977 654 321',
      tenantCitizenId: '079198004455',
      leaseStartDate: new Date('2026-10-09T00:00:00.000Z'),
      leaseEndDate: new Date('2027-10-09T00:00:00.000Z'),
      depositPaid: 3500000,
      tenantCount: 1,
      vehicleCount: 0,
      rentalNotes: null,
      description:
        'Phòng gác đứng không chạm đầu, giếng trời đón nắng sáng, không gian yên tĩnh, an ninh khóa vân tay 2 lớp, camera 24/7.',
      images: [
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    const p303 = await upsertRenamedProperty(prisma, 'P303', {
      houseId: house1.id,
      code: 'P303',
      name: 'Phòng Full Nội Thất View Thành Phố',
      type: PropertyType.ROOM,
      address: house1.address,
      area: 32,
      monthlyRent: 5000000,
      deposit: 5000000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.AVAILABLE,
      availableFrom: null,
      tenantName: null,
      tenantPhone: null,
      tenantCitizenId: null,
      leaseStartDate: null,
      leaseEndDate: null,
      depositPaid: null,
      tenantCount: 1,
      vehicleCount: 0,
      rentalNotes: null,
      description:
        'Phòng rộng lầu 3 view mở Landmark 81, trang bị nệm lò xo, tủ quần áo lớn, tủ lạnh 2 cánh, máy giặt riêng, bàn làm việc gỗ sồi.',
      images: [
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    // 5. Chuẩn hóa 1 Mặt bằng (AVAILABLE) & 3 Phòng trọ cho Tòa Nhà 02 (14B9 Ngô Tất Tố)
    const mb14B9 = await upsertRenamedProperty(prisma, 'MB-DBP-01', {
      houseId: house2.id,
      code: 'MB-14B9',
      name: 'Mặt Bằng Kinh Doanh Tầng Trệt 14B9',
      type: PropertyType.COMMERCIAL_SPACE,
      address: house2.address,
      area: 48,
      monthlyRent: 12000000,
      deposit: 24000000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 100000,
      status: PropertyStatus.AVAILABLE,
      availableFrom: null,
      tenantName: null,
      tenantPhone: null,
      tenantCitizenId: null,
      leaseStartDate: null,
      leaseEndDate: null,
      depositPaid: null,
      tenantCount: 1,
      vehicleCount: 0,
      description:
        'Mặt bằng tầng trệt tại 14B9 Ngô Tất Tố, cửa kính cường lực, có toilet riêng và khu kho gọn gàng, sẵn sàng bàn giao kinh doanh ngay.',
      images: [
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    const p201B9 = await upsertRenamedProperty(prisma, 'P201-DBP', {
      houseId: house2.id,
      code: 'P201-B9',
      name: 'Phòng Trọ Lầu 2 (201 - 14B9)',
      type: PropertyType.ROOM,
      address: house2.address,
      area: 28,
      monthlyRent: 4600000,
      deposit: 4600000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.RENTED,
      tenantName: 'Nguyễn Hoàng Phúc',
      tenantPhone: '0938456789',
      tenantCitizenId: '079201005566',
      leaseStartDate: new Date('2026-05-05T00:00:00.000Z'),
      leaseEndDate: new Date('2027-05-05T00:00:00.000Z'),
      depositPaid: 4600000,
      tenantCount: 2,
      vehicleCount: 1,
      description: 'Phòng đầy đủ nội thất tại 14B9 Ngô Tất Tố, máy lạnh Inverter, khóa vân tay.',
      images: [
        'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    const p202B9 = await upsertRenamedProperty(prisma, 'P202-DBP', {
      houseId: house2.id,
      code: 'P202-B9',
      name: 'Phòng Trọ Lầu 2 (202 - 14B9)',
      type: PropertyType.ROOM,
      address: house2.address,
      area: 26,
      monthlyRent: 4300000,
      deposit: 4300000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.RENTED,
      tenantName: 'Trần Thị Bảo Ngọc',
      tenantPhone: '0977112233',
      tenantCitizenId: '079199006677',
      leaseStartDate: new Date('2026-08-14T00:00:00.000Z'),
      leaseEndDate: new Date('2027-08-14T00:00:00.000Z'),
      depositPaid: 4300000,
      tenantCount: 1,
      vehicleCount: 1,
      description: 'Phòng yên tĩnh cửa sổ lớn thoáng mát, kệ bếp sạch sẽ.',
      images: [
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    const p301B9 = await upsertRenamedProperty(prisma, 'P301-DBP', {
      houseId: house2.id,
      code: 'P301-B9',
      name: 'Phòng Ban Công Lầu 3 (301 - 14B9)',
      type: PropertyType.ROOM,
      address: house2.address,
      area: 30,
      monthlyRent: 4900000,
      deposit: 4900000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 50000,
      status: PropertyStatus.AVAILABLE,
      availableFrom: null,
      tenantName: null,
      tenantPhone: null,
      tenantCitizenId: null,
      leaseStartDate: null,
      leaseEndDate: null,
      depositPaid: null,
      tenantCount: 1,
      vehicleCount: 0,
      description: 'Phòng ban công thoáng sáng lầu 3 tại 14B9 Ngô Tất Tố, sẵn sàng bàn giao ở ngay.',
      images: [
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
      ],
    });

    // 6. Đồng bộ hóa đơn T10 & T11/2026: chỉ số điện/nước liên tiếp & đơn giá nước 20.000 đ/m³
    if (p101) {
      await upsertBilling(prisma, {
        propertyId: p101.id,
        periodMonth: 10,
        periodYear: 2026,
        electricityStart: 165,
        electricityEnd: 235,
        waterStart: 62,
        waterEnd: 68,
        electricityRate: 3800,
        waterRate: 20000,
        rentAmount: 4200000,
        serviceFee: 50000,
        status: BillingStatus.PAID,
        paidAt: new Date('2026-10-10T10:00:00.000Z'),
        note: 'Kỳ T10/2026 - P101 (14B8 Ngô Tất Tố)',
      });
      await upsertBilling(prisma, {
        propertyId: p101.id,
        periodMonth: 11,
        periodYear: 2026,
        electricityStart: 235,
        electricityEnd: 265,
        waterStart: 68,
        waterEnd: 70,
        electricityRate: 3800,
        waterRate: 20000,
        rentAmount: 4200000,
        serviceFee: 50000,
        status: BillingStatus.PAID,
        paidAt: new Date('2026-11-08T09:15:00.000Z'),
        note: 'Kỳ T11/2026 - P101 (14B8 Ngô Tất Tố)',
      });
    }

    if (p201) {
      await upsertBilling(prisma, {
        propertyId: p201.id,
        periodMonth: 10,
        periodYear: 2026,
        electricityStart: 95,
        electricityEnd: 150,
        waterStart: 32,
        waterEnd: 42,
        electricityRate: 3800,
        waterRate: 20000,
        rentAmount: 3800000,
        serviceFee: 50000,
        status: BillingStatus.PAID,
        paidAt: new Date('2026-10-12T10:00:00.000Z'),
        note: 'Kỳ T10/2026 - P201 (14B8 Ngô Tất Tố)',
      });
      await upsertBilling(prisma, {
        propertyId: p201.id,
        periodMonth: 11,
        periodYear: 2026,
        electricityStart: 150,
        electricityEnd: 200,
        waterStart: 42,
        waterEnd: 50,
        electricityRate: 3800,
        waterRate: 20000,
        rentAmount: 3800000,
        serviceFee: 50000,
        status: BillingStatus.PAID,
        paidAt: new Date('2026-11-11T10:30:00.000Z'),
        note: 'Kỳ T11/2026 - P201 (14B8 Ngô Tất Tố)',
      });
    }

    if (p202) {
      await upsertBilling(prisma, {
        propertyId: p202.id,
        periodMonth: 11,
        periodYear: 2026,
        electricityStart: 0,
        electricityEnd: 50,
        waterStart: 0,
        waterEnd: 5,
        electricityRate: 3800,
        waterRate: 20000,
        rentAmount: 3500000,
        serviceFee: 50000,
        status: BillingStatus.UNPAID,
        note: 'Kỳ T11/2026 - P202 (14B8 Ngô Tất Tố)',
      });
    }

    // MB-14B9 hiện AVAILABLE: xóa hóa đơn T11 UNPAID cũ (nếu có) và cập nhật T10 PAID trước khi bàn giao trống
    await prisma.billing.deleteMany({
      where: { propertyId: mb14B9.id, periodMonth: 11, periodYear: 2026 },
    });
    await upsertBilling(prisma, {
      propertyId: mb14B9.id,
      periodMonth: 10,
      periodYear: 2026,
      electricityStart: 2100,
      electricityEnd: 2480,
      waterStart: 110,
      waterEnd: 118,
      electricityRate: 3800,
      waterRate: 20000,
      rentAmount: 12000000,
      serviceFee: 100000,
      status: BillingStatus.PAID,
      paidAt: new Date('2026-10-31T10:00:00.000Z'),
      note: 'Tất toán mặt bằng tầng trệt 14B9 kỳ T10/2026',
    });

    await upsertBilling(prisma, {
      propertyId: p201B9.id,
      periodMonth: 10,
      periodYear: 2026,
      electricityStart: 420,
      electricityEnd: 515,
      waterStart: 30,
      waterEnd: 34,
      electricityRate: 3800,
      waterRate: 20000,
      rentAmount: 4600000,
      serviceFee: 50000,
      status: BillingStatus.PAID,
      paidAt: new Date('2026-10-06T14:20:00.000Z'),
    });
    await upsertBilling(prisma, {
      propertyId: p201B9.id,
      periodMonth: 11,
      periodYear: 2026,
      electricityStart: 515,
      electricityEnd: 605,
      waterStart: 34,
      waterEnd: 38,
      electricityRate: 3800,
      waterRate: 20000,
      rentAmount: 4600000,
      serviceFee: 50000,
      status: BillingStatus.PAID,
      paidAt: new Date('2026-11-06T11:10:00.000Z'),
    });

    await upsertBilling(prisma, {
      propertyId: p202B9.id,
      periodMonth: 10,
      periodYear: 2026,
      electricityStart: 310,
      electricityEnd: 385,
      waterStart: 22,
      waterEnd: 26,
      electricityRate: 3800,
      waterRate: 20000,
      rentAmount: 4300000,
      serviceFee: 50000,
      status: BillingStatus.PAID,
      paidAt: new Date('2026-10-15T08:45:00.000Z'),
    });

    // 7. Làm sạch toàn bộ lịch hẹn cũ/trùng và tạo 3 lịch hẹn chuẩn xác cho 3 đơn vị đang mở thuê
    await prisma.bookingRequest.deleteMany({});

    const cleanBookings = [
      p303
        ? {
            propertyId: p303.id,
            customerName: 'Nguyễn Minh Tuấn',
            customerPhone: '0908345612',
            desiredMoveIn: new Date('2026-11-18T00:00:00.000Z'),
            source: 'Website',
            status: BookingStatus.PENDING,
            message: 'Mình muốn qua xem phòng P303 tại 14B8 Ngô Tất Tố sau 18h chiều nay.',
          }
        : null,
      p301B9
        ? {
            propertyId: p301B9.id,
            customerName: 'Trần Thảo Vy',
            customerPhone: '0919823411',
            desiredMoveIn: new Date('2026-11-19T00:00:00.000Z'),
            source: 'Zalo',
            status: BookingStatus.CONFIRMED,
            message: 'Chị hẹn 10h sáng mai ghé xem phòng ban công lầu 3 (P301-B9) tại 14B9 Ngô Tất Tố.',
          }
        : null,
      mb14B9
        ? {
            propertyId: mb14B9.id,
            customerName: 'Lê Hoàng Nam',
            customerPhone: '0983112490',
            desiredMoveIn: new Date('2026-11-20T00:00:00.000Z'),
            source: 'AI_AGENT',
            status: BookingStatus.PENDING,
            message: 'Mình muốn xem mặt bằng tầng trệt 14B9 Ngô Tất Tố để mở cửa hàng.',
          }
        : null,
    ].filter((b): b is NonNullable<typeof b> => b !== null);

    if (cleanBookings.length > 0) {
      await prisma.bookingRequest.createMany({ data: cleanBookings });
    }

    console.log('✔ Đồng bộ toàn diện dữ liệu 2 tòa nhà (14B8 & 14B9 Ngô Tất Tố) hoàn tất.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('✘ Seed failed:', err);
  process.exit(1);
});
