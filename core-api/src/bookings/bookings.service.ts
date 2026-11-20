import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type BookingRequest } from '../generated/prisma/client.js';
import { BookingStatus, PropertyStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
import type { QueryBookingDto } from './dto/query-booking.dto.js';
import {
  BOOKING_CREATED_EVENT,
  type BookingCreatedEvent,
} from './events/booking-created.event.js';

const propertySummary = {
  select: { id: true, code: true, name: true, status: true },
} as const;

type BookingWithProperty = BookingRequest & {
  property: { id: string; code: string; name: string; status: PropertyStatus };
};

export interface BookingResponse {
  id: string;
  propertyId: string;
  property: { id: string; code: string; name: string; status: PropertyStatus };
  guestName: string;
  phoneNumber: string;
  guestEmail: string | null;
  appointmentTime: string | null;
  message: string | null;
  source: string;
  status: BookingStatus;
  notifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedBookings {
  data: BookingResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const toBookingResponse = (b: BookingWithProperty): BookingResponse => ({
  id: b.id,
  propertyId: b.propertyId,
  property: b.property,
  guestName: b.customerName,
  phoneNumber: b.customerPhone,
  guestEmail: b.customerEmail ?? null,
  appointmentTime: b.desiredMoveIn
    ? b.desiredMoveIn.toISOString().slice(0, 10)
    : null,
  message: b.message ?? null,
  source: b.source,
  status: b.status,
  notifiedAt: b.notifiedAt,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

const toDate = (value: string): Date =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

const PLACEHOLDER_GUEST_NAMES = new Set<string>([
  'anh/chị',
  'anh/chi',
  'anh chị',
  'anh chi',
  'anh',
  'chị',
  'chi',
  'em',
  'bạn',
  'ban',
  'quý khách',
  'quy khach',
  'khách',
  'khach',
  'khách hàng',
  'khach hang',
  'quý anh/chị',
  'quy anh/chi',
  'chưa rõ',
  'chua ro',
  'không rõ',
  'khong ro',
  'chưa có',
  'chua co',
  'chưa cung cấp',
  'chua cung cap',
  'tên khách',
  'ten khach',
  'họ tên',
  'ho ten',
  'họ và tên',
  'ho va ten',
  'khách xem phòng',
  'khach xem phong',
  'khách đặt lịch',
  'khach dat lich',
  'khách thuê',
  'khach thue',
  'người thuê',
  'nguoi thue',
  'quý khách hàng',
  'quy khach hang',
  'anh/chị khách',
  'anh/chi khach',
  'chưa biết',
  'chua biet',
  'chưa có tên',
  'chua co ten',
  'không có tên',
  'khong co ten',
  'anonymous',
  'unknown',
  'guest',
  'customer',
  'user',
  'client',
  'none',
  'null',
  'n/a',
  'na',
]);

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('84')) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function isPlaceholderGuestName(raw: string): boolean {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');

  if (
    normalized.length < 2 ||
    /^\d+$/.test(normalized) ||
    /^[\d\s.+\-()]+$/.test(normalized)
  ) {
    return true;
  }

  return PLACEHOLDER_GUEST_NAMES.has(normalized);
}

export function extractAppointmentHour(iso: string): string | null {
  const match = /[T ](\d{2}):(\d{2})/.exec(iso);
  if (!match) {
    return null;
  }

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || (hh === 0 && mm === 0)) {
    return null;
  }

  return `${match[1]}:${match[2]}`;
}

export function mergeHourIntoMessage(
  message: string | undefined,
  hour: string | null,
): string | undefined {
  const trimmed = message?.trim();
  const cleanMessage = trimmed ? trimmed : undefined;

  if (!hour) {
    return cleanMessage;
  }

  if (cleanMessage && /Giờ hẹn:\s*\d{2}:\d{2}/i.test(cleanMessage)) {
    return cleanMessage.replace(/Giờ hẹn:\s*\d{2}:\d{2}/i, `Giờ hẹn: ${hour}`);
  }

  return cleanMessage ? `Giờ hẹn: ${hour} — ${cleanMessage}` : `Giờ hẹn: ${hour}`;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateBookingDto): Promise<BookingResponse> {
    if (isPlaceholderGuestName(dto.guestName)) {
      throw new BadRequestException(
        'Vui lòng cung cấp tên thật của khách hàng (không dùng đại từ chung như "Anh/Chị").',
      );
    }

    const normalizedPhone = normalizePhone(dto.phoneNumber);
    if (
      normalizedPhone.length < 8 ||
      normalizedPhone.length > 15 ||
      new Set(normalizedPhone).size <= 1
    ) {
      throw new BadRequestException('Số điện thoại của khách hàng không hợp lệ.');
    }

    const settings = await this.prisma.systemSetting?.findUnique({
      where: { id: 'default' },
      select: { hotline: true, zaloPhone: true },
    });

    const landlordPhones = new Set<string>();
    if (settings?.hotline) {
      const normalizedHotline = normalizePhone(settings.hotline);
      if (normalizedHotline) landlordPhones.add(normalizedHotline);
    }
    if (settings?.zaloPhone) {
      const normalizedZalo = normalizePhone(settings.zaloPhone);
      if (normalizedZalo) landlordPhones.add(normalizedZalo);
    }

    if (landlordPhones.has(normalizedPhone)) {
      throw new BadRequestException(
        'Số điện thoại đặt lịch không được trùng với số Hotline/Zalo của chủ nhà. Vui lòng nhập số điện thoại của khách hàng.',
      );
    }

    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: { id: true, code: true, status: true },
    });

    if (!property) {
      throw new NotFoundException(
        `Không tìm thấy phòng với id ${dto.propertyId}`,
      );
    }

    if (
      property.status === PropertyStatus.RENTED ||
      property.status === PropertyStatus.DEPOSITED
    ) {
      const statusLabel =
        property.status === PropertyStatus.RENTED
          ? 'đang được cho thuê (RENTED)'
          : 'đã có khách đặt cọc giữ chỗ (DEPOSITED)';
      throw new BadRequestException(
        `Phòng ${property.code} hiện ${statusLabel}, không thể đặt lịch xem phòng`,
      );
    }

    const targetDate = toDate(dto.appointmentTime);
    const appointmentHour = extractAppointmentHour(dto.appointmentTime);
    const finalMessage = mergeHourIntoMessage(dto.message, appointmentHour);

    const existingCandidates =
      (await this.prisma.bookingRequest.findMany({
        where: {
          propertyId: dto.propertyId,
          desiredMoveIn: targetDate,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
        include: { property: propertySummary },
        orderBy: { createdAt: 'desc' },
      })) ?? [];

    const duplicate = existingCandidates.find(
      (item) => normalizePhone(item.customerPhone) === normalizedPhone,
    );

    if (duplicate) {
      if (
        duplicate.status === BookingStatus.PENDING &&
        Boolean(finalMessage) &&
        finalMessage !== duplicate.message &&
        this.prisma.bookingRequest.update
      ) {
        const updated = await this.prisma.bookingRequest.update({
          where: { id: duplicate.id },
          data: { message: finalMessage },
          include: { property: propertySummary },
        });
        return toBookingResponse(updated);
      }

      return toBookingResponse(duplicate);
    }

    const created = await this.prisma.bookingRequest.create({
      data: {
        propertyId: dto.propertyId,
        customerName: dto.guestName,
        customerPhone: dto.phoneNumber,
        customerEmail: dto.guestEmail,
        desiredMoveIn: targetDate,
        message: finalMessage,
        source: dto.source || 'AI_AGENT',
        status: BookingStatus.PENDING,
      },
      include: { property: propertySummary },
    });

    const response = toBookingResponse(created);

    // Emit non-blocking event so HTTP 201 returns immediately without waiting for SMTP
    const payload: BookingCreatedEvent = {
      bookingId: response.id,
      propertyId: response.propertyId,
      propertyCode: created.property.code,
      propertyName: created.property.name,
      guestName: response.guestName,
      phoneNumber: response.phoneNumber,
      guestEmail: response.guestEmail,
      appointmentTime: response.appointmentTime,
      message: response.message,
    };
    this.events.emit(BOOKING_CREATED_EVENT, payload);

    return response;
  }

  async findAll(query: QueryBookingDto): Promise<PaginatedBookings> {
    const { propertyId, status, page, limit } = query;
    const where: Prisma.BookingRequestWhereInput = {
      propertyId,
      status,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.bookingRequest.findMany({
        where,
        include: { property: propertySummary },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bookingRequest.count({ where }),
    ]);

    return {
      data: items.map(toBookingResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateStatus(id: string, status: BookingStatus): Promise<BookingResponse> {
    const existing = await this.prisma.bookingRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn với id ${id}`);
    }

    const updated = await this.prisma.bookingRequest.update({
      where: { id },
      data: { status },
      include: { property: propertySummary },
    });

    return toBookingResponse(updated);
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.bookingRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn với id ${id}`);
    }

    await this.prisma.bookingRequest.delete({ where: { id } });
    return { success: true, message: `Đã xóa lịch hẹn ${id}` };
  }
}
