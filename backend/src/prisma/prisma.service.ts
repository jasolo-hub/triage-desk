import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';

// Prisma 7 talks to Postgres through a driver adapter (node-postgres) instead of
// a bundled Rust engine; the service is just the client wired into Nest's lifecycle.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        // Explicit because it is the capacity knob: each API instance holds up
        // to `max` connections, so instances × DB_POOL_MAX must fit the managed
        // Postgres connection budget. At 10× traffic we add instances, not
        // connections: lower this per instance or use Neon's pooled (-pooler)
        // URL, which multiplexes many clients over few server connections.
        // Queries beyond `max` queue for a free connection instead of failing.
        max: config.get('DB_POOL_MAX', { infer: true }),
      }),
    });
  }

  // Connect at boot so a wrong DATABASE_URL fails the deploy, not the first request.
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
