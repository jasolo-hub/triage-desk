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
import { Access, CurrentUser } from '../auth/decorators.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

// User management: the policy grants "users" to ADMIN only.
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Access('users', 'list')
  @Get()
  async list(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.users.list(query);
    res.setHeader('x-total-count', total);
    return items;
  }

  @Access('users', 'show')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findOne(id);
  }

  @Access('users', 'create')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Access('users', 'edit')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.update(id, dto, user);
  }

  @Access('users', 'delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.users.remove(id, user);
  }
}
