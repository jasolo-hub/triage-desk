import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // No DB call on purpose: this is a liveness probe for the platform healthcheck,
  // it must not flap when the database is briefly slow.
  @Get()
  check() {
    return { status: 'ok' };
  }
}
