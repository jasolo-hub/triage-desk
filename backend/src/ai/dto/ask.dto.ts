import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/transforms.js';
import { TICKET_FIELD_NAMES } from '../../tickets/ticket-fields.js';

export class AskDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500) // bounds prompt size and cost per call
  question: string;

  /** Form field the user is looking at, e.g. "priority". */
  @IsOptional()
  @IsIn(TICKET_FIELD_NAMES)
  field?: string;
}
