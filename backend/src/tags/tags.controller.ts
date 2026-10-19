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
import { Access } from '../auth/decorators.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { UpdateTagDto } from './dto/update-tag.dto.js';
import { TagsService } from './tags.service.js';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Access('tags', 'list')
  @Get()
  async list(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.tags.list(query);
    res.setHeader('x-total-count', total);
    return items;
  }

  @Access('tags', 'show')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tags.findOne(id);
  }

  @Access('tags', 'create')
  @Post()
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Access('tags', 'edit')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Access('tags', 'delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tags.remove(id);
  }
}
