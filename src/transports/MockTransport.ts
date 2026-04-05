import { ConfigTransport, ExperimentConfig } from '../types';

export class MockTransport implements ConfigTransport {
  private callback: ((config: ExperimentConfig) => void) | null = null;

  subscribe(callback: (config: ExperimentConfig) => void): void {
    this.callback = callback;
  }

  unsubscribe(): void {
    this.callback = null;
  }

  emit(config: ExperimentConfig): void {
    if (!this.callback) {
      console.warn('[ABTest] MockTransport: no subscriber, emit ignored.');
      return;
    }
    this.callback(config);
  }
}