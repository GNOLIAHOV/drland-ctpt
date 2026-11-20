import fs from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Global app configuration shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // reject requests with unknown properties
      transform: true,
    }),
  );

  // Đảm bảo thư mục lưu trữ ảnh tải lên tồn tại
  const uploadsDir = path.join(process.cwd(), 'uploads', 'properties');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Cấu hình phục vụ file tĩnh /uploads/...
  const expressApp = app as unknown as NestExpressApplication;
  if (typeof expressApp.useStaticAssets === 'function') {
    expressApp.useStaticAssets(path.join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });
  }

  return app;
}

/** Sets up OpenAPI / Swagger UI at /api/docs. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Property Management API')
    .setDescription('Core API cho hệ thống quản lý bất động sản')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
