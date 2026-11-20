import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  BOOKING_CREATED_EVENT,
  type BookingCreatedEvent,
} from '../bookings/events/booking-created.event.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const MAIL_TRANSPORTER = 'MAIL_TRANSPORTER';

export function createMailTransporter(config: ConfigService): Transporter {
  const host = config.get<string>('SMTP_HOST');
  const port = Number(config.get<string>('SMTP_PORT') ?? 587);
  const user = config.get<string>('SMTP_USER');
  const pass = config.get<string>('SMTP_PASS');

  if (!host || !user || !pass) {
    // Fallback to jsonTransport when SMTP credentials are not configured
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Listens asynchronously to `booking.created` without blocking the HTTP response.
   * Sends an email notification to the Admin and updates `notifiedAt` on success.
   */
  @OnEvent(BOOKING_CREATED_EVENT, { async: true })
  async handleBookingCreated(event: BookingCreatedEvent): Promise<void> {
    const from =
      this.config.get<string>('SMTP_FROM') ??
      'Core API <no-reply@core-api.local>';
    const to =
      this.config.get<string>('ADMIN_EMAIL') ??
      this.config.get<string>('SMTP_USER') ??
      'admin@core-api.local';

    const subject = `[Booking Mới] Phòng ${event.propertyCode} - Khách: ${event.guestName}`;
    const text = [
      'Hệ thống vừa nhận được yêu cầu đặt lịch xem phòng mới:',
      `- ID Phòng: ${event.propertyId} (${event.propertyCode} - ${event.propertyName})`,
      `- Tên khách: ${event.guestName}`,
      `- Số điện thoại: ${event.phoneNumber}`,
      `- Giờ hẹn / Ngày dự kiến: ${event.appointmentTime ?? 'Chưa xác định'}`,
      ...(event.guestEmail ? [`- Email khách: ${event.guestEmail}`] : []),
      ...(event.message ? [`- Lời nhắn: ${event.message}`] : []),
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
      });

      await this.prisma.bookingRequest.update({
        where: { id: event.bookingId },
        data: { notifiedAt: new Date() },
      });
    } catch (err) {
      // Never crash the process on background email failure
      this.logger.error(
        `Không thể gửi email thông báo cho booking ${event.bookingId}: ${(err as Error).message}`,
      );
    }
  }
}
