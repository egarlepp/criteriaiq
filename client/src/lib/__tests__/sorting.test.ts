
import { describe, it, expect } from 'vitest';
import {
  stringComparator,
  numberComparator,
  dateComparator,
  booleanComparator,
  autoComparator,
  makeComparator,
  stableSort,
  sortRows,
  specialComparators
} from '../sorting';

describe('Sorting Utilities', () => {
  describe('stringComparator', () => {
    it('should sort strings correctly', () => {
      expect(stringComparator('apple', 'banana')).toBeLessThan(0);
      expect(stringComparator('banana', 'apple')).toBeGreaterThan(0);
      expect(stringComparator('apple', 'apple')).toBe(0);
    });

    it('should handle case insensitivity', () => {
      expect(stringComparator('Apple', 'banana')).toBeLessThan(0);
      expect(stringComparator('BANANA', 'apple')).toBeGreaterThan(0);
    });

    it('should handle null and undefined', () => {
      expect(stringComparator(null, 'apple')).toBeGreaterThan(0);
      expect(stringComparator('apple', null)).toBeLessThan(0);
      expect(stringComparator(null, null)).toBe(0);
      expect(stringComparator(undefined, 'apple')).toBeGreaterThan(0);
    });

    it('should trim whitespace', () => {
      expect(stringComparator('  apple  ', 'apple')).toBe(0);
      expect(stringComparator('  apple  ', '  banana  ')).toBeLessThan(0);
    });
  });

  describe('numberComparator', () => {
    it('should sort numbers correctly', () => {
      expect(numberComparator(1, 2)).toBeLessThan(0);
      expect(numberComparator(2, 1)).toBeGreaterThan(0);
      expect(numberComparator(1, 1)).toBe(0);
    });

    it('should handle null and undefined', () => {
      expect(numberComparator(null, 1)).toBeGreaterThan(0);
      expect(numberComparator(1, null)).toBeLessThan(0);
      expect(numberComparator(null, null)).toBe(0);
    });

    it('should handle NaN values', () => {
      expect(numberComparator(NaN, 1)).toBeGreaterThan(0);
      expect(numberComparator(1, NaN)).toBeLessThan(0);
      expect(numberComparator(NaN, NaN)).toBe(0);
    });

    it('should handle string numbers', () => {
      expect(numberComparator('1', '2')).toBeLessThan(0);
      expect(numberComparator('10', '2')).toBeGreaterThan(0);
    });
  });

  describe('dateComparator', () => {
    const date1 = new Date('2023-01-01');
    const date2 = new Date('2023-01-02');

    it('should sort dates correctly', () => {
      expect(dateComparator(date1, date2)).toBeLessThan(0);
      expect(dateComparator(date2, date1)).toBeGreaterThan(0);
      expect(dateComparator(date1, date1)).toBe(0);
    });

    it('should handle date strings', () => {
      expect(dateComparator('2023-01-01', '2023-01-02')).toBeLessThan(0);
      expect(dateComparator('2023-01-02', '2023-01-01')).toBeGreaterThan(0);
    });

    it('should handle null and undefined', () => {
      expect(dateComparator(null, date1)).toBeGreaterThan(0);
      expect(dateComparator(date1, null)).toBeLessThan(0);
      expect(dateComparator(null, null)).toBe(0);
    });

    it('should handle invalid dates', () => {
      expect(dateComparator('invalid', date1)).toBeGreaterThan(0);
      expect(dateComparator(date1, 'invalid')).toBeLessThan(0);
      expect(dateComparator('invalid', 'invalid')).toBe(0);
    });
  });

  describe('booleanComparator', () => {
    it('should sort booleans correctly', () => {
      expect(booleanComparator(false, true)).toBeLessThan(0);
      expect(booleanComparator(true, false)).toBeGreaterThan(0);
      expect(booleanComparator(true, true)).toBe(0);
    });

    it('should handle null and undefined as false', () => {
      expect(booleanComparator(null, true)).toBeLessThan(0);
      expect(booleanComparator(true, null)).toBeGreaterThan(0);
      expect(booleanComparator(null, null)).toBe(0);
    });

    it('should handle truthy/falsy values', () => {
      expect(booleanComparator(0, 1)).toBeLessThan(0);
      expect(booleanComparator('', 'hello')).toBeLessThan(0);
    });
  });

  describe('autoComparator', () => {
    it('should detect numbers and use number comparison', () => {
      expect(autoComparator(1, 2)).toBeLessThan(0);
      expect(autoComparator(10, 2)).toBeGreaterThan(0);
    });

    it('should detect booleans and use boolean comparison', () => {
      expect(autoComparator(false, true)).toBeLessThan(0);
      expect(autoComparator(true, false)).toBeGreaterThan(0);
    });

    it('should detect dates and use date comparison', () => {
      const date1 = new Date('2023-01-01');
      const date2 = new Date('2023-01-02');
      expect(autoComparator(date1, date2)).toBeLessThan(0);
    });

    it('should fallback to string comparison', () => {
      expect(autoComparator('apple', 'banana')).toBeLessThan(0);
      expect(autoComparator('banana', 'apple')).toBeGreaterThan(0);
    });
  });

  describe('specialComparators', () => {
    describe('userName', () => {
      it('should handle user objects with firstName and lastName', () => {
        const user1 = { firstName: 'John', lastName: 'Doe' };
        const user2 = { firstName: 'Jane', lastName: 'Smith' };
        expect(specialComparators.userName(user1, user2)).toBeGreaterThan(0);
      });

      it('should fallback to email if no name', () => {
        const user1 = { email: 'john@example.com' };
        const user2 = { email: 'jane@example.com' };
        expect(specialComparators.userName(user1, user2)).toBeGreaterThan(0);
      });

      it('should handle null users', () => {
        const user1 = { firstName: 'John', lastName: 'Doe' };
        expect(specialComparators.userName(null, user1)).toBeGreaterThan(0);
        expect(specialComparators.userName(user1, null)).toBeLessThan(0);
      });

      it('should handle string users', () => {
        expect(specialComparators.userName('John Doe', 'Jane Smith')).toBeGreaterThan(0);
      });
    });

    describe('status', () => {
      it('should handle status objects', () => {
        const status1 = { name: 'Active' };
        const status2 = { name: 'Inactive' };
        expect(specialComparators.status(status1, status2)).toBeLessThan(0);
      });

      it('should handle string status', () => {
        expect(specialComparators.status('Active', 'Inactive')).toBeLessThan(0);
      });
    });
  });

  describe('makeComparator', () => {
    const testData = [
      { id: 2, name: 'Bob', age: 25, createdAt: '2023-01-02' },
      { id: 1, name: 'Alice', age: 30, createdAt: '2023-01-01' },
      { id: 3, name: 'Charlie', age: 20, createdAt: '2023-01-03' }
    ];

    it('should return no-op comparator when sortConfig is null', () => {
      const comparator = makeComparator(null);
      expect(comparator(testData[0], testData[1])).toBe(0);
    });

    it('should sort by string field ascending', () => {
      const comparator = makeComparator({ key: 'name', direction: 'asc' });
      const sorted = stableSort(testData, comparator);
      expect(sorted[0].name).toBe('Alice');
      expect(sorted[1].name).toBe('Bob');
      expect(sorted[2].name).toBe('Charlie');
    });

    it('should sort by string field descending', () => {
      const comparator = makeComparator({ key: 'name', direction: 'desc' });
      const sorted = stableSort(testData, comparator);
      expect(sorted[0].name).toBe('Charlie');
      expect(sorted[1].name).toBe('Bob');
      expect(sorted[2].name).toBe('Alice');
    });

    it('should sort by number field', () => {
      const comparator = makeComparator({ key: 'age', direction: 'asc' });
      const sorted = stableSort(testData, comparator);
      expect(sorted[0].age).toBe(20);
      expect(sorted[1].age).toBe(25);
      expect(sorted[2].age).toBe(30);
    });

    it('should sort by ID field using number comparator', () => {
      const comparator = makeComparator({ key: 'id', direction: 'asc' });
      const sorted = stableSort(testData, comparator);
      expect(sorted[0].id).toBe(1);
      expect(sorted[1].id).toBe(2);
      expect(sorted[2].id).toBe(3);
    });

    it('should handle nested fields', () => {
      const nestedData = [
        { user: { name: 'Bob' } },
        { user: { name: 'Alice' } },
        { user: { name: 'Charlie' } }
      ];
      const comparator = makeComparator({ key: 'user.name', direction: 'asc' });
      const sorted = stableSort(nestedData, comparator);
      expect(sorted[0].user.name).toBe('Alice');
    });
  });

  describe('stableSort', () => {
    it('should preserve order of equal elements', () => {
      const data = [
        { id: 1, name: 'Alice', order: 1 },
        { id: 2, name: 'Bob', order: 2 },
        { id: 3, name: 'Alice', order: 3 },
        { id: 4, name: 'Bob', order: 4 }
      ];

      const comparator = makeComparator({ key: 'name', direction: 'asc' });
      const sorted = stableSort(data, comparator);

      // Alice entries should maintain their original order
      const aliceEntries = sorted.filter(item => item.name === 'Alice');
      expect(aliceEntries[0].order).toBe(1);
      expect(aliceEntries[1].order).toBe(3);

      // Bob entries should maintain their original order
      const bobEntries = sorted.filter(item => item.name === 'Bob');
      expect(bobEntries[0].order).toBe(2);
      expect(bobEntries[1].order).toBe(4);
    });

    it('should not mutate the original array', () => {
      const original = [{ name: 'Bob' }, { name: 'Alice' }];
      const comparator = makeComparator({ key: 'name', direction: 'asc' });
      const sorted = stableSort(original, comparator);

      expect(original[0].name).toBe('Bob');
      expect(sorted[0].name).toBe('Alice');
      expect(sorted).not.toBe(original);
    });
  });

  describe('sortRows', () => {
    const rows = [
      { id: 1, label: 'Stage 10', views: 5, seen: '2026-10-02T00:00:00Z' },
      { id: 2, label: 'stage 2', views: 0, seen: null },
      { id: 3, label: 'Alpha', views: 5, seen: '2026-10-01T00:00:00Z' },
    ];
    const accessors = {
      label: (r: typeof rows[number]) => r.label,
      views: (r: typeof rows[number]) => r.views,
      seen: (r: typeof rows[number]) => (r.seen ? new Date(r.seen) : null),
    };
    const ids = (list: typeof rows) => list.map((r) => r.id);

    it('keeps the incoming order and copies the array when no sort is chosen', () => {
      const sorted = sortRows(rows, null, accessors);
      expect(ids(sorted)).toEqual([1, 2, 3]);
      expect(sorted).not.toBe(rows);
    });

    it('compares accessor strings naturally and case-insensitively, never as dates', () => {
      expect(ids(sortRows(rows, { key: 'label', direction: 'asc' }, accessors))).toEqual([3, 2, 1]);
      expect(ids(sortRows(rows, { key: 'label', direction: 'desc' }, accessors))).toEqual([1, 2, 3]);
    });

    it('keeps ties in incoming order in both directions', () => {
      expect(ids(sortRows(rows, { key: 'views', direction: 'asc' }, accessors))).toEqual([2, 1, 3]);
      expect(ids(sortRows(rows, { key: 'views', direction: 'desc' }, accessors))).toEqual([1, 3, 2]);
    });

    it('puts blank values last whichever way the column is sorted', () => {
      expect(ids(sortRows(rows, { key: 'seen', direction: 'asc' }, accessors))).toEqual([3, 1, 2]);
      expect(ids(sortRows(rows, { key: 'seen', direction: 'desc' }, accessors))).toEqual([1, 3, 2]);
    });

    it('falls back to makeComparator for keys without an accessor', () => {
      expect(ids(sortRows(rows, { key: 'id', direction: 'desc' }))).toEqual([3, 2, 1]);
    });
  });
});
