import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceManager } from '@/core/PersistenceManager';
import { PersistedState } from '@/types';

const validState: PersistedState = {
  user: { id: 'u1' },
  assignments: { 'exp-1': 'control' },
  overrides: {},
};

describe('PersistenceManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save and load roundtrip', () => {
    const pm = new PersistenceManager('test-key');
    pm.save(validState);
    const loaded = pm.load();
    expect(loaded).toEqual(validState);
  });

  it('load returns null when nothing saved', () => {
    const pm = new PersistenceManager('test-key');
    expect(pm.load()).toBeNull();
  });

  it('clear removes data', () => {
    const pm = new PersistenceManager('test-key');
    pm.save(validState);
    pm.clear();
    expect(pm.load()).toBeNull();
  });

  it('handles corrupted JSON gracefully', () => {
    localStorage.setItem('test-key', 'not-json{{{');
    const pm = new PersistenceManager('test-key');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pm.load()).toBeNull();
    warnSpy.mockRestore();
  });

  it('handles invalid state structure gracefully', () => {
    localStorage.setItem('test-key', JSON.stringify({ foo: 'bar' }));
    const pm = new PersistenceManager('test-key');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pm.load()).toBeNull();
    warnSpy.mockRestore();
  });

  it('handles state with missing user.id', () => {
    localStorage.setItem(
      'test-key',
      JSON.stringify({ user: {}, assignments: {}, overrides: {} })
    );
    const pm = new PersistenceManager('test-key');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pm.load()).toBeNull();
    warnSpy.mockRestore();
  });

  it('uses default storage key', () => {
    const pm = new PersistenceManager();
    pm.save(validState);
    expect(localStorage.getItem('ab_test_lib')).toBeTruthy();
  });

  it('onExternalChange fires on storage events', () => {
    const pm = new PersistenceManager('test-key');
    const callback = vi.fn();
    pm.onExternalChange(callback);

    // Simulate cross-tab storage event
    const event = new StorageEvent('storage', {
      key: 'test-key',
      newValue: JSON.stringify(validState),
    });
    window.dispatchEvent(event);

    expect(callback).toHaveBeenCalledWith(validState);
  });

  it('onExternalChange ignores events for other keys', () => {
    const pm = new PersistenceManager('test-key');
    const callback = vi.fn();
    pm.onExternalChange(callback);

    const event = new StorageEvent('storage', {
      key: 'other-key',
      newValue: JSON.stringify(validState),
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it('onExternalChange unsubscribe works', () => {
    const pm = new PersistenceManager('test-key');
    const callback = vi.fn();
    const unsub = pm.onExternalChange(callback);
    unsub();

    const event = new StorageEvent('storage', {
      key: 'test-key',
      newValue: JSON.stringify(validState),
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it('onExternalChange ignores events with no newValue', () => {
    const pm = new PersistenceManager('test-key');
    const callback = vi.fn();
    pm.onExternalChange(callback);

    const event = new StorageEvent('storage', {
      key: 'test-key',
      newValue: null,
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });
});
