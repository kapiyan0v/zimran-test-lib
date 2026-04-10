import { useABTestClient } from '@/react';
import { useState, useEffect, useCallback } from 'react';

export function useFeatureFlag(flagKey: string): boolean {
  const client = useABTestClient();

  const check = useCallback(() => {
    return client.isFeatureEnabled(flagKey);
  }, [client, flagKey]);

  const [enabled, setEnabled] = useState<boolean>(check);

  useEffect(() => {
    setEnabled(check());

    const unsub = client.onChange(() => {
      setEnabled(check());
    });

    return unsub;
  }, [client, flagKey, check]);

  return enabled;
}