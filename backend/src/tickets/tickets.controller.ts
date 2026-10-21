import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.js';
import { Access, AuthenticatedOnly, CurrentUser } from '../auth/decorators.js';
import { BulkAssignDto, BulkTransitionDto } from './dto/bulk.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { TransitionTicketDto } from './dto/transition-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { TicketsService } from './tickets.service.js';
import { ListResponse } from '../common/list-response.interceptor.js';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Access('tickets', 'list')
  @ListResponse()
  @Get()
  async list(@Query() query: Record<string, unknown>) {
    return this.tickets.list(query);
  }

  // Declared before ':id' so "fields" is not parsed as an id. Static form
  // metadata, no record data, so any logged-in user may read it.
  @AuthenticatedOnly()
  @Get('fields')
  fields() {
    return this.tickets.fields();
  }

  @Access('tickets', 'show')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tickets.findOne(id);
  }

  @Access('tickets', 'create')
  @Post()
  create(@Body() dto: CreateTicketDto) {
    return this.tickets.create(dto);
  }

  @Access('tickets', 'edit')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.update(id, dto, user);
  }

  @Access('tickets', 'delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tickets.remove(id);
  }

  // Bulk actions are ADMIN-only: the AGENT policy has no 'bulk' action.
  @Access('tickets', 'bulk')
  @Post('bulk-transition')
  @HttpCode(200)
  bulkTransition(
    @Body() dto: BulkTransitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.bulkTransition(dto, user);
  }

  @Access('tickets', 'bulk')
  @Post('bulk-assign')
  @HttpCode(200)
  bulkAssign(@Body() dto: BulkAssignDto) {
    return this.tickets.bulkAssign(dto);
  }

  @Access('tickets', 'transition')
  @Post(':id/transition')
  @HttpCode(200)
  transition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tickets.transition(id, dto, user);
  }
}
