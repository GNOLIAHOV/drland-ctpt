import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from './billing.service.js';
import { CreateBillingDto } from './dto/create-billing.dto.js';

const PROPERTY_ID = '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60';

const dto = (patch: Partial<CreateBillingDto> = {}): CreateBillingDto => ({
  propertyId: PROPERTY_ID,
  periodMonth: 10,
  periodYear: 2026,
  electricityOldIndex: 1200,
  electricityNewIndex: 1350,
  waterOldIndex: 300,
  waterNewIndex: 312,
  ...patch,
});

const property = {
  code: 'P101',
  monthlyRent: new Prisma.Decimal('3000000'),
  electricityRate: new Prisma.Decimal('3500'),
  waterRate: new Prisma.Decimal('15000'),
  serviceFee: new Prisma.Decimal('100000'),
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`mock ${code}`, { code, clientVersion: 'test' });

describe('CreateBillingDto validation', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateBillingDto, body))).map((e) => e.property);

  it('accepts a valid payload', async () => {
    expect(await errorsFor({ ...dto() })).toHaveLength(0);
  });

  it('accepts newIndex === oldIndex', async () => {
    expect(
      await errorsFor({ ...dto({ electricityNewIndex: 1200, waterNewIndex: 300 }) }),
    ).toHaveLength(0);
  });

  it('rejects electricityNewIndex < electricityOldIndex', async () => {
    expect(await errorsFor({ ...dto({ electricityNewIndex: 1199 }) })).toEqual([
      'electricityNewIndex',
    ]);
  });

  it('rejects waterNewIndex < waterOldIndex', async () => {
    expect(await errorsFor({ ...dto({ waterNewIndex: 299 }) })).toEqual(['waterNewIndex']);
  });

  it.each([
    ['electricityOldIndex', -1],
    ['waterNewIndex', -1],
    ['electricityNewIndex', 1350.5],
    ['waterOldIndex', '300'],
    ['periodMonth', 0],
    ['periodMonth', 13],
    ['periodYear', 1999],
    ['propertyId', 'not-a-uuid'],
  ])('rejects %s = %s', async (field, value) => {
    expect(await errorsFor({ ...dto(), [field]: value })).toContain(field);
  });
});

describe('BillingService', () => {
  let prisma: {
    property: { findUnique: ReturnType<typeof vi.fn> };
    billing: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let service: BillingService;

  beforeEach(() => {
    prisma = {
      property: { findUnique: vi.fn().mockResolvedValue(property) },
      billing: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'b1',
            status: 'UNPAID',
            paidAt: null,
            note: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            property: { id: PROPERTY_ID, code: 'P101', name: 'Phòng 101' },
            ...data,
          }),
        ),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new BillingService(prisma as unknown as PrismaService);
  });

  it('snapshots property prices and persists the full breakdown', async () => {
    const res = await service.create(dto());

    const data = prisma.billing.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      propertyId: PROPERTY_ID,
      periodMonth: 10,
      periodYear: 2026,
      electricityStart: 1200,
      electricityEnd: 1350,
      waterStart: 300,
      waterEnd: 312,
    });
    expect(Number(data.electricityRate)).toBe(3500);
    expect(Number(data.waterRate)).toBe(15000);
    expect(Number(data.rentAmount)).toBe(3_000_000);
    expect(Number(data.electricityAmount)).toBe(525_000);
    expect(Number(data.waterAmount)).toBe(180_000);
    expect(Number(data.serviceFee)).toBe(100_000);
    expect(Number(data.totalAmount)).toBe(3_805_000);

    expect(res.electricity).toEqual({
      oldIndex: 1200,
      newIndex: 1350,
      usage: 150,
      rate: 3500,
      amount: 525_000,
    });
    expect(res.totalAmount).toBe(3_805_000);
    expect(res.adjustmentAmount).toBe(0);
    expect(res.adjustmentNote).toBeNull();
  });

  it('applies adjustmentAmount and adjustmentNote when provided', async () => {
    const res = await service.create(
      dto({ adjustmentAmount: -100_000, adjustmentNote: 'Trừ tiền sửa bóng đèn' }),
    );
    expect(res.adjustmentAmount).toBe(-100_000);
    expect(res.adjustmentNote).toBe('Trừ tiền sửa bóng đèn');
    expect(res.totalAmount).toBe(3_705_000);
  });

  it('400 when deduction exceeds bill total', async () => {
    await expect(
      service.create(dto({ adjustmentAmount: -10_000_000 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.billing.create).not.toHaveBeenCalled();
  });

  it('404 when the property does not exist', async () => {
    prisma.property.findUnique.mockResolvedValue(null);
    await expect(service.create(dto())).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.billing.create).not.toHaveBeenCalled();
  });

  it('400 when the calculator rejects input (defence in depth behind the DTO)', async () => {
    const err = await service
      .create(dto({ electricityOldIndex: 500, electricityNewIndex: 100 }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/điện mới \(100\).*cũ \(500\)/);
    expect(prisma.billing.create).not.toHaveBeenCalled();
  });

  it('409 with a clear message on duplicate period (P2002)', async () => {
    prisma.billing.create.mockRejectedValue(prismaError('P2002'));
    const err = await service.create(dto({ periodMonth: 3 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe('Phòng P101 đã có hóa đơn kỳ 03/2026');
  });

  it('404 if the property vanished before insert (P2003)', async () => {
    prisma.billing.create.mockRejectedValue(prismaError('P2003'));
    await expect(service.create(dto())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne → 404 when missing', async () => {
    prisma.billing.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('markAsPaid', () => {
    it('marks an UNPAID billing as PAID and sets paidAt', async () => {
      prisma.billing.findUnique.mockResolvedValue({ id: 'b1', status: 'UNPAID' });
      const now = new Date();
      prisma.billing.update.mockResolvedValue({
        id: 'b1',
        propertyId: PROPERTY_ID,
        periodMonth: 10,
        periodYear: 2026,
        electricityStart: 1200,
        electricityEnd: 1350,
        waterStart: 300,
        waterEnd: 312,
        electricityRate: new Prisma.Decimal('3500'),
        waterRate: new Prisma.Decimal('15000'),
        rentAmount: new Prisma.Decimal('3000000'),
        electricityAmount: new Prisma.Decimal('525000'),
        waterAmount: new Prisma.Decimal('180000'),
        serviceFee: new Prisma.Decimal('100000'),
        totalAmount: new Prisma.Decimal('3805000'),
        status: 'PAID',
        paidAt: now,
        note: null,
        createdAt: now,
        updatedAt: now,
        property: { id: PROPERTY_ID, code: 'P101', name: 'Phòng 101' },
      });

      const res = await service.markAsPaid('b1');
      expect(res.status).toBe('PAID');
      expect(res.paidAt).toBe(now);
      expect(prisma.billing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: { status: 'PAID', paidAt: expect.any(Date) },
        }),
      );
    });

    it('404 when billing does not exist', async () => {
      prisma.billing.findUnique.mockResolvedValue(null);
      await expect(service.markAsPaid('b1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.billing.update).not.toHaveBeenCalled();
    });

    it('409 when billing is already PAID', async () => {
      prisma.billing.findUnique.mockResolvedValue({ id: 'b1', status: 'PAID' });
      await expect(service.markAsPaid('b1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.billing.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes billing when found and returns confirmation', async () => {
      prisma.billing.findUnique.mockResolvedValue({
        id: 'b1',
        periodMonth: 10,
        periodYear: 2026,
        property: { code: 'P101' },
      });
      prisma.billing.delete.mockResolvedValue({});

      const res = await service.remove('b1');
      expect(res.success).toBe(true);
      expect(res.message).toContain('P101');
      expect(prisma.billing.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    });

    it('throws NotFoundException when billing does not exist', async () => {
      prisma.billing.findUnique.mockResolvedValue(null);
      await expect(service.remove('b1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.billing.delete).not.toHaveBeenCalled();
    });
  });
});
