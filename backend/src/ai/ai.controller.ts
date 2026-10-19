import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Access } from '../auth/decorators.js';
import { AiService } from './ai.service.js';
import { AskDto } from './dto/ask.dto.js';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Access('ai', 'ask')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // per user: protects the provider quota
  @Post('ask')
  @HttpCode(200)
  ask(@Body() dto: AskDto) {
    return this.ai.ask(dto.question, dto.field);
  }
}
