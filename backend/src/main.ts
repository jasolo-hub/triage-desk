import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // why: Railway/Render terminate TLS in a proxy; without this every request
  // has the proxy's IP and the per-IP login throttle would be shared by everyone.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((o) => o.trim()),
    // why: Refine simple-rest reads the total from this header; browsers hide
    // non-safelisted response headers from JS unless CORS exposes them.
    exposedHeaders: ['x-total-count'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger in every environment (D14): it is documentation, contains no secrets.
  const doc = new DocumentBuilder()
    .setTitle('Triage Desk API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, doc),
  );

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
