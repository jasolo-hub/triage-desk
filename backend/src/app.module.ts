import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { CasbinGuard } from './casbin/casbin.guard.js';
import { CasbinModule } from './casbin/casbin.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';
import { validateEnv } from './config/env.validation.js';
import { CustomersModule } from './customers/customers.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Generous default per IP (an admin list page fires several requests);
    // sensitive routes tighten it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CasbinModule,
    AuthModule,
    CustomersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    // Global guards run in this order: rate limit → authenticate → authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CasbinGuard },
  ],
})
export class AppModule {}
