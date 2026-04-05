import { ConfigTransport, ExperimentConfig } from '../types';

interface WebSocketTransportOptions {
  url: string;
  reconnectInterval?: number;
}

export class WebSocketTransport implements ConfigTransport {
  private ws: WebSocket | null = null;
  private callback: ((config: ExperimentConfig) => void) | null = null;
  private url: string;
  private reconnectInterval: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WebSocketTransportOptions) {
    this.url = options.url;
    this.reconnectInterval = options.reconnectInterval ?? 5000;
  }

  subscribe(callback: (config: ExperimentConfig) => void): void {
    this.callback = callback;
    this.connect();
  }

  unsubscribe(): void {
    this.callback = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onmessage = (event) => {
        try {
          const config = JSON.parse(event.data) as ExperimentConfig;
          this.callback?.(config);
        } catch {
          console.warn('[ABTest] WebSocket: failed to parse message.');
        }
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        console.warn('[ABTest] WebSocket connection error.');
        this.ws?.close();
      };
    } catch {
      console.warn('[ABTest] WebSocket: failed to connect.');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.callback) return;
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectInterval);
  }
}