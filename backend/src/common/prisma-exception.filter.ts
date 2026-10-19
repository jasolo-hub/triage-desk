import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client.js';

// Translates known Prisma errors into HTTP errors so services can rely on DB
// constraints (unique email, FK restrict) instead of racy "check then insert".
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    // Unknown codes fall through to Nest's default handler (logged, 500).
    super.catch(toHttpException(error) ?? error, host);
  }
}

export function toHttpException(
  error: Prisma.PrismaClientKnownRequestError,
): HttpException | null {
  switch (error.code) {
    case 'P2002': // unique constraint violation
      return new ConflictException(
        `${uniqueFields(error) ?? 'Value'} already exists`,
      );
    case 'P2003': // foreign key violation (e.g. delete a customer that still has tickets)
      return new ConflictException(
        'Record is still referenced by other records',
      );
    case 'P2025': // record required by update/delete not found
      return new NotFoundException('Record not found');
    default:
      return null;
  }
}

// Where the offending field is reported depends on the engine: the classic engine
// sets meta.target; the pg driver adapter only gives the index name, which
// Prisma names "<Model>_<field>_key" (e.g. Customer_email_key → email).
function uniqueFields(
  error: Prisma.PrismaClientKnownRequestError,
): string | null {
  const meta = error.meta as
    | {
        target?: string[] | string;
        modelName?: string;
        driverAdapterError?: {
          cause?: { constraint?: { fields?: string[]; index?: string } };
        };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  const fields = meta?.target ?? constraint?.fields;
  if (fields) return Array.isArray(fields) ? fields.join(', ') : fields;
  const index = constraint?.index;
  if (
    index &&
    meta?.modelName &&
    index.startsWith(`${meta.modelName}_`) &&
    index.endsWith('_key')
  ) {
    return index.slice(meta.modelName.length + 1, -'_key'.length);
  }
  return null;
}
