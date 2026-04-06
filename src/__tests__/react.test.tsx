import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { ABTestProvider, useABTestClient } from '@/react';
import { useExperiment } from '@/react/hooks/useExperiment';
import { useFeatureFlag } from '@/react/hooks/useFeatureFlag';
import { createABTestClient } from '@/core/ABTestClient';
import { ExperimentConfig } from '@/types';

const experiment: ExperimentConfig = {
  key: 'button-color',
  variants: ['control', 'variant_a'],
  split: [50, 50],
  enabled: true,
};

const featureFlag: ExperimentConfig = {
  key: 'dark-mode',
  variants: ['disabled', 'enabled'],
  split: [50, 50],
  enabled: true,
};

function createWrapper(storageKey?: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ABTestProvider
        experiments={[experiment, featureFlag]}
        storageKey={storageKey ?? `test-${Math.random()}`}
      >
        {children}
      </ABTestProvider>
    );
  };
}

/**
 * Creates a wrapper where the user is already initialized,
 * so hooks can call getVariant immediately on first render.
 */
function createInitializedWrapper(opts?: { overrides?: Record<string, string> }) {
  const key = `test-${Math.random()}`;
  // Pre-init: create a client, init user, set overrides, which persists to localStorage
  const setupClient = createABTestClient({
    experiments: [experiment, featureFlag],
    storageKey: key,
  });
  setupClient.initializeUser({ id: 'user-1' });
  if (opts?.overrides) {
    for (const [k, v] of Object.entries(opts.overrides)) {
      setupClient.overrideVariant(k, v);
    }
  }

  // The wrapper will create a new client that loads from the same localStorage key
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ABTestProvider
        experiments={[experiment, featureFlag]}
        storageKey={key}
      >
        {children}
      </ABTestProvider>
    );
  };
}

describe('React hooks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('useABTestClient', () => {
    it('returns client within provider', () => {
      const { result } = renderHook(() => useABTestClient(), {
        wrapper: createWrapper(),
      });
      expect(result.current).toBeDefined();
      expect(typeof result.current.initializeUser).toBe('function');
    });

    it('throws outside provider', () => {
      expect(() => {
        renderHook(() => useABTestClient());
      }).toThrow('useABTestClient must be used within <ABTestProvider>');
    });
  });

  describe('useExperiment', () => {
    it('returns variant after user init', () => {
      const wrapper = createInitializedWrapper();

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          // Init user so getVariant works
          client.initializeUser({ id: 'user-1' });
          return useExperiment('button-color');
        },
        { wrapper }
      );

      expect(result.current.isReady).toBe(true);
      expect(experiment.variants).toContain(result.current.variant);
    });

    it('returns null variant when user not initialized', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useExperiment('button-color'), { wrapper });
      expect(result.current.variant).toBeNull();
      expect(result.current.isReady).toBe(false);
    });
  });

  describe('useFeatureFlag', () => {
    it('returns true when feature is enabled', () => {
      const wrapper = createInitializedWrapper({ overrides: { 'dark-mode': 'enabled' } });

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          client.initializeUser({ id: 'user-1' });
          return useFeatureFlag('dark-mode');
        },
        { wrapper }
      );

      expect(result.current).toBe(true);
    });

    it('returns false when variant is not enabled', () => {
      const wrapper = createInitializedWrapper({ overrides: { 'dark-mode': 'disabled' } });

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          client.initializeUser({ id: 'user-1' });
          return useFeatureFlag('dark-mode');
        },
        { wrapper }
      );

      expect(result.current).toBe(false);
    });
  });
});
