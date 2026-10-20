import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { TicketsService } from './tickets.service.js';

// TicketsService against an in-memory fake of the few Prisma calls it makes.
// No database: these tests pin down the service's decisions (who may change
// what, what gets written), the SQL itself is Prisma's job.

const ADMIN: AuthUser = { id: 1, role: 'ADMIN' };
const AGENT: AuthUser = { id: 2, role: 'AGENT' };

type FakeTicket = {
  id: number;
  status: string;
  priority: string;
  assigneeId: number | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

function ticket(overrides: Partial<FakeTicket> & { id: number }): FakeTicket {
  return {
    status: 'OPEN',
    priority: 'NORMAL',
    assigneeId: AGENT.id,
    resolvedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup(rows: FakeTicket[]) {
  const db = new Map(rows.map((t) => [t.id, { ...t }]));
  const tx = {
    ticket: {
      findUnique: vi.fn(async ({ where }) => db.get(where.id) ?? null),
      // Mirrors the compare-and-swap in transition(): only matches the expected status.
      updateMany: vi.fn(async ({ where, data }) => {
        const row = db.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }) =>
        Object.assign(db.get(where.id)!, data),
      ),
      findUniqueOrThrow: vi.fn(async ({ where }) => ({
        ...db.get(where.id)!,
        title: 't',
        description: 'd',
        customerId: 1,
        customer: { id: 1, name: 'c', email: 'c@x.io' },
        assignee: null,
        tags: [],
        updatedAt: new Date(),
      })),
    },
    comment: { create: vi.fn(async () => ({})) },
  };
  // $transaction(fn) just runs fn with the same fake: atomicity is Postgres' job.
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const config = { get: vi.fn(() => 7) }; // REOPEN_WINDOW_DAYS
  const service = new TicketsService(prisma as never, config as never);
  return { service, db, tx };
}

describe('TicketsService ownership (AGENT may only change assigned tickets)', () => {
  it('rejects an AGENT editing a ticket assigned to someone else', async () => {
    const { service, tx } = setup([ticket({ id: 10, assigneeId: 99 })]);
    await expect(service.update(10, { title: 'x' }, AGENT)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.ticket.update).not.toHaveBeenCalled();
  });

  it('rejects an AGENT editing an unassigned ticket', async () => {
    const { service } = setup([ticket({ id: 10, assigneeId: null })]);
    await expect(service.update(10, { title: 'x' }, AGENT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects an AGENT transitioning a ticket assigned to someone else', async () => {
    const { service, tx } = setup([ticket({ id: 10, assigneeId: 99 })]);
    await expect(
      service.transition(10, { status: 'IN_PROGRESS' }, AGENT),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  });

  it('lets an AGENT transition their own ticket and an ADMIN any ticket', async () => {
    const { service, db } = setup([
      ticket({ id: 10, assigneeId: AGENT.id }),
      ticket({ id: 11, assigneeId: 99 }),
    ]);
    await service.transition(10, { status: 'IN_PROGRESS' }, AGENT);
    await service.transition(11, { status: 'IN_PROGRESS' }, ADMIN);
    expect(db.get(10)!.status).toBe('IN_PROGRESS');
    expect(db.get(11)!.status).toBe('IN_PROGRESS');
  });

  it('returns 404 for a missing ticket', async () => {
    const { service } = setup([]);
    await expect(
      service.transition(1, { status: 'IN_PROGRESS' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TicketsService.transition', () => {
  it('resolving stores the comment as the resolution and sets resolvedAt', async () => {
    const { service, tx, db } = setup([
      ticket({ id: 10, status: 'IN_PROGRESS' }),
    ]);
    const before = Date.now();

    const result = await service.transition(
      10,
      { status: 'RESOLVED', comment: 'Reset the MFA device' },
      AGENT,
    );

    expect(tx.comment.create).toHaveBeenCalledWith({
      data: {
        ticketId: 10,
        authorId: AGENT.id,
        body: 'Reset the MFA device',
        isResolution: true,
      },
    });
    expect(db.get(10)!.status).toBe('RESOLVED');
    expect(db.get(10)!.resolvedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.status).toBe('RESOLVED');
  });

  it('refuses to resolve without a comment (422) and writes nothing', async () => {
    const { service, tx } = setup([ticket({ id: 10, status: 'IN_PROGRESS' })]);
    await expect(
      service.transition(10, { status: 'RESOLVED' }, AGENT),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
    expect(tx.comment.create).not.toHaveBeenCalled();
  });

  it('maps a forbidden move to 422', async () => {
    const { service } = setup([ticket({ id: 10, status: 'OPEN' })]);
    await expect(
      service.transition(10, { status: 'CLOSED' }, ADMIN),
    ).rejects.toThrow('Cannot move a ticket from OPEN to CLOSED');
  });

  it('clears resolvedAt when a ticket is reopened', async () => {
    const resolvedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { service, db } = setup([
      ticket({ id: 10, status: 'RESOLVED', resolvedAt }),
    ]);
    await service.transition(10, { status: 'REOPENED' }, ADMIN);
    expect(db.get(10)).toMatchObject({ status: 'REOPENED', resolvedAt: null });
  });

  it('fails with 409 when the status changed after it was read', async () => {
    const { service, tx } = setup([ticket({ id: 10, status: 'OPEN' })]);
    tx.ticket.updateMany.mockResolvedValueOnce({ count: 0 }); // someone else won the race
    await expect(
      service.transition(10, { status: 'IN_PROGRESS' }, ADMIN),
    ).rejects.toThrow(ConflictException);
  });
});

describe('TicketsService.bulkTransition', () => {
  it('applies the rules per ticket and reports partial failures', async () => {
    const { service, db } = setup([
      ticket({ id: 1, status: 'OPEN' }),
      ticket({ id: 2, status: 'CLOSED' }),
      ticket({ id: 3, status: 'OPEN' }),
    ]);

    const result = await service.bulkTransition(
      { ids: [1, 2, 3, 4], status: 'IN_PROGRESS' },
      ADMIN,
    );

    expect(result).toEqual({
      updated: [1, 3],
      skipped: [],
      failed: [
        { id: 2, reason: 'Cannot move a ticket from CLOSED to IN_PROGRESS' },
        { id: 4, reason: 'Ticket 4 not found' },
      ],
    });
    expect(db.get(2)!.status).toBe('CLOSED'); // failed ticket untouched
  });

  it('skips tickets already in the target status instead of failing them', async () => {
    const { service, db } = setup([
      ticket({ id: 1, status: 'OPEN' }),
      ticket({ id: 2, status: 'IN_PROGRESS' }),
    ]);

    const result = await service.bulkTransition(
      { ids: [1, 2], status: 'IN_PROGRESS' },
      ADMIN,
    );

    expect(result).toEqual({ updated: [1], skipped: [2], failed: [] });
    expect(db.get(1)!.status).toBe('IN_PROGRESS');
  });

  it('aborts on unexpected errors instead of reporting them as business failures', async () => {
    const { service, tx } = setup([ticket({ id: 1 })]);
    tx.ticket.findUnique.mockRejectedValueOnce(new Error('connection lost'));
    await expect(
      service.bulkTransition({ ids: [1], status: 'IN_PROGRESS' }, ADMIN),
    ).rejects.toThrow('connection lost');
  });
});
