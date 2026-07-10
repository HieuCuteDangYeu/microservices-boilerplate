import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class MonitoringHealthController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
