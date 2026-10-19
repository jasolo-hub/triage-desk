import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { Access, AuthenticatedOnly, CurrentUser } from '../auth/decorators.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Access('tickets', 'list')
  @Get()
  async list(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.tickets.list(query);
    res.setHeader('x-total-count', total);
    return items;
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
}
