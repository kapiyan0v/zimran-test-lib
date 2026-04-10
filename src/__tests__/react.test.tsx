import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ABTestProvider, useABTestClient } from '@/react';
import { useExperiment } from '@/react/hooks/useExperiment';
import { useFeatureFlag } from '@/react/hooks/useFeatureFlag';
import { createABTestClient } from '@/core/ABTestClient';
import { MockTransport } from '@/transports/MockTransport';
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

  describe('useExperiment reacts to overrides', () => {
    it('updates variant when override is set', () => {
      const wrapper = createInitializedWrapper();

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          client.initializeUser({ id: 'user-1' });
          return { client, experiment: useExperiment('button-color') };
        },
        { wrapper }
      );

      expect(result.current.experiment.isReady).toBe(true);
      const originalVariant = result.current.experiment.variant;

      act(() => {
        result.current.client.overrideVariant('button-color', 'variant_a');
      });

      expect(result.current.experiment.variant).toBe('variant_a');
      // Sanity: if original wasn't variant_a, we know it changed
      if (originalVariant !== 'variant_a') {
        expect(result.current.experiment.variant).not.toBe(originalVariant);
      }
    });

    it('reverts variant when override is cleared', () => {
      const wrapper = createInitializedWrapper();

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          client.initializeUser({ id: 'user-1' });
          return { client, experiment: useExperiment('button-color') };
        },
        { wrapper }
      );

      const originalVariant = result.current.experiment.variant;

      act(() => {
        result.current.client.overrideVariant('button-color', 'variant_a');
      });
      expect(result.current.experiment.variant).toBe('variant_a');

      act(() => {
        result.current.client.resetOverrides('button-color');
      });
      expect(result.current.experiment.variant).toBe(originalVariant);
    });
  });

  describe('useExperiment reacts to user re-initialization', () => {
    it('updates variant when user changes', () => {
      const wrapper = createInitializedWrapper();

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          client.initializeUser({ id: 'user-1' });
          return { client, experiment: useExperiment('button-color') };
        },
        { wrapper }
      );

      expect(result.current.experiment.isReady).toBe(true);

      act(() => {
        result.current.client.initializeUser({ id: 'user-999' });
      });

      // After re-init, hook should still return a valid variant
      expect(result.current.experiment.isReady).toBe(true);
      expect(experiment.variants).toContain(result.current.experiment.variant);
    });
  });

  describe('useExperiment reacts to config updates via transport', () => {
    it('recomputes variant when config changes', () => {
      const transport = new MockTransport();
      const key = `test-${Math.random()}`;

      function TransportWrapper({ children }: { children: React.ReactNode }) {
        return (
          <ABTestProvider
            experiments={[experiment, featureFlag]}
            storageKey={key}
            transport={transport}
          >
            {children}
          </ABTestProvider>
        );
      }

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          client.initializeUser({ id: 'user-1' });
          return useExperiment('button-color');
        },
        { wrapper: TransportWrapper }
      );

      expect(result.current.isReady).toBe(true);

      // Push config that gives 100% to variant_a
      act(() => {
        transport.emit({
          key: 'button-color',
          variants: ['control', 'variant_a'],
          split: [0, 100],
          enabled: true,
        });
      });

      expect(result.current.variant).toBe('variant_a');
    });
  });

  describe('useFeatureFlag reacts to overrides', () => {
    it('updates when override changes the flag', () => {
      const wrapper = createInitializedWrapper();
      let clientRef: ReturnType<typeof useABTestClient> | null = null;

      const { result } = renderHook(
        () => {
          const client = useABTestClient();
          if (!clientRef) {
            client.initializeUser({ id: 'user-1' });
            clientRef = client;
          }
          return useFeatureFlag('dark-mode');
        },
        { wrapper }
      );

      act(() => {
        clientRef!.overrideVariant('dark-mode', 'enabled');
      });
      expect(result.current).toBe(true);

      act(() => {
        clientRef!.overrideVariant('dark-mode', 'disabled');
      });
      expect(result.current).toBe(false);
    });
  });
});
