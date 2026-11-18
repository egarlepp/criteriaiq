import { describe, it, expect } from 'vitest';
import { getEndDateFlag, EndDateFlag } from '../date-utils';

const makeFlag = (overrides: Partial<EndDateFlag> = {}): EndDateFlag => ({
  id: 1,
  name: 'Overdue',
  badgeText: 'Overdue!',
  badgeColor: 'destructive',
  triggerType: 'days_after',
  triggerValue: 1,
  priority: 1,
  isActive: true,
  isSystem: true,
  targetField: 'project.endDate',
  ...overrides,
});

const YESTERDAY = new Date();
YESTERDAY.setDate(YESTERDAY.getDate() - 2);
const YESTERDAY_STR = YESTERDAY.toISOString().split('T')[0];

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 2);
const TOMORROW_STR = TOMORROW.toISOString().split('T')[0];

describe('getEndDateFlag — targetField filtering', () => {
  it('returns a matching flag when targetField matches', () => {
    const flag = makeFlag({ targetField: 'project.endDate' });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Overdue');
  });

  it('returns null when flag targetField does not match the requested field', () => {
    const flag = makeFlag({ targetField: 'dependency.dueDate' });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).toBeNull();
  });

  it('returns null when flag targets project.endDate but requested field is dependency.dueDate', () => {
    const flag = makeFlag({ targetField: 'project.endDate' });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'dependency.dueDate');
    expect(result).toBeNull();
  });

  it('matches flag with no targetField (defaults to project.endDate) when requesting project.endDate', () => {
    const flag = makeFlag({ targetField: undefined });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).not.toBeNull();
  });

  it('returns null for inactive flag even if targetField matches', () => {
    const flag = makeFlag({ isActive: false, targetField: 'project.endDate' });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).toBeNull();
  });

  it('returns highest-priority flag among multiple matching flags', () => {
    const lowPriority = makeFlag({ id: 1, name: 'Low', priority: 1, triggerType: 'days_after', triggerValue: 1 });
    const highPriority = makeFlag({ id: 2, name: 'High', priority: 5, triggerType: 'days_after', triggerValue: 1 });
    const result = getEndDateFlag(YESTERDAY_STR, [lowPriority, highPriority], 'America/New_York', undefined, 'project.endDate');
    expect(result?.name).toBe('High');
  });

  it('days_before trigger returns flag when date is within range', () => {
    const flag = makeFlag({ triggerType: 'days_before', triggerValue: 7 });
    const result = getEndDateFlag(TOMORROW_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).not.toBeNull();
  });

  it('days_before trigger returns null when date is in the past', () => {
    const flag = makeFlag({ triggerType: 'days_before', triggerValue: 7 });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).toBeNull();
  });
});

describe('getEndDateFlag — projectStatuses filtering', () => {
  it('blocks project.endDate flag when projectStatuses set but no status provided', () => {
    const flag = makeFlag({ projectStatuses: ['In Progress', 'Planning'] });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'project.endDate');
    expect(result).toBeNull();
  });

  it('allows project.endDate flag when projectStatus matches', () => {
    const flag = makeFlag({ projectStatuses: ['In Progress', 'Planning'] });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', 'In Progress', 'project.endDate');
    expect(result).not.toBeNull();
  });

  it('blocks project.endDate flag when projectStatus does not match', () => {
    const flag = makeFlag({ projectStatuses: ['Planning'] });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', 'Closed Won', 'project.endDate');
    expect(result).toBeNull();
  });

  it('blocks dependency.dueDate flag when projectStatuses set and no status provided', () => {
    const flag = makeFlag({
      targetField: 'dependency.dueDate',
      projectStatuses: ['In Progress', 'Planning', 'On Hold'],
    });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'dependency.dueDate');
    expect(result).toBeNull();
  });

  it('allows dependency.dueDate flag when matching projectStatus is provided', () => {
    const flag = makeFlag({
      targetField: 'dependency.dueDate',
      projectStatuses: ['In Progress', 'Planning', 'On Hold'],
    });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', 'In Progress', 'dependency.dueDate');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Overdue');
  });

  it('blocks mapStep.dueDate flag when projectStatuses set and no status provided', () => {
    const flag = makeFlag({
      targetField: 'mapStep.dueDate',
      projectStatuses: ['In Progress', 'Planning'],
    });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', undefined, 'mapStep.dueDate');
    expect(result).toBeNull();
  });

  it('allows mapStep.dueDate flag when matching projectStatus is provided', () => {
    const flag = makeFlag({
      targetField: 'mapStep.dueDate',
      projectStatuses: ['In Progress', 'Planning'],
    });
    const result = getEndDateFlag(YESTERDAY_STR, [flag], 'America/New_York', 'Planning', 'mapStep.dueDate');
    expect(result).not.toBeNull();
  });
});
