import { Prisma } from '../generated/prisma/client.js';

// Options for the `[findMany, count]` batch behind every list endpoint.
// Postgres' default READ COMMITTED gives each statement its own snapshot, so a
// row inserted between the two SELECTs would make `x-total-count` disagree
// with the page. REPEATABLE READ pins one snapshot for the whole batch; for
// read-only statements it costs nothing and cannot fail with a serialization
// error.
export const LIST_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;
