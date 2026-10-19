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
    url: process.env.DATABASE_URL,
  },
});
