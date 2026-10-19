import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { ticketFormMetadata } from './ticket-fields.js';
import {
  DONE_STATUSES,
  overdueCutoff,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from './ticket-workflow.js';
import { TICKET_INCLUDE, TicketResponse, toTicket } from './ticket.mapper.js';

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
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        orderBy,
        skip,
        take,
        include: TICKET_INCLUDE,
      }),
      this.prisma.ticket.count({ where }),
    ]);
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
    if (user.role !== 'ADMIN' && ticket.assigneeId !== user.id) {
      throw new ForbiddenException(
        'You can only change tickets assigned to you',
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
