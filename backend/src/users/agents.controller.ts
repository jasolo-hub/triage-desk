import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Access } from '../auth/decorators.js';
import { UsersService } from './users.service.js';

// Read-only list of assignable users for both roles (D15). A separate resource
// keeps "users" (and its menu item) ADMIN-only.
@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly users: UsersService) {}

  @Access('agents', 'list')
  @Get()
  async list(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.users.listAgents(query);
    res.setHeader('x-total-count', total);
    return items;
  }
}
