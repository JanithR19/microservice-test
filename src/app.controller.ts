import { Controller, Get,Logger  } from '@nestjs/common';
import * as Sentry from "@sentry/nestjs";

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  @Get()
  getHello(): string {
    return 'Hello from NestJS Railway Observability!';
  }

  @Get('data')
  getData() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }

  @Get('health/live')
  healthLive() {
    this.logger.debug('This is a massive error that OTel will catch!');
    Sentry.logger.info('User triggered test log', { action: 'test_log' })
    return { status: 'alive' };
  }

  @Get('health/slow')
  async healthSlow() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    Sentry.logger.warn('User triggered test warn log', { action: 'test_log' })
    this.logger.warn('This is a massive warn that OTel will catch!');
    return { status: 'slow', delay: '2s' };
  }

  @Get('health/error')
  healthError() {
    this.logger.error('This is a massive error that OTel will catch!');
    Sentry.logger.error('User triggered test error log', { action: 'test_log' })
    throw new Error('Test error for observability!');
  }
}
