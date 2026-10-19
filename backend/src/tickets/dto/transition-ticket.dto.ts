import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/transforms.js';
import { TicketStatus } from '../../generated/prisma/client.js';

export class TransitionTicketDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;

  /** Required when status is RESOLVED (stored as the resolution comment);
   *  optional otherwise (stored as a normal comment). */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(10_000)
  comment?: string;
}
