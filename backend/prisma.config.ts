// Prisma 7 reads connection + paths from here instead of schema.prisma.
// why dotenv: the Prisma CLI runs outside Nest, so ConfigModule's .env loading
// does not apply; in production the platform injects env and no .env exists.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations take a session-level advisory lock, which connection poolers
    // in transaction mode (Neon's -pooler endpoint, PgBouncer) do not support —
    // `migrate deploy` then times out on pg_advisory_lock. So the CLI prefers a
    // direct connection when one is configured; the app itself keeps using the
    // pooled DATABASE_URL (see prisma.service.ts).
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL,
  },
});
