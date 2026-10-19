import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto.js';

// PartialType from @nestjs/swagger keeps both validation and docs metadata.
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
