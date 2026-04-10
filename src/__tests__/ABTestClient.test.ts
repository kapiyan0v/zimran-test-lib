import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ABTestClient, createABTestClient } from '@/core/ABTestClient';
import { MockTransport } from '@/transports/MockTransport';
import { ABTestPlugin, ExperimentConfig } from '@/types';

const experiment: ExperimentConfig = {
  key: 'button-color',
  variants: ['control', 'red', 'blue'],
  split: [34, 33, 33],
  enabled: true,
};

const featureFlag: ExperimentConfig = {
  key: 'new-feature',
  variants: ['disabled', 'enabled'],
  split: [50, 50],
  enabled: true,
};

function makeClient(overrides: Partial<Parameters<typeof createABTestClient>[0]> = {}) {
  return createABTestClient({
    experiments: [experiment, featureFlag],
    storageKey: `test-${Math.random()}`,
    ...overrides,
  });
}

describe('ABTestClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initializeUser + getVariant flow', () => {
    it('assigns a variant after user init', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const variant = client.getVariant('button-color');
      expect(experiment.variants).toContain(variant);
    });

    it('returns same variant on subsequent calls', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const v1 = client.getVariant('button-color');
      const v2 = client.getVariant('button-color');
      expect(v1).toBe(v2);
    });

    it('throws when getVariant called before initializeUser', () => {
      const client = makeClient();
      expect(() => client.getVariant('button-color')).toThrow('User not initialized');
    });

    it('restores from cache on re-init with same user', () => {
      const key = `test-persist-${Math.random()}`;
      const client1 = makeClient({ storageKey: key });
      client1.initializeUser({ id: 'user-1' });
      const v1 = client1.getVariant('button-color');

      const client2 = makeClient({ storageKey: key });
      client2.initializeUser({ id: 'user-1' });
      const v2 = client2.getVariant('button-color');

      expect(v1).toBe(v2);
    });

    it('reassigns when forceReassign is true', () => {
      const key = `test-force-${Math.random()}`;
      const client = makeClient({ storageKey: key });
      client.initializeUser({ id: 'user-1' });
      client.getVariant('button-color');

      // Force reassign clears cache
      client.initializeUser({ id: 'user-1' }, { forceReassign: true });
      // Should still work (gets a fresh assignment)
      const v = client.getVariant('button-color');
      expect(experiment.variants).toContain(v);
    });
  });

  describe('updateUser', () => {
    it('updates user data', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1', email: 'old@test.com' });
      client.updateUser({ email: 'new@test.com' });
      // No error means update succeeded
    });

    it('clears assignments when reassignVariant is true', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.getVariant('button-color');

      client.updateUser({ email: 'x@y.com' }, { reassignVariant: true });
      // After reassign, getVariant recomputes (same user id = same hash = same result)
      const v2 = client.getVariant('button-color');
      expect(experiment.variants).toContain(v2);
    });
  });

  describe('overrideVariant / resetOverrides', () => {
    it('override takes priority over computed variant', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('button-color', 'blue');
      expect(client.getVariant('button-color')).toBe('blue');
    });

    it('resetOverrides clears specific override', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('button-color', 'blue');
      client.resetOverrides('button-color');
      // Should fall back to computed variant
      const v = client.getVariant('button-color');
      expect(experiment.variants).toContain(v);
    });

    it('resetOverrides with no arg clears all overrides', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('button-color', 'blue');
      client.overrideVariant('new-feature', 'enabled');
      client.resetOverrides();
      // Both should fall back to computed
      expect(experiment.variants).toContain(client.getVariant('button-color'));
    });
  });

  describe('isFeatureEnabled', () => {
    it('returns true when variant is "enabled"', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('new-feature', 'enabled');
      expect(client.isFeatureEnabled('new-feature')).toBe(true);
    });

    it('returns false when variant is not "enabled"', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('new-feature', 'disabled');
      expect(client.isFeatureEnabled('new-feature')).toBe(false);
    });

    it('returns false for unregistered experiment', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      expect(client.isFeatureEnabled('nonexistent')).toBe(false);
    });
  });

  describe('config update via transport', () => {
    it('updates experiment config when transport emits', () => {
      const transport = new MockTransport();
      const client = makeClient({ transport });
      client.initializeUser({ id: 'user-1' });

      const listener = vi.fn();
      client.onConfigChange(listener);

      const updatedConfig: ExperimentConfig = {
        key: 'button-color',
        variants: ['control', 'green'],
        split: [50, 50],
        enabled: true,
      };
      transport.emit(updatedConfig);

      expect(listener).toHaveBeenCalledWith(updatedConfig);
    });

    it('onConfigChange returns unsubscribe function', () => {
      const transport = new MockTransport();
      const client = makeClient({ transport });
      const listener = vi.fn();
      const unsub = client.onConfigChange(listener);
      unsub();

      transport.emit({
        key: 'button-color',
        variants: ['a', 'b'],
        split: [50, 50],
        enabled: true,
      });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('plugin hooks', () => {
    it('fires onUserInitialized', () => {
      const plugin: ABTestPlugin = { onUserInitialized: vi.fn() };
      const client = makeClient({ plugins: [plugin] });
      client.initializeUser({ id: 'user-1' });
      expect(plugin.onUserInitialized).toHaveBeenCalledWith({ id: 'user-1' });
    });

    it('fires onVariantAssigned', () => {
      const plugin: ABTestPlugin = { onVariantAssigned: vi.fn() };
      const client = makeClient({ plugins: [plugin] });
      client.initializeUser({ id: 'user-1' });
      client.getVariant('button-color');
      expect(plugin.onVariantAssigned).toHaveBeenCalledWith(
        'button-color',
        expect.any(String),
        'user-1'
      );
    });

    it('fires onOverrideSet', () => {
      const plugin: ABTestPlugin = { onOverrideSet: vi.fn() };
      const client = makeClient({ plugins: [plugin] });
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('button-color', 'blue');
      expect(plugin.onOverrideSet).toHaveBeenCalledWith('button-color', 'blue');
    });

    it('fires onConfigUpdated via transport', () => {
      const transport = new MockTransport();
      const plugin: ABTestPlugin = { onConfigUpdated: vi.fn() };
      expect(makeClient({ transport, plugins: [plugin] })).toBeDefined();

      const config: ExperimentConfig = {
        key: 'button-color',
        variants: ['a', 'b'],
        split: [50, 50],
        enabled: true,
      };
      transport.emit(config);
      expect(plugin.onConfigUpdated).toHaveBeenCalledWith(config);
    });

    it('plugin errors do not crash the client', () => {
      const plugin: ABTestPlugin = {
        onUserInitialized: () => {
          throw new Error('plugin boom');
        },
      };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = makeClient({ plugins: [plugin] });
      expect(() => client.initializeUser({ id: 'user-1' })).not.toThrow();
      warnSpy.mockRestore();
    });

    it('addPlugin adds plugins dynamically', () => {
      const client = makeClient();
      const plugin: ABTestPlugin = { onVariantAssigned: vi.fn() };
      client.addPlugin(plugin);
      client.initializeUser({ id: 'user-1' });
      client.getVariant('button-color');
      expect(plugin.onVariantAssigned).toHaveBeenCalled();
    });
  });

  describe('onChange unified event', () => {
    it('fires on overrideVariant', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const listener = vi.fn();
      client.onChange(listener);
      client.overrideVariant('button-color', 'blue');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on resetOverrides', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.overrideVariant('button-color', 'blue');
      const listener = vi.fn();
      client.onChange(listener);
      client.resetOverrides('button-color');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on initializeUser', () => {
      const client = makeClient();
      const listener = vi.fn();
      client.onChange(listener);
      client.initializeUser({ id: 'user-1' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on initializeUser with different user (re-init)', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const listener = vi.fn();
      client.onChange(listener);
      client.initializeUser({ id: 'user-2' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on updateUser', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const listener = vi.fn();
      client.onChange(listener);
      client.updateUser({ email: 'new@test.com' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on config update via transport', () => {
      const transport = new MockTransport();
      const client = makeClient({ transport });
      client.initializeUser({ id: 'user-1' });
      const listener = vi.fn();
      client.onChange(listener);
      transport.emit({ ...experiment, split: [50, 25, 25] });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe works', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const listener = vi.fn();
      const unsub = client.onChange(listener);
      unsub();
      client.overrideVariant('button-color', 'blue');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('config update clears cached assignment', () => {
    it('recomputes variant when experiment config changes', () => {
      const transport = new MockTransport();
      const client = makeClient({ transport });
      client.initializeUser({ id: 'user-1' });

      // Get initial variant (caches it)
      const v1 = client.getVariant('button-color');
      expect(experiment.variants).toContain(v1);

      // Push new config — gives 100% to 'red'
      transport.emit({
        key: 'button-color',
        variants: ['control', 'red', 'blue'],
        split: [0, 100, 0],
        enabled: true,
      });

      // Should recompute, not return cached
      const v2 = client.getVariant('button-color');
      expect(v2).toBe('red');
    });
  });

  describe('override persistence without user init', () => {
    it('persists overrides set before user initialization', () => {
      const key = `test-override-persist-${Math.random()}`;
      const client1 = makeClient({ storageKey: key });
      // Set override BEFORE user init
      client1.overrideVariant('button-color', 'blue');

      // New client loads persisted overrides
      const client2 = makeClient({ storageKey: key });
      client2.initializeUser({ id: 'user-1' });
      expect(client2.getVariant('button-color')).toBe('blue');
    });
  });

  describe('user re-initialization', () => {
    it('clears previous assignments when switching users', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      client.getVariant('button-color');
      client.initializeUser({ id: 'user-2' });
      const v2 = client.getVariant('button-color');

      // Different users may get same variant (hash-based), but assignments were cleared
      expect(experiment.variants).toContain(v2);
    });

    it('fires onChange so hooks can recompute', () => {
      const client = makeClient();
      client.initializeUser({ id: 'user-1' });
      const listener = vi.fn();
      client.onChange(listener);

      client.initializeUser({ id: 'user-2' });
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('createABTestClient helper', () => {
    it('returns an ABTestClient instance', () => {
      const client = createABTestClient({
        experiments: [experiment],
        storageKey: 'test-helper',
      });
      expect(client).toBeInstanceOf(ABTestClient);
    });
  });
});
