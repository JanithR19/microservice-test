import './instrument';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryGlobalFilter(httpAdapter));
  app.useLogger(app.get(Logger));
  const port = process.env.PORT || 3000;
  await app.listen(port,'0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();



