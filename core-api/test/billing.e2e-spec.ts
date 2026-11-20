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
 * Test rows use a unique property-code prefix and are removed in afterAll.
 */
describe('Billing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let propertyId: string;

  const prefix = `BIL${Date.now().toString(36).toUpperCase()}`;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const body = (extra: Record<string, unknown> = {}) => ({
    propertyId,
    periodMonth: 10,
    periodYear: 2026,
    electricityOldIndex: 1200,
    electricityNewIndex: 1350, // 150 kWh
    waterOldIndex: 300,
    waterNewIndex: 312, //        12 m³
    ...extra,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    token = (
      await http()
        .post('/auth/login')
        .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;

    propertyId = (
      await http()
        .post('/properties')
        .set(auth())
        .send({
          code: `${prefix}-1`,
          name: 'Phòng test billing',
          address: '1 Lê Lợi',
          area: 20,
          monthlyRent: 3_000_000,
          electricityRate: 3500,
          waterRate: 15000,
          serviceFee: 100_000,
          status: 'RENTED',
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await prisma.billing.deleteMany({ where: { property: { code: { startsWith: prefix } } } });
    await prisma.property.deleteMany({ where: { code: { startsWith: prefix } } });
    await app.close();
  });

  // ───────────── Auth ─────────────

  describe('JwtAuthGuard', () => {
    it('POST /billings without token → 401', () =>
      http().post('/billings').send(body()).expect(401));

    it('GET /billings without token → 401', () => http().get('/billings').expect(401));

    it('GET /billings/:id without token → 401', () =>
      http().get('/billings/3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60').expect(401));
  });

  // ───────────── Create + calculation ─────────────

  describe('POST /billings', () => {
    let billingId: string;

    it('201 — computes amounts and stores the price snapshot', async () => {
      const res = await http().post('/billings').set(auth()).send(body()).expect(201);
      billingId = res.body.id;

      expect(res.body).toMatchObject({
        property: { id: propertyId, code: `${prefix}-1` },
        periodMonth: 10,
        periodYear: 2026,
        electricity: { oldIndex: 1200, newIndex: 1350, usage: 150, rate: 3500, amount: 525_000 },
        water: { oldIndex: 300, newIndex: 312, usage: 12, rate: 15000, amount: 180_000 },
        rentAmount: 3_000_000,
        serviceFee: 100_000,
        totalAmount: 3_805_000, // 3 000 000 + 525 000 + 180 000 + 100 000
        status: 'UNPAID',
      });

      // Verify what is physically stored in the DB.
      const row = await prisma.billing.findUniqueOrThrow({ where: { id: billingId } });
      expect(row.electricityStart).toBe(1200);
      expect(row.electricityEnd).toBe(1350);
      expect(row.electricityRate.toString()).toBe('3500');
      expect(row.waterRate.toString()).toBe('15000');
      expect(row.totalAmount.toString()).toBe('3805000');
    });

    it('409 — duplicate period for the same property', async () => {
      const res = await http()
        .post('/billings')
        .set(auth())
        .send(body({ electricityOldIndex: 1350, electricityNewIndex: 1400 }))
        .expect(409);
      expect(res.body.message).toBe(`Phòng ${prefix}-1 đã có hóa đơn kỳ 10/2026`);
    });

    it('201 — same property, next period is allowed', () =>
      http()
        .post('/billings')
        .set(auth())
        .send(body({ periodMonth: 11, electricityOldIndex: 1350, electricityNewIndex: 1350, waterOldIndex: 312, waterNewIndex: 312 }))
        .expect(201)
        .expect((res) => {
          // zero consumption → only rent + service fee
          expect(res.body.totalAmount).toBe(3_100_000);
        }));

    it('snapshot — changing property prices later does not alter old bills', async () => {
      await http()
        .patch(`/properties/${propertyId}`)
        .set(auth())
        .send({ electricityRate: 4000, monthlyRent: 3_500_000 })
        .expect(200);

      const old = await http().get(`/billings/${billingId}`).set(auth()).expect(200);
      expect(old.body.electricity.rate).toBe(3500);
      expect(old.body.rentAmount).toBe(3_000_000);
      expect(old.body.totalAmount).toBe(3_805_000);

      // A new bill uses the new prices.
      const fresh = await http()
        .post('/billings')
        .set(auth())
        .send(body({ periodMonth: 12, electricityOldIndex: 0, electricityNewIndex: 10, waterOldIndex: 0, waterNewIndex: 0 }))
        .expect(201);
      expect(fresh.body.electricity.rate).toBe(4000);
      expect(fresh.body.totalAmount).toBe(3_500_000 + 40_000 + 100_000);
    });

    it('404 — unknown property', () =>
      http()
        .post('/billings')
        .set(auth())
        .send(body({ propertyId: '3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60' }))
        .expect(404));
  });

  // ───────────── Validation ─────────────

  describe('Validation → 400', () => {
    it.each([
      ['electricity newIndex < oldIndex', { electricityOldIndex: 1350, electricityNewIndex: 1349 }],
      ['water newIndex < oldIndex', { waterOldIndex: 50, waterNewIndex: 10 }],
      ['negative index', { electricityOldIndex: -5 }],
      ['fractional index', { waterNewIndex: 312.5 }],
      ['index as string', { electricityNewIndex: '1350' }],
      ['month 13', { periodMonth: 13 }],
      ['month 0', { periodMonth: 0 }],
      ['invalid propertyId', { propertyId: 'abc' }],
      ['unknown field', { totalAmount: 1 }], // client must not dictate totals
    ])('%s', async (_label, extra) => {
      const res = await http()
        .post('/billings')
        .set(auth())
        .send(body({ periodMonth: 1, ...extra }))
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('returns a readable message for newIndex < oldIndex', async () => {
      const res = await http()
        .post('/billings')
        .set(auth())
        .send(body({ periodMonth: 1, electricityOldIndex: 1350, electricityNewIndex: 1349 }))
        .expect(400);
      expect(res.body.message).toContain(
        'electricityNewIndex (1349) phải lớn hơn hoặc bằng electricityOldIndex (1350)',
      );
    });
  });

  // ───────────── Read ─────────────

  describe('GET /billings', () => {
    it('filters by property and period', async () => {
      const res = await http()
        .get('/billings')
        .set(auth())
        .query({ propertyId, periodYear: 2026 })
        .expect(200);
      expect(res.body.meta.total).toBe(3); // Oct, Nov, Dec
      expect(res.body.data.map((b: { periodMonth: number }) => b.periodMonth)).toEqual([12, 11, 10]);
    });

    it('GET /billings/:id unknown → 404', () =>
      http().get('/billings/3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60').set(auth()).expect(404));
  });

  // ───────────── Pay (PATCH /billings/:id/pay) ─────────────

  describe('PATCH /billings/:id/pay', () => {
    it('without token → 401', () =>
      http()
        .patch('/billings/3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60/pay')
        .expect(401));

    it('unknown id → 404', () =>
      http()
        .patch('/billings/3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60/pay')
        .set(auth())
        .expect(404));

    it('marks an UNPAID billing as PAID and sets paidAt, then rejects paying again (409)', async () => {
      const list = await http()
        .get('/billings')
        .set(auth())
        .query({ propertyId, periodMonth: 10, periodYear: 2026 })
        .expect(200);
      const id = list.body.data[0].id;

      const paid = await http()
        .patch(`/billings/${id}/pay`)
        .set(auth())
        .expect(200);

      expect(paid.body.status).toBe('PAID');
      expect(paid.body.paidAt).toBeTruthy();

      await http().patch(`/billings/${id}/pay`).set(auth()).expect(409);
    });
  });

  // ───────────── Integration with Task 4 ─────────────

  it('property with bills can no longer be deleted (409)', () =>
    http().delete(`/properties/${propertyId}`).set(auth()).expect(409));
});
