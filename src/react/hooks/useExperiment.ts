import { useState, useEffect, useCallback } from 'react';
import { useABTestClient } from '@/react';
import { ExperimentConfig } from '@/types';

interface UseExperimentResult {
  variant: string | null;
  isReady: boolean;
}

export function useExperiment(experimentKey: string): UseExperimentResult {
  const client = useABTestClient();

  const getVariantSafe = useCallback(() => {
    try {
      return client.getVariant(experimentKey);
    } catch {
      return null;
    }
  }, [client, experimentKey]);

  const [variant, setVariant] = useState<string | null>(getVariantSafe);

  useEffect(() => {
    setVariant(getVariantSafe());

    const unsub = client.onConfigChange((config: ExperimentConfig) => {
      if (config.key === experimentKey) {
        setVariant(getVariantSafe());
      }
    });

    return unsub;
  }, [client, experimentKey, getVariantSafe]);

  return {
    variant,
    isReady: variant !== null,
  };
}