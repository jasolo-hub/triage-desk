import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [StorageModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
