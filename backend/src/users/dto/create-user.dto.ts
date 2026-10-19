import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail, Trim } from '../../common/transforms.js';
import { Role } from '../../generated/prisma/client.js';

export class CreateUserDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsEnum(Role)
  role: Role;

  // 8 is the floor; the max guards argon2 against huge inputs.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
