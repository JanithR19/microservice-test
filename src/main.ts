import './instrument'; // CRITICAL: This import must be at absolute line 1 to instrument all subsequent modules.
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

async function bootstrap() {
  // Initialize the NestJS Application
  const app = await NestFactory.create(AppModule);
  
  // Resolve the underlying HTTP adapter host for global filters
  const { httpAdapter } = app.get(HttpAdapterHost);
  
  // Register the Sentry filter to automatically report unhandled HTTP errors to Sentry
  app.useGlobalFilters(new SentryGlobalFilter(httpAdapter));
  
  // Bind nestjs-pino as the default application logger for standardized JSON outputs
  app.useLogger(app.get(Logger));
  
  // Start the application server on the configured port
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
