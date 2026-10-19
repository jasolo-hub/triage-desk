import { PartialType } from '@nestjs/swagger';
import { CreateTicketDto } from './create-ticket.dto.js';

// Same fields, all optional. Still no `status` (D10): PATCH cannot bypass the
// transition rules; a `status` key is rejected with 400.
export class UpdateTicketDto extends PartialType(CreateTicketDto) {}
