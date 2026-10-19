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

// The field list sits in a different place depending on the engine/adapter.
function uniqueFields(
  error: Prisma.PrismaClientKnownRequestError,
): string | null {
  const meta = error.meta as
    | {
        target?: string[] | string;
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      }
    | undefined;
  const fields =
    meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  if (!fields) return null;
  return Array.isArray(fields) ? fields.join(', ') : fields;
}
