import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { hashPassword } from '../auth/password.js';
import {
  ListQuerySpec,
  ListResult,
  parseListQuery,
} from '../common/list-query.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const ROLES = Object.values(Role);

const nameOrEmail = (v: string): Prisma.UserWhereInput => ({
  OR: [
    { name: { contains: v, mode: 'insensitive' } },
    { email: { contains: v, mode: 'insensitive' } },
  ],
});

const USERS_SPEC: ListQuerySpec<Prisma.UserWhereInput> = {
  filterable: { id: 'int', name: 'string', email: 'string', role: ROLES },
  sortable: ['id', 'name', 'email', 'role', 'createdAt'],
  defaultSort: { field: 'name', order: 'asc' },
  custom: { q: nameOrEmail },
};

const AGENTS_SPEC: ListQuerySpec<Prisma.UserWhereInput> = {
  filterable: { id: 'int', name: 'string', email: 'string', role: ROLES },
  sortable: ['id', 'name'],
  defaultSort: { field: 'name', order: 'asc' },
  custom: { q: nameOrEmail },
};

// Explicit selects so password/refresh hashes can never leak into a response.
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;
const AGENT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

type UserResponse = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
type AgentResponse = Prisma.UserGetPayload<{ select: typeof AGENT_SELECT }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: Record<string, unknown>,
  ): Promise<ListResult<UserResponse>> {
    const { where, orderBy, skip, take } = parseListQuery(query, USERS_SPEC);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  /** Assignee picker for both roles (D15). Includes admins: they can be assigned too. */
  async listAgents(
    query: Record<string, unknown>,
  ): Promise<ListResult<AgentResponse>> {
    const { where, orderBy, skip, take } = parseListQuery(query, AGENTS_SPEC);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: AGENT_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: number): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  // Duplicate email → P2002 → 409 via the global filter.
  async create(dto: CreateUserDto): Promise<UserResponse> {
    const { password, ...data } = dto;
    return this.prisma.user.create({
      data: { ...data, passwordHash: await hashPassword(password) },
      select: USER_SELECT,
    });
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    current: AuthUser,
  ): Promise<UserResponse> {
    // Guards against an admin locking everyone out by demoting themselves.
    if (id === current.id && dto.role && dto.role !== 'ADMIN') {
      throw new UnprocessableEntityException(
        'You cannot remove your own admin role',
      );
    }
    const { password, ...data } = dto;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(password && { passwordHash: await hashPassword(password) }),
        // A new password or role ends the current session: the user logs in
        // again and gets a token with the new role.
        ...((password || data.role) && {
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        }),
      },
      select: USER_SELECT,
    });
  }

  // Users who authored comments are protected by FK restrict (P2003 → 409);
  // their tickets are un-assigned (SetNull).
  async remove(id: number, current: AuthUser) {
    if (id === current.id)
      throw new UnprocessableEntityException('You cannot delete yourself');
    await this.prisma.user.delete({ where: { id } });
    return { id };
  }
}
