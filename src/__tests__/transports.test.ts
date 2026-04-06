import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockTransport } from '@/transports/MockTransport';
import { ExperimentConfig } from '@/types';

const sampleConfig: ExperimentConfig = {
  key: 'test',
  variants: ['a', 'b'],
  split: [50, 50],
  enabled: true,
};

describe('MockTransport', () => {
  it('emit triggers subscriber callback', () => {
    const transport = new MockTransport();
    const callback = vi.fn();
    transport.subscribe(callback);
    transport.emit(sampleConfig);
    expect(callback).toHaveBeenCalledWith(sampleConfig);
  });

  it('emit is no-op when no subscriber', () => {
    const transport = new MockTransport();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => transport.emit(sampleConfig)).not.toThrow();
    warnSpy.mockRestore();
  });

  it('unsubscribe removes callback', () => {
    const transport = new MockTransport();
    const callback = vi.fn();
    transport.subscribe(callback);
    transport.unsubscribe();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    transport.emit(sampleConfig);
    expect(callback).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('supports replacing subscriber', () => {
    const transport = new MockTransport();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    transport.subscribe(cb1);
    transport.subscribe(cb2);
    transport.emit(sampleConfig);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(sampleConfig);
  });
});

describe('WebSocketTransport', () => {
  let mockWs: {
    onmessage: ((event: { data: string }) => void) | null;
    onclose: (() => void) | null;
    onerror: (() => void) | null;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockWs = {
      onmessage: null,
      onclose: null,
      onerror: null,
      close: vi.fn(),
    };
    vi.stubGlobal('WebSocket', vi.fn(() => mockWs));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects on subscribe and forwards messages', async () => {
    const { WebSocketTransport } = await import('@/transports/WebSocketTransport');
    const transport = new WebSocketTransport({ url: 'ws://localhost' });
    const callback = vi.fn();
    transport.subscribe(callback);

    mockWs.onmessage?.({ data: JSON.stringify(sampleConfig) });
    expect(callback).toHaveBeenCalledWith(sampleConfig);
  });

  it('unsubscribe closes connection', async () => {
    const { WebSocketTransport } = await import('@/transports/WebSocketTransport');
    const transport = new WebSocketTransport({ url: 'ws://localhost' });
    transport.subscribe(vi.fn());
    transport.unsubscribe();
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('handles parse errors gracefully', async () => {
    const { WebSocketTransport } = await import('@/transports/WebSocketTransport');
    const transport = new WebSocketTransport({ url: 'ws://localhost' });
    const callback = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    transport.subscribe(callback);

    mockWs.onmessage?.({ data: 'not-json' });
    expect(callback).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('LongPollingTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches immediately on subscribe', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { LongPollingTransport } = await import('@/transports/LongPolTransport');
    const transport = new LongPollingTransport({ url: 'http://localhost/config', intervalMs: 60000 });
    const callback = vi.fn();
    transport.subscribe(callback);

    // Flush the immediate poll() promise
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/config');
    expect(callback).toHaveBeenCalledWith(sampleConfig);

    transport.unsubscribe();
    vi.unstubAllGlobals();
  });

  it('unsubscribe stops polling', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { LongPollingTransport } = await import('@/transports/LongPolTransport');
    const transport = new LongPollingTransport({
      url: 'http://localhost/config',
      intervalMs: 5000,
    });
    transport.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    fetchMock.mockClear();
    transport.unsubscribe();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('handles fetch errors gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { LongPollingTransport } = await import('@/transports/LongPolTransport');
    const transport = new LongPollingTransport({ url: 'http://localhost/config', intervalMs: 60000 });
    const callback = vi.fn();
    transport.subscribe(callback);

    await vi.advanceTimersByTimeAsync(0);
    expect(callback).not.toHaveBeenCalled();

    transport.unsubscribe();
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
