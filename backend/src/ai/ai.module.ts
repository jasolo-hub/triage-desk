import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({
  imports: [TicketsModule], // the prompt is built from TicketsService.fields()
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
