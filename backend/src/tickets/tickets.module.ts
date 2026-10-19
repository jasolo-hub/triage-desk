import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService], // the AI module reads the form metadata (B11)
})
export class TicketsModule {}
