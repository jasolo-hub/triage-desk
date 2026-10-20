import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { TransitionTicketDto } from './transition-ticket.dto.js';

// Bulk work runs one ticket at a time inside the request; 100 keeps it well
// under any request timeout and matches the max page size.
const MAX_BULK = 100;

export class BulkTransitionDto extends TransitionTicketDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  @ArrayUnique()
  @IsInt({ each: true })
  ids: number[];
}

export class BulkAssignDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  @ArrayUnique()
  @IsInt({ each: true })
  ids: number[];

  /** Required key; null un-assigns. */
  @ValidateIf((o: BulkAssignDto) => o.assigneeId !== null)
  @IsInt()
  @Min(1)
  assigneeId: number | null;
}

export interface BulkResult {
  updated: number[];
  /** Already in the requested state: a no-op, not an error (mixed selections are normal in bulk). */
  skipped: number[];
  failed: { id: number; reason: string }[];
}
