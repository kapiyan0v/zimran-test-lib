import { ConfigTransport, ExperimentConfig } from '../types';

interface LongPollingOptions {
  url: string;
  intervalMs?: number;
}

export class LongPollingTransport implements ConfigTransport {
  private callback: ((config: ExperimentConfig) => void) | null = null;
  private url: string;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LongPollingOptions) {
    this.url = options.url;
    this.intervalMs = options.intervalMs ?? 30_000;
  }

  subscribe(callback: (config: ExperimentConfig) => void): void {
    this.callback = callback;
    this.startPolling();
  }

  unsubscribe(): void {
    this.callback = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startPolling(): void {
    this.poll(); // first fetch immediately
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch(this.url);
      if (!res.ok) return;

      const config = (await res.json()) as ExperimentConfig;
      this.callback?.(config);
    } catch {
      console.warn('[ABTest] LongPolling: fetch failed, will retry.');
    }
  }
}