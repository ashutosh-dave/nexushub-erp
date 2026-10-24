import { describe, expect, it } from 'vitest';
import { parseMultiSort, sortClause } from '../src/utils/pagination.js';

describe('sortClause', () => {
  it('quotes unqualified columns', () => {
    expect(sortClause([{ col: 'created_at', dir: 'DESC' }])).toBe('`created_at` DESC');
  });

  it('quotes each part of a qualified column (table.alias)', () => {
    expect(sortClause([{ col: 's.created_at', dir: 'DESC' }])).toBe('`s`.`created_at` DESC');
  });

  it('joins multiple parts', () => {
    expect(
      sortClause([
        { col: 's.type', dir: 'ASC' },
        { col: 's.created_at', dir: 'DESC' },
      ])
    ).toBe('`s`.`type` ASC, `s`.`created_at` DESC');
  });
});

describe('parseMultiSort', () => {
  const whitelist = ['name', 'type', 'email', 'created_at'];

  it('supports comma-separated multi-column sort', () => {
    expect(parseMultiSort('type,created_at', 'asc,desc', whitelist, [{ col: 'created_at', dir: 'DESC' }])).toEqual(
      [
        { col: 'type', dir: 'ASC' },
        { col: 'created_at', dir: 'DESC' },
      ]
    );
  });
});
