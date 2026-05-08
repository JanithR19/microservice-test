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
}
