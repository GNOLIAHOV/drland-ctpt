import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

/**
 * Requires: Postgres running (npm run db:up) and admin seeded (npm run db:seed).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = process.env.ADMIN_EMAIL!;
  const password = process.env.ADMIN_PASSWORD!;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login → 200 + accessToken with valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.tokenType).toBe('Bearer');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.admin.email).toBe(email.toLowerCase());
    expect(res.body.admin).not.toHaveProperty('passwordHash');
  });

  it('POST /auth/login → 401 with wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password-123' })
      .expect(401);
    expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
  });

  it('POST /auth/login → 401 with unknown email (same message)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever-123' })
      .expect(401);
    expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
  });

  it('POST /auth/login → 400 with invalid body', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '1', extra: 'x' })
      .expect(400);
  });

  it('GET /auth/me → 401 without token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me → 401 with tampered token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);
  });

  it('GET /auth/me → 200 with valid token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(email.toLowerCase());
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});
