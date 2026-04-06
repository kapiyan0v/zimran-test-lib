import { describe, it, expect } from 'vitest';
import { VariantAssigner } from '@/core/VariantAssigner';
import { ExperimentConfig } from '@/types';

const assigner = new VariantAssigner();

function makeExperiment(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    key: 'test-exp',
    variants: ['control', 'variant_a'],
    split: [50, 50],
    enabled: true,
    ...overrides,
  };
}

describe('VariantAssigner', () => {
  it('returns deterministic output for same userId + experimentKey', () => {
    const exp = makeExperiment();
    const v1 = assigner.assign('user-123', exp);
    const v2 = assigner.assign('user-123', exp);
    expect(v1).toBe(v2);
  });

  it('returns different variants for different users (statistical)', () => {
    const exp = makeExperiment();
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(assigner.assign(`user-${i}`, exp));
    }
    // With 100 users and 50/50 split, both variants should appear
    expect(results.size).toBe(2);
  });

  it('respects split percentages approximately', () => {
    const exp = makeExperiment({ split: [80, 20] });
    let controlCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (assigner.assign(`user-${i}`, exp) === 'control') controlCount++;
    }
    // Allow ±10% tolerance
    expect(controlCount / total).toBeGreaterThan(0.65);
    expect(controlCount / total).toBeLessThan(0.95);
  });

  it('returns control (first variant) when experiment is disabled', () => {
    const exp = makeExperiment({ enabled: false });
    const result = assigner.assign('any-user', exp);
    expect(result).toBe('control');
  });

  it('handles single variant', () => {
    const exp = makeExperiment({
      variants: ['only-one'],
      split: [100],
    });
    const result = assigner.assign('user-123', exp);
    expect(result).toBe('only-one');
  });

  it('handles three-way split', () => {
    const exp = makeExperiment({
      variants: ['a', 'b', 'c'],
      split: [33, 34, 33],
    });
    const results = new Set<string>();
    for (let i = 0; i < 300; i++) {
      results.add(assigner.assign(`user-${i}`, exp));
    }
    expect(results.size).toBe(3);
  });

  it('produces different results for different experiment keys', () => {
    const exp1 = makeExperiment({ key: 'exp-1' });
    const exp2 = makeExperiment({ key: 'exp-2' });
    // At least some users should get different variants across experiments
    let diffCount = 0;
    for (let i = 0; i < 50; i++) {
      const v1 = assigner.assign(`user-${i}`, exp1);
      const v2 = assigner.assign(`user-${i}`, exp2);
      if (v1 !== v2) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });
});
