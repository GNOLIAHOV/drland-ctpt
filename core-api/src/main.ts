import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './app.setup.js';

async function bootstrap() {
  const app = configureApp(
    await NestFactory.create<NestExpressApplication>(AppModule),
  );
  setupSwagger(app);
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
