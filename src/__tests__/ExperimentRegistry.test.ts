import { describe, it, expect } from 'vitest';
import { ExperimentRegistry } from '@/core/ExperimentRegistry';
import { ABTestError } from '@/core/errors';
import { ExperimentConfig } from '@/types';

function makeConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    key: 'exp-1',
    variants: ['control', 'variant'],
    split: [50, 50],
    enabled: true,
    ...overrides,
  };
}

describe('ExperimentRegistry', () => {
  it('registers and retrieves experiments', () => {
    const reg = new ExperimentRegistry([makeConfig()]);
    const config = reg.get('exp-1');
    expect(config.key).toBe('exp-1');
    expect(config.variants).toEqual(['control', 'variant']);
  });

  it('throws for unregistered experiment', () => {
    const reg = new ExperimentRegistry([]);
    expect(() => reg.get('nope')).toThrow(ABTestError);
    expect(() => reg.get('nope')).toThrow('not registered');
  });

  it('getAll returns all experiments', () => {
    const reg = new ExperimentRegistry([
      makeConfig({ key: 'a' }),
      makeConfig({ key: 'b' }),
    ]);
    expect(reg.getAll()).toHaveLength(2);
  });

  it('update replaces existing config', () => {
    const reg = new ExperimentRegistry([makeConfig()]);
    reg.update(makeConfig({ split: [70, 30] }));
    expect(reg.get('exp-1').split).toEqual([70, 30]);
  });

  // Validation
  it('throws when key is missing', () => {
    expect(() => new ExperimentRegistry([makeConfig({ key: '' })])).toThrow('key is required');
  });

  it('throws when variants is empty', () => {
    expect(() => new ExperimentRegistry([makeConfig({ variants: [], split: [] })])).toThrow(
      'at least one variant'
    );
  });

  it('throws when variants and split count mismatch', () => {
    expect(
      () => new ExperimentRegistry([makeConfig({ variants: ['a', 'b'], split: [100] })])
    ).toThrow("doesn't match split count");
  });

  it('throws when split does not sum to 100', () => {
    expect(
      () => new ExperimentRegistry([makeConfig({ split: [40, 40] })])
    ).toThrow('sums to 80, expected 100');
  });

  // Assignment caching
  it('setAssignment / getAssignment', () => {
    const reg = new ExperimentRegistry([makeConfig()]);
    expect(reg.getAssignment('exp-1')).toBeUndefined();
    reg.setAssignment('exp-1', 'variant');
    expect(reg.getAssignment('exp-1')).toBe('variant');
  });

  it('getAllAssignments returns record', () => {
    const reg = new ExperimentRegistry([makeConfig()]);
    reg.setAssignment('exp-1', 'control');
    expect(reg.getAllAssignments()).toEqual({ 'exp-1': 'control' });
  });

  it('restoreAssignments loads from saved data', () => {
    const reg = new ExperimentRegistry([makeConfig()]);
    reg.restoreAssignments({ 'exp-1': 'variant' });
    expect(reg.getAssignment('exp-1')).toBe('variant');
  });

  it('clearAssignments removes all', () => {
    const reg = new ExperimentRegistry([makeConfig()]);
    reg.setAssignment('exp-1', 'control');
    reg.clearAssignments();
    expect(reg.getAssignment('exp-1')).toBeUndefined();
  });
});
