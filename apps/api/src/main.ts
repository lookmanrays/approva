import cookieParser from 'cookie-parser';
import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { buildAllowedApiOrigins, buildApiSecurityHeaders } from './common/security/http-security.util';
import { StructuredLoggerService } from './common/observability/structured-logger.service';
import { initializeSentry } from './common/observability/sentry.util';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  initializeSentry();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(StructuredLoggerService));
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 'loopback, linklocal, uniquelocal');
  const allowedOrigins = buildAllowedApiOrigins(process.env);

  expressApp.use((request: Request, response: Response, next: NextFunction) => {
    const headers = buildApiSecurityHeaders(request.path ?? request.originalUrl ?? '/');

    for (const [name, value] of headers) {
      response.setHeader(name, value);
    }

    next();
  });

  app.setGlobalPrefix('v1', {
    exclude: [
      {
        path: 'health/live',
        method: RequestMethod.GET,
      },
      {
        path: 'health/ready',
        method: RequestMethod.GET,
      },
    ],
  });
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Cookie',
      'X-Approva-User-Id',
      'X-Approva-Organization-Id',
      'X-Approva-Organization-Slug',
      'X-Authon-Dashboard-User-Id',
      'X-Authon-Organization-Id',
      'X-Authon-Organization-Slug',
      'X-Request-Id',
    ],
    exposedHeaders: [
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'RateLimit-Policy',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-Id',
    ],
    maxAge: 60 * 60,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Approva API')
    .setDescription('Approva is human approval infrastructure for AI actions.')
    .setVersion('0.1.0')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

bootstrap();
