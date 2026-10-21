import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ListQuerySpec,
  ListResult,
  parseListQuery,
} from '../common/list-query.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { LIST_TX } from '../common/list-tx.js';

const LIST_SPEC: ListQuerySpec<Prisma.CustomerWhereInput> = {
  filterable: { id: 'int', name: 'string', email: 'string', company: 'string' },
  sortable: ['id', 'name', 'email', 'company', 'createdAt'],
  defaultSort: { field: 'createdAt', order: 'desc' },
  custom: {
    q: (v) => ({
      OR: [
        { name: { contains: v, mode: 'insensitive' } },
        { email: { contains: v, mode: 'insensitive' } },
      ],
    }),
  },
};

const SELECT = {
  id: true,
  name: true,
  email: true,
  company: true,
  createdAt: true,
  _count: { select: { tickets: true } },
} satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof SELECT }>;

function toCustomer({ _count, ...customer }: CustomerRow) {
  return { ...customer, ticketCount: _count.tickets };
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: Record<string, unknown>,
  ): Promise<ListResult<ReturnType<typeof toCustomer>>> {
    const { where, orderBy, skip, take } = parseListQuery(query, LIST_SPEC);
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.customer.findMany({
          where,
          orderBy,
          skip,
          take,
          select: SELECT,
        }),
        this.prisma.customer.count({ where }),
      ],
      LIST_TX,
    );
    return { items: rows.map(toCustomer), total };
  }

  async findOne(id: number) {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundException(`Customer ${id} not found`);
    return toCustomer(row);
  }

  // Duplicate email → P2002 → 409 via PrismaExceptionFilter. Relying on the
  // unique index (not a "find then insert") is race-free.
  async create(dto: CreateCustomerDto) {
    return toCustomer(
      await this.prisma.customer.create({ data: dto, select: SELECT }),
    );
  }

  async update(id: number, dto: UpdateCustomerDto) {
    return toCustomer(
      await this.prisma.customer.update({
        where: { id },
        data: dto,
        select: SELECT,
      }),
    );
  }

  // A customer with tickets → FK restrict (P2003) → 409; history is never cascaded away.
  async remove(id: number) {
    await this.prisma.customer.delete({ where: { id } });
    return { id };
  }
}
