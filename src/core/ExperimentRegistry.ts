import { ExperimentConfig } from '@/types';
import { ABTestError } from './errors';

export class ExperimentRegistry {
  private experiments = new Map<string, ExperimentConfig>();
  private assignments = new Map<string, string>();

  constructor(configs: ExperimentConfig[]) {
    configs.forEach((config) => this.register(config));
  }

  register(config: ExperimentConfig): void {
    this.validateConfig(config);
    this.experiments.set(config.key, { ...config });
  }

  get(key: string): ExperimentConfig {
    const config = this.experiments.get(key);
    if (!config) {
      throw new ABTestError(`Experiment "${key}" is not registered.`);
    }
    return config;
  }

  getAll(): ExperimentConfig[] {
    return Array.from(this.experiments.values());
  }

  update(config: ExperimentConfig): void {
    this.validateConfig(config);
    this.experiments.set(config.key, { ...config });
  }

  getAssignment(key: string): string | undefined {
    return this.assignments.get(key);
  }

  setAssignment(key: string, variant: string): void {
    this.assignments.set(key, variant);
  }

  getAllAssignments(): Record<string, string> {
    return Object.fromEntries(this.assignments);
  }

  restoreAssignments(saved: Record<string, string>): void {
    Object.entries(saved).forEach(([key, variant]) => {
      this.assignments.set(key, variant);
    });
  }

  clearAssignment(key: string): void {
    this.assignments.delete(key);
  }

  clearAssignments(): void {
    this.assignments.clear();
  }

  private validateConfig(config: ExperimentConfig): void {
    if (!config.key) {
      throw new ABTestError('Experiment key is required.');
    }

    if (!config.variants.length) {
      throw new ABTestError(`Experiment "${config.key}": at least one variant required.`);
    }

    if (config.variants.length !== config.split.length) {
      throw new ABTestError(
        `Experiment "${config.key}": variants count (${config.variants.length}) doesn't match split count (${config.split.length}).`
      );
    }

    const total = config.split.reduce((sum, n) => sum + n, 0);
    if (total !== 100) {
      throw new ABTestError(
        `Experiment "${config.key}": split sums to ${total}, expected 100.`
      );
    }
  }
}