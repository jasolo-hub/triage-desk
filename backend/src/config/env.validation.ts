import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

// Boot-time env contract. Every required value must be present or the app
// refuses to start (D12: nothing falls back silently to a local default).
export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Type(() => Number)
  @IsInt()
  PORT: number = 3000;

  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  })
  DATABASE_URL: string;

  // why: HS256 is only as strong as the secret; 32 chars ≈ 256 bits if random.
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  // Format accepted by jsonwebtoken's `expiresIn` (e.g. 900s, 15m, 1h).
  @Matches(/^\d+[smhd]$/, {
    message: 'JWT_ACCESS_TTL must look like 15m, 900s, 1h',
  })
  JWT_ACCESS_TTL: string = '15m';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS: number = 7;

  // Comma-separated list of allowed frontend origins.
  @IsString()
  @MinLength(1)
  CORS_ORIGIN: string;

  @Matches(/^https?:\/\//, { message: 'S3_ENDPOINT must be an http(s) URL' })
  S3_ENDPOINT: string;

  @IsString()
  @MinLength(1)
  S3_REGION: string;

  @IsString()
  @MinLength(1)
  S3_BUCKET: string;

  @IsString()
  @MinLength(1)
  S3_ACCESS_KEY_ID: string;

  @IsString()
  @MinLength(1)
  S3_SECRET_ACCESS_KEY: string;

  // why explicit transform: Boolean('false') === true, so implicit conversion is wrong here.
  @Transform(({ value }) => value === true || value === 'true')
  S3_FORCE_PATH_STYLE: boolean = false;

  // AI is optional (D16): missing key means /ai/ask answers 503, the app still boots.
  @IsOptional()
  @Matches(/^https?:\/\//, { message: 'AI_BASE_URL must be an http(s) URL' })
  AI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_MODEL?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REOPEN_WINDOW_DAYS: number = 7;
}

// Used by ConfigModule.forRoot({ validate }). Throws one readable error listing
// every bad variable, so a misconfigured deploy fails at boot, not at first request.
export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw);
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const lines = errors.map(
      (e) =>
        `  - ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return env;
}
