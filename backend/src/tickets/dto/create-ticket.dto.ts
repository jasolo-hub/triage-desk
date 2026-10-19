import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/transforms.js';
import { TicketPriority } from '../../generated/prisma/client.js';
import { MAX_TAGS_PER_TICKET } from '../ticket-fields.js';

// No `status` field on purpose: new tickets are always OPEN, and with
// forbidNonWhitelisted a client sending `status` gets a 400 (D10).
export class CreateTicketDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  description: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsInt()
  @Min(1)
  customerId: number;

  // null = unassigned
  @IsOptional()
  @IsInt()
  @Min(1)
  assigneeId?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_TICKET)
  @ArrayUnique()
  @IsInt({ each: true })
  tagIds?: number[];
}
