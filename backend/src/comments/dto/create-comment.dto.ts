import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
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
}
