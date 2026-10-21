import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Access } from '../auth/decorators.js';
import { UsersService } from './users.service.js';
import { ListResponse } from '../common/list-response.interceptor.js';

// Read-only list of assignable users for both roles (D15). A separate resource
// keeps "users" (and its menu item) ADMIN-only.
@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly users: UsersService) {}

  @Access('agents', 'list')
  @ListResponse()
  @Get()
  async list(@Query() query: Record<string, unknown>) {
    return this.users.listAgents(query);
  }
}
