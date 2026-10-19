import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/transforms.js';

export class CreateCommentDto {
  @IsInt()
  @Min(1)
  ticketId: number;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body: string;

  /** Key returned by POST /uploads. The format check stops a client from
   *  pointing a comment at arbitrary objects in the bucket. */
  @IsOptional()
  @Matches(/^attachments\/[0-9a-f-]{36}\.[a-z]+$/, {
    message: 'attachmentKey must be a key returned by POST /uploads',
  })
  attachmentKey?: string;
}
