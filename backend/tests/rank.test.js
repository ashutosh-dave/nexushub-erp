import { describe, expect, it } from 'vitest';
import {
  compactRankAssignments,
  insertAtRank,
  orderAfterRemoval,
} from '../src/services/rankService.js';

describe('compactRankAssignments', () => {
  it('assigns contiguous ranks from zero', () => {
    expect(compactRankAssignments([10, 20, 30])).toEqual([
      { id: 10, rank_index: 0 },
      { id: 20, rank_index: 1 },
      { id: 30, rank_index: 2 },
    ]);
  });
});

describe('orderAfterRemoval', () => {
  it('removes id and preserves relative order', () => {
    expect(orderAfterRemoval([1, 2, 3, 4], 2)).toEqual([1, 3, 4]);
  });
});

describe('insertAtRank', () => {
  it('inserts at index and compacts logically', () => {
    expect(insertAtRank([1, 3, 4], 2, 1)).toEqual([1, 2, 3, 4]);
  });

  it('clamps index to bounds', () => {
    expect(insertAtRank([1, 2], 9, 99)).toEqual([1, 2, 9]);
    expect(insertAtRank([1, 2], 9, 0)).toEqual([9, 1, 2]);
  });
});

describe('recompact after removal', () => {
  it('produces contiguous ranks after removal', () => {
    const after = orderAfterRemoval([5, 7, 9, 11], 7);
    expect(compactRankAssignments(after)).toEqual([
      { id: 5, rank_index: 0 },
      { id: 9, rank_index: 1 },
      { id: 11, rank_index: 2 },
    ]);
  });
});
