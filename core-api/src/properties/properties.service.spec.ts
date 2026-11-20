import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PropertiesService, toPropertyResponse } from './properties.service.js';

const ID = '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`mock ${code}`, {
    code,
    clientVersion: 'test',
  });

const dbProperty = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  code: 'P101',
  name: 'Phòng 101',
  type: 'ROOM',
  address: '1 Lê Lợi',
  area: new Prisma.Decimal('20.5'),
  monthlyRent: new Prisma.Decimal('3000000'),
  deposit: null,
  electricityRate: new Prisma.Decimal('3500'),
  waterRate: new Prisma.Decimal('15000'),
  serviceFee: new Prisma.Decimal('0'),
  status: 'AVAILABLE',
  availableFrom: null,
  description: null,
  images: [],
  tenantName: null,
  tenantPhone: null,
  tenantCitizenId: null,
  leaseStartDate: null,
  leaseEndDate: null,
  depositPaid: null,
  tenantCount: 1,
  vehicleCount: 0,
  rentalNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PropertiesService', () => {
  let prisma: {
    property: Record<string, ReturnType<typeof vi.fn>>;
    bookingRequest: Record<string, ReturnType<typeof vi.fn>>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  let service: PropertiesService;

  beforeEach(() => {
    prisma = {
      property: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      bookingRequest: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new PropertiesService(prisma as unknown as PrismaService);
  });

  describe('toPropertyResponse', () => {
    it('converts Decimals to numbers and dates to YYYY-MM-DD', () => {
      const res = toPropertyResponse(
        dbProperty({
          deposit: new Prisma.Decimal('6000000'),
          availableFrom: new Date('2026-11-15T00:00:00.000Z'),
        }) as never,
      );
      expect(res.area).toBe(20.5);
      expect(res.monthlyRent).toBe(3_000_000);
      expect(res.deposit).toBe(6_000_000);
      expect(res.availableFrom).toBe('2026-11-15');
    });
  });

  describe('findAll', () => {
    it('applies filters and pagination', async () => {
      prisma.property.findMany.mockResolvedValue([dbProperty()]);
      prisma.property.count.mockResolvedValue(21);

      const res = await service.findAll({
        status: 'AVAILABLE',
        minRent: 1_000_000,
        page: 2,
        limit: 10,
      });

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'AVAILABLE',
            type: undefined,
            monthlyRent: { gte: 1_000_000, lte: undefined },
          },
          skip: 10,
          take: 10,
        }),
      );
      expect(res.meta).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
      expect(res.data[0].monthlyRent).toBe(3_000_000);
    });

    it('rejects minRent > maxRent', async () => {
      await expect(
        service.findAll({ minRent: 5, maxRent: 1, page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('throws 404 when not found', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.findOne(ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('converts availableFrom to a UTC date', async () => {
      prisma.property.create.mockResolvedValue(dbProperty());
      await service.create({
        code: 'P101',
        name: 'Phòng 101',
        address: 'x',
        area: 20,
        monthlyRent: 1,
        electricityRate: 1,
        waterRate: 1,
        status: 'SOON_TO_BE_AVAILABLE',
        availableFrom: '2026-11-15',
      });
      expect(prisma.property.create.mock.calls[0][0].data.availableFrom).toEqual(
        new Date('2026-11-15T00:00:00.000Z'),
      );
    });

    it('maps P2002 (duplicate code) to 409', async () => {
      prisma.property.create.mockRejectedValue(prismaError('P2002'));
      await expect(
        service.create({
          code: 'P101',
          name: 'n',
          address: 'a',
          area: 1,
          monthlyRent: 1,
          electricityRate: 1,
          waterRate: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('throws 404 when property does not exist', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(
        service.update(ID, { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it('requires availableFrom when switching to SOON_TO_BE_AVAILABLE', async () => {
      prisma.property.findUnique.mockResolvedValue({
        status: 'RENTED',
        availableFrom: null,
      });
      await expect(
        service.update(ID, { status: 'SOON_TO_BE_AVAILABLE' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows SOON_TO_BE_AVAILABLE when the existing row already has a date', async () => {
      prisma.property.findUnique.mockResolvedValue({
        status: 'RENTED',
        availableFrom: new Date('2026-12-01'),
      });
      prisma.property.update.mockResolvedValue(
        dbProperty({ status: 'SOON_TO_BE_AVAILABLE' }),
      );
      await expect(
        service.update(ID, { status: 'SOON_TO_BE_AVAILABLE' }),
      ).resolves.toMatchObject({ status: 'SOON_TO_BE_AVAILABLE' });
    });

    it('rejects clearing availableFrom while status stays SOON_TO_BE_AVAILABLE', async () => {
      prisma.property.findUnique.mockResolvedValue({
        status: 'SOON_TO_BE_AVAILABLE',
        availableFrom: new Date('2026-12-01'),
      });
      await expect(
        service.update(ID, { availableFrom: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps P2002 to 409 when changing code to an existing one', async () => {
      prisma.property.findUnique.mockResolvedValue({
        status: 'AVAILABLE',
        availableFrom: null,
      });
      prisma.property.update.mockRejectedValue(prismaError('P2002'));
      await expect(
        service.update(ID, { code: 'P102' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes the property', async () => {
      prisma.property.findUnique.mockResolvedValue({
        ...dbProperty(),
        _count: { billings: 0, bookingRequests: 0 },
      });
      prisma.bookingRequest.deleteMany.mockResolvedValue({ count: 0 });
      prisma.property.delete.mockResolvedValue(dbProperty());
      await expect(service.remove(ID)).resolves.toBeUndefined();
    });

    it('rejects deletion with 409 if property has billings', async () => {
      prisma.property.findUnique.mockResolvedValue({
        ...dbProperty(),
        _count: { billings: 2, bookingRequests: 0 },
      });
      const err = await service.remove(ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).message).toContain(
        'Không thể xóa phòng này vì đã có dữ liệu hóa đơn',
      );
    });

    it('rejects deletion with 400 if property status is not AVAILABLE', async () => {
      prisma.property.findUnique.mockResolvedValue({
        ...dbProperty({ status: 'RENTED' }),
        _count: { billings: 0, bookingRequests: 0 },
      });
      const err = await service.remove(ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain(
        'Chỉ những phòng đang trống (AVAILABLE) mới được phép xóa',
      );
    });

    it('maps record not found to 404', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.remove(ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rethrows unknown errors untouched', async () => {
      prisma.property.findUnique.mockResolvedValue({
        ...dbProperty(),
        _count: { billings: 0, bookingRequests: 0 },
      });
      const boom = new Error('db down');
      prisma.property.delete.mockRejectedValue(boom);
      await expect(service.remove(ID)).rejects.toBe(boom);
    });

    it('correctly maps tenant fields and dates in toPropertyResponse', () => {
      const prop = dbProperty({
        status: 'RENTED',
        tenantName: 'Nguyễn Văn An',
        tenantPhone: '0912345678',
        tenantCitizenId: '079201001234',
        depositPaid: new Prisma.Decimal('5000000'),
        leaseStartDate: new Date('2026-11-01T00:00:00.000Z'),
        leaseEndDate: new Date('2027-11-01T00:00:00.000Z'),
        tenantCount: 2,
        vehicleCount: 2,
        rentalNotes: 'Bàn giao 1 điều hòa Daikin, 2 chìa khóa cổng',
      });
      const res = toPropertyResponse(prop as any);
      expect(res.tenantName).toBe('Nguyễn Văn An');
      expect(res.tenantPhone).toBe('0912345678');
      expect(res.tenantCitizenId).toBe('079201001234');
      expect(res.depositPaid).toBe(5000000);
      expect(res.leaseStartDate).toBe('2026-11-01');
      expect(res.leaseEndDate).toBe('2027-11-01');
      expect(res.tenantCount).toBe(2);
      expect(res.vehicleCount).toBe(2);
      expect(res.rentalNotes).toBe('Bàn giao 1 điều hòa Daikin, 2 chìa khóa cổng');
    });
  });
});
