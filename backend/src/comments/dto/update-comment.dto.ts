import { PickType } from '@nestjs/swagger';
import { CreateCommentDto } from './create-comment.dto.js';

// Only the text is editable; a comment never moves to another ticket.
export class UpdateCommentDto extends PickType(CreateCommentDto, [
  'body',
] as const) {}
