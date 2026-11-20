import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp, setupSwagger } from './../src/app.setup.js';

describe('AppController & Swagger (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleFixture.createNestApplication());
    setupSwagger(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/docs-json (GET) returns OpenAPI document with configured title & description', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(res.body.info).toMatchObject({
      title: 'Property Management API',
      description: 'Core API cho hệ thống quản lý bất động sản',
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
