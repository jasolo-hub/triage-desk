import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/transforms.js';

export class CreateTagDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  /** Hex colour used for the tag chip, e.g. #1677ff. */
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a hex colour like #1677ff',
  })
  color: string;
}
