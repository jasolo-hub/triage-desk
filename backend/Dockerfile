# syntax=docker/dockerfile:1
# Production image for the API. Build context: backend/
#   docker build -t triage-api .

# ── build: full dependencies, generate Prisma client, compile ──────────────
FROM node:24-slim AS build
# Prisma's schema engine (used by `migrate deploy`) links against OpenSSL,
# which the slim image does not ship.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Schema + config before `npm ci`: the postinstall hook runs `prisma generate`.
# Copied separately from src/ so dependency layers stay cached across code changes.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

# ── runtime: production dependencies + compiled code only ──────────────────
FROM node:24-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Migrations + config for `prisma migrate deploy` at start-up.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

# Files stay root-owned and read-only for the app; the process runs unprivileged.
USER node
EXPOSE 3000

# Apply pending migrations, then replace the shell with node so it is PID 1 and
# receives SIGTERM directly (graceful shutdown on redeploy).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
