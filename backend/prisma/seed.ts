// Demo data at realistic scale. WIPES ALL DATA, then inserts a fixed dataset.
//   npm run db:seed   (same as: npx prisma db seed)
//
// Deterministic: faker is seeded and ids are assigned explicitly, so every run
// produces the same users, customers, tickets and comments (dates are offsets
// from "now", so overdue/reopen-window states stay realistic over time).
import 'dotenv/config';
import { faker } from '@faker-js/faker';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import {
  Prisma,
  PrismaClient,
  TicketPriority,
  TicketStatus,
} from '../src/generated/prisma/client.js';
import {
  DONE_STATUSES,
  overdueCutoff,
  TICKET_PRIORITIES,
} from '../src/tickets/ticket-workflow.js';

const COUNTS = { agents: 24, customers: 800, tickets: 5000 };
const BATCH_SIZE = 1000; // rows per INSERT; keeps each statement well under PG's parameter limit
const DAY_MS = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ── Realistic vocabulary (faker's lorem would read as noise in a demo) ───────

const TAGS: [string, string][] = [
  ['billing', '#1677ff'],
  ['bug', '#f5222d'],
  ['feature-request', '#722ed1'],
  ['login', '#fa8c16'],
  ['performance', '#faad14'],
  ['mobile', '#13c2c2'],
  ['api', '#2f54eb'],
  ['integration', '#eb2f96'],
  ['onboarding', '#52c41a'],
  ['refund', '#a0d911'],
  ['security', '#cf1322'],
  ['outage', '#820014'],
  ['data-export', '#08979c'],
  ['ui', '#9254de'],
  ['documentation', '#8c8c8c'],
];

const TITLES = [
  'Cannot log in after password reset',
  'Invoice shows the wrong amount',
  'Export to CSV times out',
  'Mobile app crashes on startup',
  'Two-factor code never arrives',
  'Webhook deliveries failing with 500',
  'Refund not received after 10 days',
  'Dashboard loads very slowly',
  'Cannot invite new team members',
  'API returns 429 too often',
  'Data missing after import',
  'Password reset link expired',
  'Charged twice this month',
  'Search returns no results',
  'Email notifications stopped arriving',
  'SSO login loops back to the start page',
  'Report totals do not match the export',
  'Unable to upload attachments',
  'Account locked after failed logins',
  'Need to change the billing email',
  'Feature request: dark mode',
  'Slack integration disconnected',
  'Page shows an error after the update',
  'Cannot cancel subscription',
  'Duplicate contacts after sync',
];
const PLATFORMS = [
  'on iOS',
  'on Android',
  'in Chrome',
  'in Safari',
  'on Windows',
  'for the whole team',
];

const OPENERS = [
  'Customer reports:',
  'Reported by phone:',
  'From the support inbox:',
  'Escalated by the account manager:',
];
const CONTEXT = [
  'Started after the last release.',
  'Happens every time they try.',
  'Happens intermittently, roughly once a day.',
  'Affects several users in the same workspace.',
  'Only one user is affected so far.',
  'They need this working before the end of the week.',
];
const DETAILS = [
  'They already cleared the browser cache, no change.',
  'Restarting the app did not help.',
  'No error message is shown, the page just spins.',
  'They attached a screenshot in the original email.',
  'Workaround: using the web version for now.',
  'Started right after they changed their plan.',
];

const REPLIES = [
  'Thanks for reporting, looking into it now.',
  'Could you send a screenshot of the error and the time it happened?',
  'Reproduced on our side, escalating to engineering.',
  'Checked the logs: the request times out at the gateway.',
  'Customer confirmed the workaround helps for now.',
  'Waiting for the customer to reply.',
  'Asked the customer which browser and version they use.',
  'Engineering is deploying a fix later today.',
  'Followed up by email, no answer yet.',
  'Linked this to the known issue in the status page.',
];
const RESOLUTIONS = [
  'Reset the user’s MFA enrolment; the customer can log in again.',
  'Refund issued and confirmed with the customer.',
  'Fixed in today’s release, verified together with the customer.',
  'Corrected the invoice and sent the updated PDF.',
  'Re-ran the import with the fixed mapping; data is complete now.',
  'Reconnected the integration and re-sent the missed events.',
  'Explained the setting that controls this; customer is happy.',
  'Unlocked the account and shared the password-reset steps.',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function inBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE)
    await insert(rows.slice(i, i + BATCH_SIZE));
}

const between = (from: Date, to: Date) => faker.date.between({ from, to });
const pick = <T>(items: readonly T[]) => faker.helpers.arrayElement(items);
const weighted = <T>(items: [T, number][]) =>
  faker.helpers.weightedArrayElement(
    items.map(([value, weight]) => ({ value, weight })),
  );

/** Older tickets are mostly finished; recent ones are mostly still open. */
function statusForAge(ageDays: number): TicketStatus {
  if (ageDays < 3) {
    return weighted<TicketStatus>([
      ['OPEN', 45],
      ['IN_PROGRESS', 35],
      ['RESOLVED', 15],
      ['REOPENED', 5],
    ]);
  }
  if (ageDays < 30) {
    return weighted<TicketStatus>([
      ['OPEN', 15],
      ['IN_PROGRESS', 25],
      ['RESOLVED', 30],
      ['CLOSED', 25],
      ['REOPENED', 5],
    ]);
  }
  // A few old OPEN/IN_PROGRESS tickets: these are the overdue backlog.
  return weighted<TicketStatus>([
    ['OPEN', 3],
    ['IN_PROGRESS', 4],
    ['RESOLVED', 8],
    ['CLOSED', 84],
    ['REOPENED', 1],
  ]);
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  faker.seed(42);
  const now = new Date();
  const started = Date.now();

  // One statement wipes everything and resets the id sequences.
  await prisma.$executeRaw`TRUNCATE "Comment", "_TagToTicket", "Ticket", "Tag", "Customer", "User" RESTART IDENTITY CASCADE`;

  // Users: hash once and reuse — argon2 is deliberately slow (~50 ms per hash).
  const passwordHash = await hashPassword(
    process.env.SEED_PASSWORD || 'Password123!',
  );
  const users: Prisma.UserCreateManyInput[] = [
    {
      id: 1,
      email: 'admin@triage.dev',
      name: 'Alex Admin',
      role: 'ADMIN',
      passwordHash,
    },
    {
      id: 2,
      email: 'agent@triage.dev',
      name: 'Sam Agent',
      role: 'AGENT',
      passwordHash,
    },
  ];
  const userEmails = new Set(users.map((u) => u.email));
  while (users.length < COUNTS.agents + 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = `${firstName}.${lastName}@triage.dev`
      .toLowerCase()
      .replace(/[^a-z0-9.@]/g, '');
    if (userEmails.has(email)) continue;
    userEmails.add(email);
    users.push({
      id: users.length + 1,
      email,
      name: `${firstName} ${lastName}`,
      role: 'AGENT',
      passwordHash,
    });
  }
  await prisma.user.createMany({ data: users });
  const agentIds = users.filter((u) => u.role === 'AGENT').map((u) => u.id!);

  // Customers with unique emails (the DB enforces it; we avoid collisions up front).
  const customers: Prisma.CustomerCreateManyInput[] = [];
  const customerEmails = new Set<string>();
  while (customers.length < COUNTS.customers) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();
    if (customerEmails.has(email)) continue;
    customerEmails.add(email);
    customers.push({
      id: customers.length + 1,
      name: `${firstName} ${lastName}`,
      email,
      company: faker.datatype.boolean(0.7) ? faker.company.name() : null,
      createdAt: between(
        new Date(now.getTime() - 365 * DAY_MS),
        new Date(now.getTime() - 180 * DAY_MS),
      ),
    });
  }
  await inBatches(customers, (data) => prisma.customer.createMany({ data }));

  await prisma.tag.createMany({
    data: TAGS.map(([name, color], i) => ({ id: i + 1, name, color })),
  });

  // Tickets, their tag links and comments are generated together so comment
  // dates and authors are consistent with each ticket's history.
  const tickets: Prisma.TicketCreateManyInput[] = [];
  const comments: Prisma.CommentCreateManyInput[] = [];
  const ticketIdsByTag = new Map<number, number[]>();

  for (let id = 1; id <= COUNTS.tickets; id++) {
    const createdAt = between(new Date(now.getTime() - 180 * DAY_MS), now);
    const ageDays = (now.getTime() - createdAt.getTime()) / DAY_MS;
    const status = statusForAge(ageDays);
    const priority = weighted<TicketPriority>([
      ['LOW', 20],
      ['NORMAL', 50],
      ['HIGH', 22],
      ['URGENT', 8],
    ]);
    // New tickets are often still in the unassigned queue; worked ones always have an owner.
    const assigneeId =
      status === 'OPEN' && faker.datatype.boolean(0.4) ? null : pick(agentIds);

    // Resolved within 10 days of creation (capped at now). REOPENED tickets have
    // it cleared, matching TicketsService.transition().
    const resolvedAt =
      status === 'RESOLVED' || status === 'CLOSED'
        ? between(
            createdAt,
            new Date(
              Math.min(now.getTime(), createdAt.getTime() + 10 * DAY_MS),
            ),
          )
        : null;
    const lastActivity = resolvedAt ?? now;

    const title = faker.datatype.boolean(0.3)
      ? `${pick(TITLES)} ${pick(PLATFORMS)}`
      : pick(TITLES);
    tickets.push({
      id,
      title,
      description: `${pick(OPENERS)} ${title.toLowerCase()}. ${pick(CONTEXT)} ${pick(DETAILS)}`,
      status,
      priority,
      customerId: faker.number.int({ min: 1, max: COUNTS.customers }),
      assigneeId,
      resolvedAt,
      createdAt,
      updatedAt:
        lastActivity > createdAt ? between(createdAt, lastActivity) : createdAt,
    });

    for (const tagId of faker.helpers.arrayElements(
      TAGS.map((_, i) => i + 1),
      weighted([
        [0, 25],
        [1, 40],
        [2, 25],
        [3, 10],
      ]),
    )) {
      ticketIdsByTag.set(tagId, [...(ticketIdsByTag.get(tagId) ?? []), id]);
    }

    const replyCount = {
      OPEN: faker.number.int({ min: 0, max: 2 }),
      IN_PROGRESS: faker.number.int({ min: 1, max: 4 }),
      RESOLVED: faker.number.int({ min: 0, max: 3 }),
      CLOSED: faker.number.int({ min: 0, max: 3 }),
      REOPENED: faker.number.int({ min: 2, max: 5 }),
    }[status];
    for (let c = 0; c < replyCount; c++) {
      comments.push({
        ticketId: id,
        // Mostly the assignee, sometimes a colleague chiming in.
        authorId:
          assigneeId && faker.datatype.boolean(0.75)
            ? assigneeId
            : pick(agentIds),
        body: pick(REPLIES),
        createdAt: between(createdAt, resolvedAt ?? now),
      });
    }
    if (resolvedAt) {
      // Same invariant as the API: every resolved ticket has a resolution comment.
      comments.push({
        ticketId: id,
        authorId: assigneeId ?? pick(agentIds),
        body: pick(RESOLUTIONS),
        isResolution: true,
        createdAt: resolvedAt,
      });
    }
  }

  await inBatches(tickets, (data) => prisma.ticket.createMany({ data }));

  // Implicit m2m has no Prisma model, so no createMany for the join table;
  // connecting all tickets of one tag in a single update = 15 queries total.
  for (const [tagId, ticketIds] of ticketIdsByTag) {
    await prisma.tag.update({
      where: { id: tagId },
      data: { tickets: { connect: ticketIds.map((id) => ({ id })) } },
    });
  }

  // Comments in chronological order so their ids read like a conversation.
  comments.sort(
    (a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
  );
  comments.forEach((c, i) => (c.id = i + 1));
  await inBatches(comments, (data) => prisma.comment.createMany({ data }));

  // Explicit ids do not advance the sequences; move them past the seeded rows
  // so rows created through the API get fresh ids.
  for (const table of ['User', 'Customer', 'Tag', 'Ticket', 'Comment']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT MAX(id) FROM "${table}"))`,
    );
  }

  const [
    userCount,
    customerCount,
    tagCount,
    ticketCount,
    commentCount,
    overdue,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.tag.count(),
    prisma.ticket.count(),
    prisma.comment.count(),
    // Same condition as the API's isOverdue filter, from the same pure SLA rules.
    prisma.ticket.count({
      where: {
        status: { notIn: [...DONE_STATUSES] },
        OR: TICKET_PRIORITIES.map((priority) => ({
          priority,
          createdAt: { lt: overdueCutoff(priority, now) },
        })),
      },
    }),
  ]);
  const links = [...ticketIdsByTag.values()].reduce(
    (sum, ids) => sum + ids.length,
    0,
  );
  console.log(
    `Seeded in ${((Date.now() - started) / 1000).toFixed(1)}s: ${userCount} users, ` +
      `${customerCount} customers, ${tagCount} tags, ${ticketCount} tickets ` +
      `(${overdue} overdue), ${commentCount} comments, ${links} ticket-tag links.`,
  );
  console.log(
    'Logins: admin@triage.dev / agent@triage.dev, password from SEED_PASSWORD (default Password123!)',
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
