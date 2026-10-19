import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ListQuerySpec,
  ListResult,
  parseListQuery,
} from '../common/list-query.js';
import { Prisma, Tag } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { UpdateTagDto } from './dto/update-tag.dto.js';

const LIST_SPEC: ListQuerySpec<Prisma.TagWhereInput> = {
  filterable: { id: 'int', name: 'string' },
  sortable: ['id', 'name'],
  defaultSort: { field: 'name', order: 'asc' },
};

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>): Promise<ListResult<Tag>> {
    const { where, orderBy, skip, take } = parseListQuery(query, LIST_SPEC);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tag.findMany({ where, orderBy, skip, take }),
      this.prisma.tag.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: number): Promise<Tag> {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }

  // Duplicate name → P2002 → 409 via the global filter.
  create(dto: CreateTagDto): Promise<Tag> {
    return this.prisma.tag.create({ data: dto });
  }

  update(id: number, dto: UpdateTagDto): Promise<Tag> {
    return this.prisma.tag.update({ where: { id }, data: dto });
  }

  // Ticket links live in the implicit join table and are removed with the tag.
  async remove(id: number) {
    await this.prisma.tag.delete({ where: { id } });
    return { id };
  }
}
