import { ExperimentConfig } from '../types';

export class VariantAssigner {
  assign(userId: string, experiment: ExperimentConfig): string {
    if (!experiment.enabled) {
      return experiment.variants[0]; // control
    }

    const hash = this.fnv1a(`${userId}:${experiment.key}`);
    const bucket = hash % 100;

    let cumulative = 0;
    for (let i = 0; i < experiment.split.length; i++) {
      cumulative += experiment.split[i];
      if (bucket < cumulative) {
        return experiment.variants[i];
      }
    }

    // Fallback — shouldn't happen if split sums to 100
    return experiment.variants[0];
  }

  /**
   * FNV-1a hash — fast, simple, good distribution.
   * Returns a positive 32-bit integer.
   */
  private fnv1a(input: string): number {
    let hash = 0x811c9dc5; // FNV offset basis

    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }

    // Force to unsigned 32-bit
    return hash >>> 0;
  }
}