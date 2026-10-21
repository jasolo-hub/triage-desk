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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Access } from '../auth/decorators.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { UpdateTagDto } from './dto/update-tag.dto.js';
import { TagsService } from './tags.service.js';
import { ListResponse } from '../common/list-response.interceptor.js';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Access('tags', 'list')
  @ListResponse()
  @Get()
  async list(@Query() query: Record<string, unknown>) {
    return this.tags.list(query);
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
