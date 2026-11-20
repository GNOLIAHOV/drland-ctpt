import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BookingsService, mergeHourIntoMessage } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BOOKING_CREATED_EVENT } from './events/booking-created.event.js';

const PROPERTY_ID = '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60';

const validPayload = {
  propertyId: PROPERTY_ID,
  guestName: '  Nguyễn Văn A  ',
  phoneNumber: ' 0901234567 ',
  appointmentTime: '2026-11-15',
  guestEmail: 'guest@example.com',
  message: 'Muốn xem phòng chiều thứ 7',
};

describe('CreateBookingDto validation', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    (
      await validate(plainToInstance(CreateBookingDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map((e) => e.property);

  it('accepts a valid payload and trims strings', async () => {
    const dto = plainToInstance(CreateBookingDto, validPayload);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.guestName).toBe('Nguyễn Văn A');
    expect(dto.phoneNumber).toBe('0901234567');
  });

  it('accepts full ISO 8601 datetime for appointmentTime', async () => {
    expect(
      await errorsFor({
        ...validPayload,
        appointmentTime: '2026-11-15T14:30:00.000Z',
      }),
    ).toHaveLength(0);
  });

  it('accepts ISO 8601 datetime with Vietnam timezone offset (+07:00)', async () => {
    expect(
      await errorsFor({
        ...validPayload,
        appointmentTime: '2026-11-21T14:00:00+07:00',
      }),
    ).toHaveLength(0);
  });

  it('accepts formatted Vietnamese phoneNumber with dots (0943.257.088)', async () => {
    expect(
      await errorsFor({
        ...validPayload,
        phoneNumber: '0943.257.088',
      }),
    ).toHaveLength(0);
  });

  it.each([
    ['propertyId', 'not-a-uuid'],
    ['guestName', '   '],
    ['phoneNumber', 'abc123'],
    ['phoneNumber', '12345'], // too short
    ['appointmentTime', '15/11/2026'],
    ['appointmentTime', '2026-02-30'],
    ['guestEmail', 'bad-email'],
    ['hackerField', true],
  ])('rejects invalid %s = %s', async (field, value) => {
    expect(await errorsFor({ ...validPayload, [field]: value })).toContain(
      field,
    );
  });
});

describe('BookingsService', () => {
  let prisma: {
    property: { findUnique: ReturnType<typeof vi.fn> };
    systemSetting: { findUnique: ReturnType<typeof vi.fn> };
    bookingRequest: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let events: { emit: ReturnType<typeof vi.fn> };
  let service: BookingsService;

  beforeEach(() => {
    prisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: PROPERTY_ID,
          code: 'P101',
          status: 'AVAILABLE',
        }),
      },
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue({
          hotline: '0943.257.089',
          zaloPhone: '0943257089',
        }),
      },
      bookingRequest: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'bk-1',
            source: 'AI_AGENT',
            notifiedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            property: {
              id: PROPERTY_ID,
              code: 'P101',
              name: 'Phòng 101',
              status: 'AVAILABLE',
            },
            ...data,
          }),
        ),
        update: vi.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            propertyId: PROPERTY_ID,
            customerName: 'Anh Long',
            customerPhone: '0943257088',
            customerEmail: null,
            desiredMoveIn: new Date('2026-11-21T00:00:00.000Z'),
            source: 'AI_AGENT',
            status: 'PENDING',
            notifiedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            property: {
              id: PROPERTY_ID,
              code: 'P101',
              name: 'Phòng 101',
              status: 'AVAILABLE',
            },
            ...data,
          }),
        ),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    events = { emit: vi.fn() };
    service = new BookingsService(
      prisma as unknown as PrismaService,
      events as unknown as EventEmitter2,
    );
  });

  it('creates a PENDING booking request and emits booking.created event without blocking', async () => {
    const res = await service.create({
      propertyId: PROPERTY_ID,
      guestName: 'Nguyễn Văn A',
      phoneNumber: '0901234567',
      appointmentTime: '2026-11-15',
    });

    expect(res.status).toBe('PENDING');
    expect(res.guestName).toBe('Nguyễn Văn A');
    expect(res.phoneNumber).toBe('0901234567');
    expect(res.appointmentTime).toBe('2026-11-15');
    expect(prisma.bookingRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: PROPERTY_ID,
          customerName: 'Nguyễn Văn A',
          customerPhone: '0901234567',
          status: 'PENDING',
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(BOOKING_CREATED_EVENT, {
      bookingId: 'bk-1',
      propertyId: PROPERTY_ID,
      propertyCode: 'P101',
      propertyName: 'Phòng 101',
      guestName: 'Nguyễn Văn A',
      phoneNumber: '0901234567',
      guestEmail: null,
      appointmentTime: '2026-11-15',
      message: null,
    });
  });

  it('throws 404 when propertyId does not exist', async () => {
    prisma.property.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        propertyId: PROPERTY_ID,
        guestName: 'Nguyễn Văn A',
        phoneNumber: '0901234567',
        appointmentTime: '2026-11-15',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('throws 400 when property status is RENTED', async () => {
    prisma.property.findUnique.mockResolvedValue({
      id: PROPERTY_ID,
      code: 'P101',
      status: 'RENTED',
    });

    const err = await service
      .create({
        propertyId: PROPERTY_ID,
        guestName: 'Nguyễn Văn A',
        phoneNumber: '0901234567',
        appointmentTime: '2026-11-15',
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain('RENTED');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('throws 400 when property status is DEPOSITED', async () => {
    prisma.property.findUnique.mockResolvedValue({
      id: PROPERTY_ID,
      code: 'P102',
      status: 'DEPOSITED',
    });

    const err = await service
      .create({
        propertyId: PROPERTY_ID,
        guestName: 'Trần Văn B',
        phoneNumber: '0909998888',
        appointmentTime: '2026-11-18',
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain('DEPOSITED');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it.each(['Anh/Chị', 'Khách hàng', 'Chưa rõ'])(
    'rejects placeholder guestName "%s" with 400 without creating or emitting',
    async (placeholderName) => {
      await expect(
        service.create({
          propertyId: PROPERTY_ID,
          guestName: placeholderName,
          phoneNumber: '0901234567',
          appointmentTime: '2026-11-21T14:00:00+07:00',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it.each(['0943257089', '0943.257.089', '+84 943 257 089'])(
    'rejects phoneNumber matching landlord hotline/Zalo "%s" with 400 without creating or emitting',
    async (hotlineVariant) => {
      await expect(
        service.create({
          propertyId: PROPERTY_ID,
          guestName: 'Anh Long',
          phoneNumber: hotlineVariant,
          appointmentTime: '2026-11-21T14:00:00+07:00',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it('preserves appointment hour (14:00) into message and leaves date-only message untouched', async () => {
    const withHour = await service.create({
      propertyId: PROPERTY_ID,
      guestName: 'Anh Long',
      phoneNumber: '0943257088',
      appointmentTime: '2026-11-21T14:00:00+07:00',
    });

    expect(withHour.message).toBe('Giờ hẹn: 14:00');
    expect(prisma.bookingRequest.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: 'Giờ hẹn: 14:00',
        }),
      }),
    );

    const dateOnly = await service.create({
      propertyId: PROPERTY_ID,
      guestName: 'Anh Long',
      phoneNumber: '0943257088',
      appointmentTime: '2026-11-15',
      message: 'Xem buổi sáng',
    });

    expect(dateOnly.message).toBe('Xem buổi sáng');
  });

  it('deduplicates repeat booking for same propertyId, normalized phone and desiredMoveIn', async () => {
    const existingRow = {
      id: 'bk-existing',
      propertyId: PROPERTY_ID,
      customerName: 'Long',
      customerPhone: '0943.257.088',
      customerEmail: null,
      desiredMoveIn: new Date('2026-11-21T00:00:00.000Z'),
      message: 'Giờ hẹn: 14:00',
      source: 'AI_AGENT',
      status: 'PENDING',
      notifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      property: {
        id: PROPERTY_ID,
        code: 'P303',
        name: 'Phòng Full Nội Thất View Thành Phố',
        status: 'AVAILABLE',
      },
    };
    prisma.bookingRequest.findMany.mockResolvedValue([existingRow]);

    const res = await service.create({
      propertyId: PROPERTY_ID,
      guestName: 'Anh Long',
      phoneNumber: '0943257088',
      appointmentTime: '2026-11-21T14:00:00+07:00',
    });

    expect(res.id).toBe('bk-existing');
    expect(res.guestName).toBe('Long');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
    expect(prisma.bookingRequest.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('updates message on existing PENDING booking when same customer changes appointment hour', async () => {
    const existingRow = {
      id: 'bk-existing',
      propertyId: PROPERTY_ID,
      customerName: 'Anh Long',
      customerPhone: '0943257088',
      customerEmail: null,
      desiredMoveIn: new Date('2026-11-21T00:00:00.000Z'),
      message: 'Giờ hẹn: 14:00',
      source: 'AI_AGENT',
      status: 'PENDING',
      notifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      property: {
        id: PROPERTY_ID,
        code: 'P303',
        name: 'Phòng Full Nội Thất View Thành Phố',
        status: 'AVAILABLE',
      },
    };
    prisma.bookingRequest.findMany.mockResolvedValue([existingRow]);

    const res = await service.create({
      propertyId: PROPERTY_ID,
      guestName: 'Anh Long',
      phoneNumber: '0943257088',
      appointmentTime: '2026-11-21T16:00:00+07:00',
    });

    expect(res.id).toBe('bk-existing');
    expect(res.message).toBe('Giờ hẹn: 16:00');
    expect(prisma.bookingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bk-existing' },
        data: { message: 'Giờ hẹn: 16:00' },
      }),
    );
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it.each(['Khách xem phòng', '0943257088'])(
    'rejects extended placeholder or digit-only guestName "%s" with 400',
    async (badName) => {
      await expect(
        service.create({
          propertyId: PROPERTY_ID,
          guestName: badName,
          phoneNumber: '0901234567',
          appointmentTime: '2026-11-21T14:00:00+07:00',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it.each(['0000000000', '--------'])(
    'rejects junk phoneNumber "%s" with 400',
    async (badPhone) => {
      await expect(
        service.create({
          propertyId: PROPERTY_ID,
          guestName: 'Anh Long',
          phoneNumber: badPhone,
          appointmentTime: '2026-11-21T14:00:00+07:00',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it('replaces stale Giờ hẹn hour prefix when rescheduling', () => {
    expect(mergeHourIntoMessage('Giờ hẹn: 14:00 — Xem sớm', '16:00')).toBe(
      'Giờ hẹn: 16:00 — Xem sớm',
    );
  });
});
