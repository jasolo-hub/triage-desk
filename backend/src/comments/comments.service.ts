import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ListQuerySpec,
  ListResult,
  parseListQuery,
} from '../common/list-query.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';

const LIST_SPEC: ListQuerySpec<Prisma.CommentWhereInput> = {
  filterable: { id: 'int', ticketId: 'int' },
  sortable: ['id', 'createdAt'],
  defaultSort: { field: 'createdAt', order: 'asc' }, // conversation order
};

const INCLUDE = {
  author: { select: { id: true, name: true } },
} satisfies Prisma.CommentInclude;
type CommentRow = Prisma.CommentGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(
    query: Record<string, unknown>,
  ): Promise<ListResult<CommentResponse>> {
    // Comments only make sense inside a ticket; an unscoped list of ~12k rows is never wanted.
    if (query.ticketId === undefined)
      throw new BadRequestException('ticketId filter is required');
    const { where, orderBy, skip, take } = parseListQuery(query, LIST_SPEC);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy,
        skip,
        take,
        include: INCLUDE,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((r) => this.toComment(r))),
      total,
    };
  }

  async findOne(id: number): Promise<CommentResponse> {
    const row = await this.prisma.comment.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException(`Comment ${id} not found`);
    return this.toComment(row);
  }

  async create(
    dto: CreateCommentDto,
    user: AuthUser,
  ): Promise<CommentResponse> {
    const ticket = await this.prisma.ticket.count({
      where: { id: dto.ticketId },
    });
    if (!ticket)
      throw new BadRequestException(`ticketId ${dto.ticketId} does not exist`);
    const row = await this.prisma.comment.create({
      data: { ticketId: dto.ticketId, body: dto.body, authorId: user.id },
      include: INCLUDE,
    });
    return this.toComment(row);
  }

  // Record-level rule (D4): Casbin lets both roles "edit comments"; only the
  // author (or an admin) may edit this one.
  async update(
    id: number,
    dto: UpdateCommentDto,
    user: AuthUser,
  ): Promise<CommentResponse> {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException(`Comment ${id} not found`);
    if (user.role !== 'ADMIN' && comment.authorId !== user.id) {
      throw new ForbiddenException('You can only edit your own comments');
    }
    const row = await this.prisma.comment.update({
      where: { id },
      data: { body: dto.body },
      include: INCLUDE,
    });
    return this.toComment(row);
  }

  async remove(id: number) {
    await this.prisma.comment.delete({ where: { id } });
    return { id };
  }

  private async toComment(row: CommentRow) {
    return {
      id: row.id,
      ticketId: row.ticketId,
      authorId: row.authorId,
      author: row.author,
      body: row.body,
      isResolution: row.isResolution,
      // URL is signed per read (5 min) instead of stored: links never go stale
      // in the DB and the bucket never needs public access.
      attachment: row.attachmentKey
        ? {
            key: row.attachmentKey,
            name: row.attachmentName,
            contentType: row.attachmentContentType,
            size: row.attachmentSize,
            url: await this.storage.getPresignedGetUrl(row.attachmentKey),
          }
        : null,
      createdAt: row.createdAt,
    };
  }
}

export type CommentResponse = Awaited<ReturnType<CommentsService['toComment']>>;
