import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CasbinGuard } from './casbin/casbin.guard.js';
import { CasbinModule } from './casbin/casbin.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';
import { UserThrottlerGuard } from './common/user-throttler.guard.js';
import { validateEnv } from './config/env.validation.js';
import { CustomersModule } from './customers/customers.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TagsModule } from './tags/tags.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Generous default per user/IP (an admin list page fires several requests);
    // sensitive routes tighten it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CasbinModule,
    AuthModule,
    CustomersModule,
    TicketsModule,
    CommentsModule,
    TagsModule,
    UsersModule,
    UploadsModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    // Global guards run in this order: authenticate → rate limit → authorize.
    // Rate limiting comes after authentication so it can count per user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: CasbinGuard },
  ],
})
export class AppModule {}
