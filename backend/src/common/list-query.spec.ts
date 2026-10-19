import { BadRequestException } from '@nestjs/common';
import { ListQuerySpec, parseListQuery } from './list-query.js';

const spec: ListQuerySpec<object> = {
  filterable: {
    id: 'int',
    title: 'string',
    status: ['OPEN', 'CLOSED'],
    createdAt: 'date',
    archived: 'boolean',
  },
  sortable: ['id', 'title', 'createdAt'],
  defaultSort: { field: 'createdAt', order: 'desc' },
  custom: { q: (v) => ({ OR: [{ title: { contains: v } }] }) },
};

const parse = (query: Record<string, unknown>) => parseListQuery(query, spec);

describe('parseListQuery', () => {
  describe('pagination', () => {
    it('maps _start/_end to skip/take', () => {
      expect(parse({ _start: '20', _end: '30' })).toMatchObject({
        skip: 20,
        take: 10,
      });
    });

    it('defaults to the first full page when no range is given', () => {
      expect(parse({})).toMatchObject({ skip: 0, take: 100 });
    });

    it('rejects pages larger than 100 rows', () => {
      expect(() => parse({ _start: '0', _end: '101' })).toThrow(
        BadRequestException,
      );
    });

    it('rejects a reversed or non-numeric range', () => {
      expect(() => parse({ _start: '10', _end: '5' })).toThrow(
        BadRequestException,
      );
      expect(() => parse({ _start: 'abc', _end: '5' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('sorting', () => {
    it('uses the default sort plus an id tie-breaker', () => {
      expect(parse({}).orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    });

    it('parses multiple fields with matching orders', () => {
      expect(
        parse({ _sort: 'title,createdAt', _order: 'asc,desc' }).orderBy,
      ).toEqual([{ title: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }]);
    });

    it('does not add a second id key when sorting by id', () => {
      expect(parse({ _sort: 'id', _order: 'desc' }).orderBy).toEqual([
        { id: 'desc' },
      ]);
    });

    it('rejects unknown sort fields and orders', () => {
      expect(() => parse({ _sort: 'password' })).toThrow(
        'Cannot sort by password',
      );
      expect(() => parse({ _sort: 'title', _order: 'sideways' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('filters', () => {
    it('maps a single value to equals and repeated values to in', () => {
      expect(parse({ status: 'OPEN' }).where).toEqual({
        AND: [{ status: 'OPEN' }],
      });
      expect(parse({ id: ['1', '2'] }).where).toEqual({
        AND: [{ id: { in: [1, 2] } }],
      });
    });

    it('supports _ne, _gte, _lte and _like', () => {
      const where = parse({
        status_ne: 'CLOSED',
        createdAt_gte: '2026-01-01T00:00:00.000Z',
        createdAt_lte: '2026-02-01T00:00:00.000Z',
        title_like: 'Login',
      }).where;
      expect(where).toEqual({
        AND: [
          { status: { not: 'CLOSED' } },
          { createdAt: { gte: new Date('2026-01-01T00:00:00.000Z') } },
          { createdAt: { lte: new Date('2026-02-01T00:00:00.000Z') } },
          { title: { contains: 'Login', mode: 'insensitive' } },
        ],
      });
    });

    it('parses booleans and rejects invalid typed values', () => {
      expect(parse({ archived: 'true' }).where).toEqual({
        AND: [{ archived: true }],
      });
      expect(() => parse({ archived: 'yes' })).toThrow(BadRequestException);
      expect(() => parse({ id: 'abc' })).toThrow(BadRequestException);
      expect(() => parse({ status: 'DELETED' })).toThrow(BadRequestException);
      expect(() => parse({ createdAt_gte: 'not-a-date' })).toThrow(
        BadRequestException,
      );
    });

    it('rejects unknown keys and operators the field type does not support', () => {
      expect(() => parse({ passwordHash: 'x' })).toThrow(
        'Unknown filter passwordHash',
      );
      expect(() => parse({ status_like: 'OP' })).toThrow(
        'Filter status_like is not supported',
      );
      expect(() => parse({ title_gte: 'a' })).toThrow(BadRequestException);
    });

    it('delegates custom keys to the resource and requires a single value', () => {
      expect(parse({ q: 'vpn' }).where).toEqual({
        AND: [{ OR: [{ title: { contains: 'vpn' } }] }],
      });
      expect(() => parse({ q: ['a', 'b'] })).toThrow(BadRequestException);
    });
  });
});
