import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, AgentsController],
  providers: [UsersService],
})
export class UsersModule {}
