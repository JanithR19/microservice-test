import { Controller, Get,Logger  } from '@nestjs/common';

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
    return { status: 'alive' };
  }

  @Get('health/slow')
  async healthSlow() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    this.logger.warn('This is a massive warn that OTel will catch!');
    return { status: 'slow', delay: '2s' };
  }

  @Get('health/error')
  healthError() {
    this.logger.error('This is a massive error that OTel will catch!');
    throw new Error('Test error for observability!');
  }
}
