import type { Prisma } from '../generated/prisma/client.js';
import { isOverdue, slaDeadline } from './ticket-workflow.js';

/** Relations every ticket response carries (contract shape). */
export const TICKET_INCLUDE = {
  customer: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true } },
  tags: {
    select: { id: true, name: true, color: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.TicketInclude;

export type TicketRow = Prisma.TicketGetPayload<{
  include: typeof TICKET_INCLUDE;
}>;

// isOverdue / slaDeadline are computed on read, not stored (D11): they depend on
// "now", and a stored flag would need a scheduler to stay correct.
export function toTicket(row: TicketRow, now: Date) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    customerId: row.customerId,
    customer: row.customer,
    assigneeId: row.assigneeId,
    assignee: row.assignee,
    tags: row.tags,
    isOverdue: isOverdue(row, now),
    slaDeadline: slaDeadline(row),
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type TicketResponse = ReturnType<typeof toTicket>;
