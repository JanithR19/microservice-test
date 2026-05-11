import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
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
    return { status: 'alive' };
  }

  @Get('health/slow')
  async healthSlow() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { status: 'slow', delay: '2s' };
  }

  @Get('health/error')
  healthError() {
    throw new Error('Test error for observability!');
  }
}
