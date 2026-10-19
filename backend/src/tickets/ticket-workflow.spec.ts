import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  isOverdue,
  overdueCutoff,
  SLA_HOURS,
  slaDeadline,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketStatus,
  TransitionError,
  TransitionInput,
} from './ticket-workflow.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-19T12:00:00.000Z');

/** A transition request that satisfies every extra rule, so only the move itself is tested. */
function input(
  from: TicketStatus,
  to: TicketStatus,
  overrides: Partial<TransitionInput> = {},
) {
  return {
    from,
    to,
    resolvedAt: new Date(NOW.getTime() - DAY),
    now: NOW,
    reopenWindowDays: 7,
    hasResolutionComment: true,
    ...overrides,
  };
}

describe('status transitions', () => {
  const allowed = TICKET_STATUSES.flatMap((from) =>
    ALLOWED_TRANSITIONS[from].map((to) => [from, to] as const),
  );
  const forbidden = TICKET_STATUSES.flatMap((from) =>
    TICKET_STATUSES.filter((to) => !ALLOWED_TRANSITIONS[from].includes(to)).map(
      (to) => [from, to] as const,
    ),
  );

  it('allows exactly the documented flow', () => {
    expect(allowed).toEqual([
      ['OPEN', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'RESOLVED'],
      ['RESOLVED', 'CLOSED'],
      ['RESOLVED', 'REOPENED'],
      ['REOPENED', 'IN_PROGRESS'],
    ]);
  });

  it.each(allowed)('%s → %s is accepted', (from, to) => {
    expect(() => assertTransition(input(from, to))).not.toThrow();
  });

  // 25 pairs in the matrix − 5 allowed = 20 rejected, including "no-op" moves.
  it.each(forbidden)('%s → %s is rejected', (from, to) => {
    expect(() => assertTransition(input(from, to))).toThrow(TransitionError);
  });

  it('CLOSED is final', () => {
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual([]);
  });
});

describe('resolution comment', () => {
  it('is required to resolve', () => {
    expect(() =>
      assertTransition(
        input('IN_PROGRESS', 'RESOLVED', { hasResolutionComment: false }),
      ),
    ).toThrow('Resolving a ticket requires a resolution comment');
  });

  it('is not required for other moves', () => {
    expect(() =>
      assertTransition(
        input('OPEN', 'IN_PROGRESS', { hasResolutionComment: false }),
      ),
    ).not.toThrow();
  });
});

describe('reopen window', () => {
  const reopen = (resolvedAt: Date | null) =>
    assertTransition(input('RESOLVED', 'REOPENED', { resolvedAt }));

  it('allows reopening inside the window, up to the exact boundary', () => {
    expect(() => reopen(new Date(NOW.getTime() - DAY))).not.toThrow();
    expect(() => reopen(new Date(NOW.getTime() - 7 * DAY))).not.toThrow();
  });

  it('rejects reopening one millisecond after the window', () => {
    expect(() => reopen(new Date(NOW.getTime() - 7 * DAY - 1))).toThrow(
      'A ticket can only be reopened within 7 days of being resolved',
    );
  });

  it('rejects reopening a ticket that was never resolved', () => {
    expect(() => reopen(null)).toThrow(TransitionError);
  });

  it('uses the configured window length', () => {
    const resolvedAt = new Date(NOW.getTime() - 10 * DAY);
    expect(() =>
      assertTransition(
        input('RESOLVED', 'REOPENED', { resolvedAt, reopenWindowDays: 14 }),
      ),
    ).not.toThrow();
  });
});

describe('SLA and overdue', () => {
  it('has the documented SLA per priority', () => {
    expect(SLA_HOURS).toEqual({ URGENT: 4, HIGH: 24, NORMAL: 72, LOW: 168 });
  });

  it.each(TICKET_PRIORITIES)(
    '%s: deadline = createdAt + SLA hours',
    (priority) => {
      const createdAt = new Date('2026-10-01T08:00:00.000Z');
      expect(slaDeadline({ priority, createdAt }).getTime()).toBe(
        createdAt.getTime() + SLA_HOURS[priority] * HOUR,
      );
    },
  );

  it.each(TICKET_PRIORITIES)(
    '%s: overdue only after the deadline has passed',
    (priority) => {
      const createdAt = new Date(NOW.getTime() - SLA_HOURS[priority] * HOUR);
      const ticket = { status: 'OPEN' as const, priority, createdAt };
      expect(isOverdue(ticket, NOW)).toBe(false); // exactly at the deadline
      expect(isOverdue(ticket, new Date(NOW.getTime() + 1))).toBe(true);
      expect(isOverdue(ticket, new Date(NOW.getTime() - HOUR))).toBe(false);
    },
  );

  it.each(['RESOLVED', 'CLOSED'] as const)(
    'a %s ticket is never overdue',
    (status) => {
      const ancient = new Date('2020-01-01T00:00:00.000Z');
      expect(
        isOverdue({ status, priority: 'URGENT', createdAt: ancient }, NOW),
      ).toBe(false);
    },
  );

  it.each(['OPEN', 'IN_PROGRESS', 'REOPENED'] as const)(
    'a late %s ticket is overdue',
    (status) => {
      const createdAt = new Date(NOW.getTime() - 5 * HOUR);
      expect(isOverdue({ status, priority: 'URGENT', createdAt }, NOW)).toBe(
        true,
      );
    },
  );

  it('overdueCutoff (used by the SQL filter) agrees with isOverdue', () => {
    for (const priority of TICKET_PRIORITIES) {
      const cutoff = overdueCutoff(priority, NOW);
      const before = {
        status: 'OPEN' as const,
        priority,
        createdAt: new Date(cutoff.getTime() - 1),
      };
      const at = { status: 'OPEN' as const, priority, createdAt: cutoff };
      expect(isOverdue(before, NOW)).toBe(true);
      expect(isOverdue(at, NOW)).toBe(false);
    }
  });
});
