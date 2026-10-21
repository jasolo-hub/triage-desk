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
import type { AuthUser } from '../auth/auth-user.js';
import { Access, CurrentUser } from '../auth/decorators.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';
import { ListResponse } from '../common/list-response.interceptor.js';

@ApiTags('comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Access('comments', 'list')
  @ListResponse()
  @Get()
  async list(@Query() query: Record<string, unknown>) {
    return this.comments.list(query);
  }

  // Reading one comment is covered by the "list" permission (the policy has no
  // separate "show" for comments); Refine's edit form loads the record this way.
  @Access('comments', 'list')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.comments.findOne(id);
  }

  @Access('comments', 'create')
  @Post()
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: AuthUser) {
    return this.comments.create(dto, user);
  }

  @Access('comments', 'edit')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.update(id, dto, user);
  }

  @Access('comments', 'delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.comments.remove(id);
  }
}
