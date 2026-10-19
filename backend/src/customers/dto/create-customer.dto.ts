import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail, Trim } from '../../common/transforms.js';

export class CreateCustomerDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  company?: string | null;
}
