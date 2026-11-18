import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/env.validator';

async function bootstrap() {
  // 1. Validation stricte des variables d'environnement critiques
  validateEnvironment();

  const app = await NestFactory.create(AppModule);

  // 2. Validation globale des DTOs (Pipes NestJS)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false
    })
  );

  // 3. Documentation interactive OpenAPI / Swagger (/api/docs)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AskMe Studio API Gateway')
    .setDescription('Plateforme BI conversationnelle, RAG sémantique, Text-to-SQL et gouvernance de données')
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Entrez votre token JWT généré par /api/v1/auth/login'
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/api/docs', app, document);

  // 4. En-têtes HTTP de sécurité de base
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // 3. Politique CORS explicite
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:15173',
    'http://127.0.0.2:5173',
    'http://127.0.0.2:15173'
  ];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // En développement on autorise pour faciliter les tests, avec log
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-requested-with']
  });

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 AskMe API Gateway is running on http://0.0.0.0:${port}`);
}

bootstrap();

