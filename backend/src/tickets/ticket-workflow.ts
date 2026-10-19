// Ticket business rules as pure functions: no Nest, no Prisma, no clock access
// (callers pass `now`). That makes every rule unit-testable in isolation and
// lets the service, the list filter and the AI prompt share one definition.

export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Hours from creation until a ticket of this priority is overdue. */
export const SLA_HOURS: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 24,
  NORMAL: 72,
  LOW: 168,
};

/** Statuses where the SLA clock no longer matters. */
export const DONE_STATUSES: readonly TicketStatus[] = ['RESOLVED', 'CLOSED'];

const HOUR_MS = 60 * 60 * 1000;

export function slaDeadline(ticket: {
  priority: TicketPriority;
  createdAt: Date;
}): Date {
  return new Date(
    ticket.createdAt.getTime() + SLA_HOURS[ticket.priority] * HOUR_MS,
  );
}

/** Overdue = still being worked on (not RESOLVED/CLOSED) and past the SLA deadline. */
export function isOverdue(
  ticket: { status: TicketStatus; priority: TicketPriority; createdAt: Date },
  now: Date,
): boolean {
  return (
    !DONE_STATUSES.includes(ticket.status) &&
    now.getTime() > slaDeadline(ticket).getTime()
  );
}

/** Creation time before which a ticket of this priority is overdue (used for the SQL filter). */
export function overdueCutoff(priority: TicketPriority, now: Date): Date {
  return new Date(now.getTime() - SLA_HOURS[priority] * HOUR_MS);
}

// ── Status transitions ───────────────────────────────────────────────────────

/** The only allowed moves. CLOSED is final. */
export const ALLOWED_TRANSITIONS: Record<
  TicketStatus,
  readonly TicketStatus[]
> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: [],
  REOPENED: ['IN_PROGRESS'],
};

/** A business-rule violation; the service maps it to HTTP 422. */
export class TransitionError extends Error {}

export interface TransitionInput {
  from: TicketStatus;
  to: TicketStatus;
  /** When the ticket was last resolved (null if never). */
  resolvedAt: Date | null;
  now: Date;
  reopenWindowDays: number;
  /** Whether the request carries a non-empty resolution comment. */
  hasResolutionComment: boolean;
}

const DAY_MS = 24 * HOUR_MS;

export function assertTransition(input: TransitionInput): void {
  const { from, to } = input;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new TransitionError(`Cannot move a ticket from ${from} to ${to}`);
  }
  if (to === 'RESOLVED' && !input.hasResolutionComment) {
    throw new TransitionError(
      'Resolving a ticket requires a resolution comment',
    );
  }
  if (to === 'REOPENED') {
    const windowEnd = input.resolvedAt
      ? input.resolvedAt.getTime() + input.reopenWindowDays * DAY_MS
      : -Infinity; // never resolved → nothing to reopen
    if (input.now.getTime() > windowEnd) {
      throw new TransitionError(
        `A ticket can only be reopened within ${input.reopenWindowDays} days of being resolved`,
      );
    }
  }
}
