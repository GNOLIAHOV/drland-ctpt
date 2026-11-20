import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { MAIL_TRANSPORTER } from './../src/notifications/notifications.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

/**
 * Requires: Postgres running (npm run db:up) and admin seeded (npm run db:seed).
 */
describe('Bookings & Rate Limit (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let availablePropertyId: string;
  let rentedPropertyId: string;
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'e2e-mock-msg' });

  const prefix = `BKG${Date.now().toString(36).toUpperCase()}`;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const validBody = (extra: Record<string, unknown> = {}) => ({
    propertyId: availablePropertyId,
    guestName: 'Nguyễn Văn Khách',
    phoneNumber: '0909123456',
    appointmentTime: '2026-11-20',
    message: 'Đặt lịch từ AI Agent',
    ...extra,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORTER)
      .useValue({ sendMail: mockSendMail })
      .compile();
    app = configureApp(moduleFixture.createNestApplication());
    // Enable trust proxy so X-Forwarded-For can isolate IPs in tests if needed
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
    prisma = app.get(PrismaService);

    token = (
      await http()
        .post('/auth/login')
        .send({
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        })
        .expect(200)
    ).body.accessToken;

    availablePropertyId = (
      await http()
        .post('/properties')
        .set(auth())
        .send({
          code: `${prefix}-AVL`,
          name: 'Phòng Trống',
          address: '10 Nguyễn Huệ',
          area: 25,
          monthlyRent: 4_000_000,
          electricityRate: 3500,
          waterRate: 15000,
          status: 'AVAILABLE',
        })
        .expect(201)
    ).body.id;

    rentedPropertyId = (
      await http()
        .post('/properties')
        .set(auth())
        .send({
          code: `${prefix}-RNT`,
          name: 'Phòng Đã Thuê',
          address: '12 Nguyễn Huệ',
          area: 25,
          monthlyRent: 4_000_000,
          electricityRate: 3500,
          waterRate: 15000,
          status: 'RENTED',
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await prisma.bookingRequest.deleteMany({
      where: { property: { code: { startsWith: prefix } } },
    });
    await prisma.property.deleteMany({
      where: { code: { startsWith: prefix } },
    });
    await app.close();
  });

  // ───────────── Public creation & Business logic ─────────────

  describe('POST /bookings (Public)', () => {
    it('201 — creates a PENDING booking without JWT token and triggers async email notification', async () => {
      mockSendMail.mockClear();

      const res = await http()
        .post('/bookings')
        .set('X-Forwarded-For', '10.0.0.1')
        .send(validBody())
        .expect(201);

      expect(res.body).toMatchObject({
        propertyId: availablePropertyId,
        guestName: 'Nguyễn Văn Khách',
        phoneNumber: '0909123456',
        appointmentTime: '2026-11-20',
        status: 'PENDING',
        source: 'AI_AGENT',
      });

      // Wait briefly for the async @OnEvent('booking.created') listener to finish
      await new Promise((r) => setTimeout(r, 150));

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailPayload = mockSendMail.mock.calls[0][0];
      expect(mailPayload.text).toContain(availablePropertyId);
      expect(mailPayload.text).toContain('Nguyễn Văn Khách');
      expect(mailPayload.text).toContain('0909123456');
      expect(mailPayload.text).toContain('2026-11-20');

      const dbRow = await prisma.bookingRequest.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(dbRow.notifiedAt).not.toBeNull();
    });

    it('404 — rejects when propertyId does not exist', () =>
      http()
        .post('/bookings')
        .set('X-Forwarded-For', '10.0.0.2')
        .send(validBody({ propertyId: '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60' }))
        .expect(404));

    it('400 — rejects booking for a RENTED property', async () => {
      const res = await http()
        .post('/bookings')
        .set('X-Forwarded-For', '10.0.0.3')
        .send(validBody({ propertyId: rentedPropertyId }))
        .expect(400);
      expect(res.body.message).toContain('RENTED');
    });

    it('400 — validates required fields (propertyId, guestName, phoneNumber, appointmentTime)', () =>
      http()
        .post('/bookings')
        .set('X-Forwarded-For', '10.0.0.4')
        .send({
          propertyId: 'bad-uuid',
          guestName: '',
          phoneNumber: 'abc',
          appointmentTime: 'not-a-date',
        })
        .expect(400));
  });

  // ───────────── Admin Read ─────────────

  describe('GET /bookings (Admin only)', () => {
    it('401 without JWT token', () => http().get('/bookings').expect(401));

    it('200 with Admin JWT token', async () => {
      const res = await http()
        .get('/bookings')
        .set(auth())
        .query({ propertyId: availablePropertyId })
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ───────────── Rate Limiter (429 Too Many Requests) ─────────────

  describe('Rate Limiter (max 5 requests / minute / IP)', () => {
    it('allows 5 requests and blocks the 6th with 429 Too Many Requests', async () => {
      const spamIp = '203.0.113.99';

      for (let i = 1; i <= 5; i++) {
        await http()
          .post('/bookings')
          .set('X-Forwarded-For', spamIp)
          .send(validBody({ guestName: `Khách ${i}` }))
          .expect(201);
      }

      // 6th request within the same minute must be throttled with 429
      await http()
        .post('/bookings')
        .set('X-Forwarded-For', spamIp)
        .send(validBody({ guestName: 'Khách 6 (Spam)' }))
        .expect(429);
    });
  });
});
