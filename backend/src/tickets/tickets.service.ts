import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ListQuerySpec,
  ListResult,
  parseListQuery,
} from '../common/list-query.js';
import type { Env } from '../config/env.validation.js';
import { Prisma, Ticket } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BulkAssignDto,
  BulkResult,
  BulkTransitionDto,
} from './dto/bulk.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { TransitionTicketDto } from './dto/transition-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { ticketFormMetadata } from './ticket-fields.js';
import {
  assertTransition,
  DONE_STATUSES,
  overdueCutoff,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TransitionError,
} from './ticket-workflow.js';
import { TICKET_INCLUDE, TicketResponse, toTicket } from './ticket.mapper.js';
import { LIST_TX } from '../common/list-tx.js';

/**
 * isOverdue as SQL, so the filter runs in the database and pagination/total
 * stay correct (D11). One OR branch per priority:
 *   status NOT IN (RESOLVED, CLOSED) AND (priority = X AND createdAt < now - SLA(X)) OR ...
 */
export function overdueWhere(now: Date): Prisma.TicketWhereInput {
  return {
    status: { notIn: [...DONE_STATUSES] },
    OR: TICKET_PRIORITIES.map((priority) => ({
      priority,
      createdAt: { lt: overdueCutoff(priority, now) },
    })),
  };
}

function listSpec(now: Date): ListQuerySpec<Prisma.TicketWhereInput> {
  return {
    filterable: {
      id: 'int',
      title: 'string',
      status: TICKET_STATUSES,
      priority: TICKET_PRIORITIES,
      assigneeId: 'int',
      customerId: 'int',
      createdAt: 'date',
    },
    // status/priority sort by enum declaration order in Postgres (e.g. LOW < URGENT).
    sortable: ['id', 'title', 'status', 'priority', 'createdAt', 'updatedAt'],
    defaultSort: { field: 'createdAt', order: 'desc' },
    custom: {
      q: (v) => ({
        OR: [
          { title: { contains: v, mode: 'insensitive' } },
          { description: { contains: v, mode: 'insensitive' } },
        ],
      }),
      isOverdue: (v) => {
        if (v === 'true') return overdueWhere(now);
        if (v === 'false') return { NOT: overdueWhere(now) };
        throw new BadRequestException('isOverdue must be true or false');
      },
    },
  };
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(
    query: Record<string, unknown>,
  ): Promise<ListResult<TicketResponse>> {
    const now = new Date(); // one "now" for the filter and the computed flags
    const { where, orderBy, skip, take } = parseListQuery(query, listSpec(now));
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.ticket.findMany({
          where,
          orderBy,
          skip,
          take,
          include: TICKET_INCLUDE,
        }),
        this.prisma.ticket.count({ where }),
      ],
      LIST_TX,
    );
    return { items: rows.map((r) => toTicket(r, now)), total };
  }

  async findOne(id: number): Promise<TicketResponse> {
    const row = await this.prisma.ticket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Ticket ${id} not found`);
    return toTicket(row, new Date());
  }

  fields() {
    return ticketFormMetadata(
      this.config.get('REOPEN_WINDOW_DAYS', { infer: true }),
    );
  }

  async create(dto: CreateTicketDto): Promise<TicketResponse> {
    await this.assertReferencesExist(dto);
    // New tickets start unassigned whoever logs them (Jira-style queue); an
    // agent who wants to keep one picks themselves as assignee in the form.
    const row = await this.prisma.ticket.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'NORMAL',
        status: 'OPEN', // always; status only moves through transition()
        customerId: dto.customerId,
        assigneeId: dto.assigneeId ?? null,
        tags: dto.tagIds && { connect: dto.tagIds.map((id) => ({ id })) },
      },
      include: TICKET_INCLUDE,
    });
    return toTicket(row, new Date());
  }

  async update(
    id: number,
    dto: UpdateTicketDto,
    user: AuthUser,
  ): Promise<TicketResponse> {
    await this.loadForChange(id, user);
    await this.assertReferencesExist(dto);
    const row = await this.prisma.ticket.update({
      where: { id },
      // undefined fields are left untouched by Prisma; `set` replaces the tag list.
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        customerId: dto.customerId,
        assigneeId: dto.assigneeId,
        tags: dto.tagIds && { set: dto.tagIds.map((tagId) => ({ id: tagId })) },
      },
      include: TICKET_INCLUDE,
    });
    return toTicket(row, new Date());
  }

  async remove(id: number) {
    await this.prisma.ticket.delete({ where: { id } }); // comments cascade
    return { id };
  }

  /**
   * The only way to change status. One transaction: ownership check, workflow
   * rule, status update and (when resolving) the resolution comment (D9) —
   * either all happen or none.
   */
  async transition(
    id: number,
    dto: TransitionTicketDto,
    user: AuthUser,
  ): Promise<TicketResponse> {
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.loadForChange(id, user, tx);
      try {
        assertTransition({
          from: ticket.status,
          to: dto.status,
          resolvedAt: ticket.resolvedAt,
          now,
          reopenWindowDays: this.config.get('REOPEN_WINDOW_DAYS', {
            infer: true,
          }),
          hasResolutionComment: !!dto.comment,
        });
      } catch (e) {
        if (e instanceof TransitionError)
          throw new UnprocessableEntityException(e.message);
        throw e;
      }

      // Compare-and-swap on the status we validated against: if another request
      // moved the ticket in the meantime, fail instead of applying a stale rule.
      const { count } = await tx.ticket.updateMany({
        where: { id, status: ticket.status },
        data: {
          status: dto.status,
          // resolvedAt marks the latest resolution; it starts the reopen window
          // and is cleared when the ticket is reopened.
          resolvedAt:
            dto.status === 'RESOLVED'
              ? now
              : dto.status === 'REOPENED'
                ? null
                : ticket.resolvedAt,
        },
      });
      if (count !== 1)
        throw new ConflictException(
          'Ticket was changed by someone else, reload it',
        );

      if (dto.comment) {
        await tx.comment.create({
          data: {
            ticketId: id,
            authorId: user.id,
            body: dto.comment,
            isResolution: dto.status === 'RESOLVED',
          },
        });
      }
      return tx.ticket.findUniqueOrThrow({
        where: { id },
        include: TICKET_INCLUDE,
      });
    });
    return toTicket(row, now);
  }

  /** Each id goes through the same rules as a single transition; partial success is reported. */
  async bulkTransition(
    dto: BulkTransitionDto,
    user: AuthUser,
  ): Promise<BulkResult> {
    const result: BulkResult = { updated: [], skipped: [], failed: [] };
    for (const id of dto.ids) {
      // Already in the target status → skip, don't fail: an admin selecting a
      // mixed page of tickets and choosing "In progress" expects the OPEN ones
      // to move and the rest to be left alone. (A missing id falls through to
      // transition(), which reports the 404 as a failure.)
      const current = await this.prisma.ticket.findUnique({
        where: { id },
        select: { status: true },
      });
      if (current?.status === dto.status) {
        result.skipped.push(id);
        continue;
      }
      try {
        await this.transition(
          id,
          { status: dto.status, comment: dto.comment },
          user,
        );
        result.updated.push(id);
      } catch (e) {
        // Expected per-ticket failures (404/403/409/422) are reported; anything
        // else (e.g. DB down) aborts the request with a 500.
        if (!(e instanceof HttpException)) throw e;
        result.failed.push({ id, reason: e.message });
      }
    }
    return result;
  }

  async bulkAssign(dto: BulkAssignDto): Promise<BulkResult> {
    await this.assertReferencesExist({ assigneeId: dto.assigneeId });
    const existing = await this.prisma.ticket.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, assigneeId: true },
    });
    // Same idea as bulkTransition: already assigned to that agent → skipped.
    const skipped = existing
      .filter((t) => t.assigneeId === dto.assigneeId)
      .map((t) => t.id);
    const ids = existing.map((t) => t.id).filter((id) => !skipped.includes(id));
    await this.prisma.ticket.updateMany({
      where: { id: { in: ids } },
      data: { assigneeId: dto.assigneeId },
    });
    const found = existing.map((t) => t.id);
    return {
      updated: dto.ids.filter((id) => ids.includes(id)),
      skipped: dto.ids.filter((id) => skipped.includes(id)),
      failed: dto.ids
        .filter((id) => !found.includes(id))
        .map((id) => ({ id, reason: `Ticket ${id} not found` })),
    };
  }

  /**
   * Record-level authorization (D4): Casbin already allowed "AGENT may edit
   * tickets"; here we check "...this ticket", which needs the row.
   */
  private async loadForChange(
    id: number,
    user: AuthUser,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Ticket> {
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    // Queue model: an unassigned ticket is up for grabs (an agent opens it and
    // claims it by setting themselves as assignee); once assigned, only the
    // assignee or an ADMIN may change it.
    const claimable = ticket.assigneeId === null;
    if (user.role !== 'ADMIN' && !claimable && ticket.assigneeId !== user.id) {
      throw new ForbiddenException(
        'You can only change tickets assigned to you or unassigned ones',
      );
    }
    return ticket;
  }

  // Explicit checks give a clear 400 ("customerId 99 does not exist") instead of
  // a generic foreign-key error from the database.
  private async assertReferencesExist(dto: {
    customerId?: number;
    assigneeId?: number | null;
    tagIds?: number[];
  }): Promise<void> {
    if (dto.customerId !== undefined) {
      const found = await this.prisma.customer.count({
        where: { id: dto.customerId },
      });
      if (!found)
        throw new BadRequestException(
          `customerId ${dto.customerId} does not exist`,
        );
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      const found = await this.prisma.user.count({
        where: { id: dto.assigneeId },
      });
      if (!found)
        throw new BadRequestException(
          `assigneeId ${dto.assigneeId} does not exist`,
        );
    }
    if (dto.tagIds?.length) {
      const found = await this.prisma.tag.count({
        where: { id: { in: dto.tagIds } },
      });
      if (found !== dto.tagIds.length)
        throw new BadRequestException('tagIds contains unknown tags');
    }
  }
}
