import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

/**
 * Requires: Postgres running (npm run db:up) and admin seeded (npm run db:seed).
 * All test rows use a unique code prefix and are removed in afterAll.
 */
describe('Properties (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  const prefix = `E2E${Date.now().toString(36).toUpperCase()}`;
  const code = (s: string) => `${prefix}-${s}`;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const payload = (s: string, extra: Record<string, unknown> = {}) => ({
    code: code(s),
    name: `Phòng ${s}`,
    type: 'ROOM',
    address: '1 Lê Lợi, Q1, HCM',
    area: 25.5,
    monthlyRent: 3_500_000,
    deposit: 3_500_000,
    electricityRate: 3500,
    waterRate: 15000,
    serviceFee: 100_000,
    images: ['https://example.com/a.jpg'],
    ...extra,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const res = await http()
      .post('/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    const where = { property: { code: { startsWith: prefix } } };
    await prisma.billing.deleteMany({ where });
    await prisma.bookingRequest.deleteMany({ where });
    await prisma.property.deleteMany({
      where: { code: { startsWith: prefix } },
    });
    await app.close();
  });

  // ───────────── Boundaries: auth ─────────────

  describe('JwtAuthGuard on write routes', () => {
    const someId = '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60';

    it('POST without token → 401', () =>
      http().post('/properties').send(payload('NOAUTH')).expect(401));

    it('PATCH without token → 401', () =>
      http().patch(`/properties/${someId}`).send({ name: 'x' }).expect(401));

    it('DELETE without token → 401', () =>
      http().delete(`/properties/${someId}`).expect(401));

    it('POST with forged token → 401', () =>
      http()
        .post('/properties')
        .set('Authorization', 'Bearer abc.def.ghi')
        .send(payload('FORGED'))
        .expect(401));
  });

  // ───────────── Full CRUD flow ─────────────

  describe('CRUD flow', () => {
    let id: string;

    it('POST /properties → 201, numbers returned as numbers', async () => {
      const res = await http()
        .post('/properties')
        .set(auth())
        .send(payload('101', { code: `${prefix.toLowerCase()}-101` })) // lower-case → normalised
        .expect(201);

      id = res.body.id;
      expect(res.body).toMatchObject({
        code: code('101'),
        status: 'AVAILABLE',
        area: 25.5,
        monthlyRent: 3_500_000,
        serviceFee: 100_000,
        availableFrom: null,
      });
    });

    it('GET /properties/:id is public → 200', async () => {
      const res = await http().get(`/properties/${id}`).expect(200);
      expect(res.body.code).toBe(code('101'));
    });

    it('GET /properties is public, supports filters + pagination', async () => {
      await http().post('/properties').set(auth()).send(
        payload('MB01', {
          type: 'COMMERCIAL_SPACE',
          monthlyRent: 15_000_000,
          status: 'RENTED',
        }),
      ).expect(201);

      const res = await http()
        .get('/properties')
        .query({ type: 'COMMERCIAL_SPACE', minRent: 10_000_000, limit: 100 })
        .expect(200);

      const codes = res.body.data.map((p: { code: string }) => p.code);
      expect(codes).toContain(code('MB01'));
      expect(codes).not.toContain(code('101'));
      expect(res.body.meta).toMatchObject({ page: 1, limit: 100 });
    });

    it('POST duplicate code → 409', () =>
      http().post('/properties').set(auth()).send(payload('101')).expect(409));

    it('PATCH → "Sắp trống" without availableFrom → 400', () =>
      http()
        .patch(`/properties/${id}`)
        .set(auth())
        .send({ status: 'SOON_TO_BE_AVAILABLE' })
        .expect(400));

    it('PATCH → "Sắp trống" with availableFrom → 200', async () => {
      const res = await http()
        .patch(`/properties/${id}`)
        .set(auth())
        .send({ status: 'SOON_TO_BE_AVAILABLE', availableFrom: '2026-12-01' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'SOON_TO_BE_AVAILABLE',
        availableFrom: '2026-12-01',
        monthlyRent: 3_500_000, // untouched fields preserved
      });
    });

    it('PATCH unknown id → 404', () =>
      http()
        .patch('/properties/3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60')
        .set(auth())
        .send({ name: 'x' })
        .expect(404));

    it('DELETE → 204, then GET → 404', async () => {
      await http().delete(`/properties/${id}`).set(auth()).expect(204);
      await http().get(`/properties/${id}`).expect(404);
    });
  });

  // ───────────── Validation ─────────────

  describe('Validation (class-validator)', () => {
    it.each([
      ['invalid status enum', { status: 'EMPTY' }],
      ['invalid type enum', { type: 'HOUSE' }],
      ['negative rent', { monthlyRent: -1 }],
      ['rent as string', { monthlyRent: '3500000' }],
      ['area = 0', { area: 0 }],
      ['too many decimals', { waterRate: 1.234 }],
      ['SOON without date', { status: 'SOON_TO_BE_AVAILABLE' }],
      ['impossible date', { availableFrom: '2026-02-30' }],
      ['bad image url', { images: ['nope'] }],
      ['unknown field', { isAdmin: true }],
    ])('POST with %s → 400', async (_label, extra) => {
      await http()
        .post('/properties')
        .set(auth())
        .send(payload('BAD', extra))
        .expect(400);
    });

    it('GET /properties/not-a-uuid → 400', () =>
      http().get('/properties/not-a-uuid').expect(400));

    it('GET /properties?limit=500 → 400', () =>
      http().get('/properties').query({ limit: 500 }).expect(400));

    it('GET /properties?minRent>maxRent → 400', () =>
      http().get('/properties').query({ minRent: 5, maxRent: 1 }).expect(400));
  });

  // ───────────── P2003 → 409 ─────────────

  describe('DELETE protected by FK (P2003 → 409)', () => {
    it.each(['billing', 'booking'])(
      'refuses to delete a property that has a %s',
      async (kind) => {
        const created = await http()
          .post('/properties')
          .set(auth())
          // Keep code ≤ 20 chars (DTO rule): prefix (~11) + "-FKB"/"-FKK".
          .send(payload(kind === 'billing' ? 'FKB' : 'FKK'))
          .expect(201);
        const propertyId: string = created.body.id;

        if (kind === 'billing') {
          await prisma.billing.create({
            data: {
              propertyId,
              periodMonth: 10,
              periodYear: 2026,
              electricityStart: 100,
              electricityEnd: 150,
              waterStart: 10,
              waterEnd: 15,
              electricityRate: 3500,
              waterRate: 15000,
              rentAmount: 3_500_000,
              electricityAmount: 175_000,
              waterAmount: 75_000,
              serviceFee: 100_000,
              totalAmount: 3_850_000,
            },
          });
        } else {
          await prisma.bookingRequest.create({
            data: {
              propertyId,
              customerName: 'Nguyễn Văn A',
              customerPhone: '0900000000',
            },
          });
        }

        const res = await http()
          .delete(`/properties/${propertyId}`)
          .set(auth())
          .expect(409);
        expect(res.body.message).toContain(
          'đã có dữ liệu hóa đơn hoặc yêu cầu đặt phòng',
        );

        // Property must still exist.
        await http().get(`/properties/${propertyId}`).expect(200);
      },
    );
  });
});
