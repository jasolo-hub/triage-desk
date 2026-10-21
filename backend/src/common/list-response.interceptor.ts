import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import type { ListResult } from './list-query.js';

// Refine's simple-rest data provider expects list endpoints to answer with a
// bare JSON array and the total in an `x-total-count` header. Services return
// `{ items, total }` (ListResult); this interceptor does the header + unwrap
// once, so controllers just `return this.service.list(query)` instead of
// repeating `res.setHeader(...)` six times.
@Injectable()
export class ListResponseInterceptor<T> implements NestInterceptor<
  ListResult<T>,
  T[]
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<ListResult<T>>,
  ): Observable<T[]> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map(({ items, total }) => {
        res.setHeader('x-total-count', total);
        return items;
      }),
    );
  }
}

/** Marks a handler that returns a ListResult; see ListResponseInterceptor. */
export const ListResponse = () =>
  applyDecorators(UseInterceptors(ListResponseInterceptor));
