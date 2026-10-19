import { BadRequestException } from '@nestjs/common';

// Turns Refine simple-rest query params (D5) into Prisma findMany arguments.
//   _start/_end            → skip/take (0-based, end exclusive, max 100 rows)
//   _sort=a,b&_order=x,y   → orderBy (whitelisted fields only)
//   f=v / f=v&f=w          → equals / in
//   f_ne, f_gte, f_lte     → not / gte / lte
//   f_like                 → case-insensitive contains
// Anything not whitelisted is a 400: a typo in a filter must not silently
// return the unfiltered list.

/** Field type decides how values are parsed and which operators are allowed.
 *  A string array means "enum with these values". */
export type FilterType =
  'int' | 'string' | 'date' | 'boolean' | readonly string[];

export interface ListQuerySpec<TWhere> {
  filterable: Record<string, FilterType>;
  sortable: readonly string[];
  defaultSort: { field: string; order: 'asc' | 'desc' };
  /** Resource-specific keys (e.g. q, isOverdue) that map to a where fragment. */
  custom?: Record<string, (value: string) => TWhere>;
}

export interface ListArgs<TWhere> {
  where: TWhere;
  orderBy: Record<string, 'asc' | 'desc'>[];
  skip: number;
  take: number;
}

export const MAX_PAGE_SIZE = 100;

type Operator = 'eq' | 'ne' | 'gte' | 'lte' | 'like';
const RESERVED = new Set(['_start', '_end', '_sort', '_order']);
const SUFFIX = /^(.+)_(ne|gte|lte|like)$/;

function allowedOps(type: FilterType): Operator[] {
  if (Array.isArray(type)) return ['eq', 'ne'];
  switch (type) {
    case 'int':
    case 'date':
      return ['eq', 'ne', 'gte', 'lte'];
    case 'string':
      return ['eq', 'ne', 'like'];
    default:
      return ['eq'];
  }
}

export function parseListQuery<TWhere extends object>(
  query: Record<string, unknown>,
  spec: ListQuerySpec<TWhere>,
): ListArgs<TWhere> {
  const { skip, take } = parsePagination(query);
  const orderBy = parseSort(query, spec);

  const conditions: object[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (RESERVED.has(key)) continue;
    const values = toStrings(key, raw);

    const customFilter = spec.custom?.[key];
    if (customFilter) {
      if (values.length !== 1)
        throw new BadRequestException(`Filter ${key} accepts one value`);
      conditions.push(customFilter(values[0]));
      continue;
    }

    const [field, op] = splitKey(key, spec.filterable);
    const type = spec.filterable[field];
    if (!allowedOps(type).includes(op)) {
      throw new BadRequestException(`Filter ${key} is not supported`);
    }
    const parsed = values.map((v) => parseValue(key, v, type));
    conditions.push(...buildConditions(field, op, parsed));
  }

  // AND of independent conditions: lets createdAt_gte and createdAt_lte coexist
  // without merging objects by hand.
  return { where: { AND: conditions } as TWhere, orderBy, skip, take };
}

function parsePagination(query: Record<string, unknown>): {
  skip: number;
  take: number;
} {
  const start = query._start === undefined ? 0 : toInt('_start', query._start);
  // No _end (e.g. Refine pagination mode "off" for small lookups) → one full page.
  const end =
    query._end === undefined
      ? start + MAX_PAGE_SIZE
      : toInt('_end', query._end);
  if (start < 0 || end < start)
    throw new BadRequestException('Invalid _start/_end range');
  if (end - start > MAX_PAGE_SIZE) {
    throw new BadRequestException(`Page size cannot exceed ${MAX_PAGE_SIZE}`);
  }
  return { skip: start, take: end - start };
}

function parseSort<TWhere>(
  query: Record<string, unknown>,
  spec: ListQuerySpec<TWhere>,
): Record<string, 'asc' | 'desc'>[] {
  const fields =
    query._sort === undefined ? [] : single('_sort', query._sort).split(',');
  const orders =
    query._order === undefined ? [] : single('_order', query._order).split(',');

  const orderBy = fields.map((field, i) => {
    if (!spec.sortable.includes(field))
      throw new BadRequestException(`Cannot sort by ${field}`);
    const order = (orders[i] ?? 'asc').toLowerCase();
    if (order !== 'asc' && order !== 'desc') {
      throw new BadRequestException(`Invalid sort order ${order}`);
    }
    return { [field]: order as 'asc' | 'desc' };
  });
  if (orderBy.length === 0)
    orderBy.push({ [spec.defaultSort.field]: spec.defaultSort.order });
  // Tie-breaker: without a unique last key, rows with equal sort values can
  // appear on two pages or none when paginating.
  if (!fields.includes('id')) orderBy.push({ id: 'asc' });
  return orderBy;
}

function splitKey(
  key: string,
  filterable: Record<string, FilterType>,
): [string, Operator] {
  const m = SUFFIX.exec(key);
  if (m && m[1] in filterable) return [m[1], m[2] as Operator];
  if (key in filterable) return [key, 'eq'];
  throw new BadRequestException(`Unknown filter ${key}`);
}

function buildConditions(
  field: string,
  op: Operator,
  values: unknown[],
): object[] {
  switch (op) {
    case 'eq':
      return [{ [field]: values.length === 1 ? values[0] : { in: values } }];
    case 'ne':
      return [
        {
          [field]: values.length === 1 ? { not: values[0] } : { notIn: values },
        },
      ];
    case 'like':
      return values.map((v) => ({
        [field]: { contains: v, mode: 'insensitive' },
      }));
    case 'gte':
    case 'lte':
      return values.map((v) => ({ [field]: { [op]: v } }));
  }
}

function parseValue(key: string, value: string, type: FilterType): unknown {
  if (Array.isArray(type)) {
    if (!type.includes(value))
      throw new BadRequestException(`Invalid value for ${key}: ${value}`);
    return value;
  }
  switch (type) {
    case 'int':
      return toInt(key, value);
    case 'date': {
      const date = new Date(value);
      if (Number.isNaN(date.getTime()))
        throw new BadRequestException(`${key} must be a date`);
      return date;
    }
    case 'boolean':
      if (value !== 'true' && value !== 'false') {
        throw new BadRequestException(`${key} must be true or false`);
      }
      return value === 'true';
    default:
      return value;
  }
}

function toInt(key: string, raw: unknown): number {
  const n = Number(single(key, raw));
  if (!Number.isInteger(n))
    throw new BadRequestException(`${key} must be an integer`);
  return n;
}

function single(key: string, raw: unknown): string {
  if (typeof raw !== 'string')
    throw new BadRequestException(`${key} must be a single value`);
  return raw;
}

// Express' simple query parser yields a string, or an array for repeated keys.
function toStrings(key: string, raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  if (!values.every((v) => typeof v === 'string')) {
    throw new BadRequestException(`Invalid value for ${key}`);
  }
  return values as string[];
}
