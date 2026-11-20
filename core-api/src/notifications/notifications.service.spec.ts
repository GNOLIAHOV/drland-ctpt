import type { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import type { BookingCreatedEvent } from '../bookings/events/booking-created.event.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

const sampleEvent: BookingCreatedEvent = {
  bookingId: 'bk-99',
  propertyId: '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60',
  propertyCode: 'P101',
  propertyName: 'Phòng 101',
  guestName: 'Trần Thị B',
  phoneNumber: '0987654321',
  guestEmail: 'tranthib@example.com',
  appointmentTime: '2026-11-25',
  message: 'Tôi muốn xem phòng vào buổi sáng',
};

describe('NotificationsService', () => {
  let transporter: { sendMail: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let prisma: { bookingRequest: { update: ReturnType<typeof vi.fn> } };
  let service: NotificationsService;

  beforeEach(() => {
    transporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-msg-id' }),
    };
    config = {
      get: vi.fn((key: string) => {
        const env: Record<string, string> = {
          SMTP_FROM: 'System <no-reply@core-api.local>',
          ADMIN_EMAIL: 'admin@core-api.local',
        };
        return env[key];
      }),
    };
    prisma = {
      bookingRequest: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new NotificationsService(
      transporter as unknown as Transporter,
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('sends an email containing guestName, phoneNumber, appointmentTime, and propertyId, then updates notifiedAt', async () => {
    await service.handleBookingCreated(sampleEvent);

    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
    const mailArgs = transporter.sendMail.mock.calls[0][0];
    expect(mailArgs.from).toBe('System <no-reply@core-api.local>');
    expect(mailArgs.to).toBe('admin@core-api.local');
    expect(mailArgs.subject).toContain('P101');
    expect(mailArgs.subject).toContain('Trần Thị B');
    expect(mailArgs.text).toContain(sampleEvent.propertyId);
    expect(mailArgs.text).toContain(sampleEvent.guestName);
    expect(mailArgs.text).toContain(sampleEvent.phoneNumber);
    expect(mailArgs.text).toContain(sampleEvent.appointmentTime);

    expect(prisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'bk-99' },
      data: { notifiedAt: expect.any(Date) },
    });
  });

  it('swallows SMTP errors gracefully without throwing or updating notifiedAt', async () => {
    transporter.sendMail.mockRejectedValue(new Error('SMTP connection timeout'));

    await expect(
      service.handleBookingCreated(sampleEvent),
    ).resolves.toBeUndefined();
    expect(prisma.bookingRequest.update).not.toHaveBeenCalled();
  });
});
