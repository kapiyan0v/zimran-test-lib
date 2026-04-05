import { createContext, useContext, useRef, ReactNode } from 'react';
import { ABTestClient, createABTestClient } from '@/core';
import { ABTestClientOptions } from '@/types';

const ABTestContext = createContext<ABTestClient | null>(null);

interface ProviderProps extends ABTestClientOptions {
  children: ReactNode;
}

export function ABTestProvider({ children, ...options }: ProviderProps) {
  const clientRef = useRef<ABTestClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = createABTestClient(options);
  }

  return (
    <ABTestContext.Provider value={clientRef.current}>
      {children}
    </ABTestContext.Provider>
  );
}

export function useABTestClient(): ABTestClient {
  const client = useContext(ABTestContext);
  if (!client) {
    throw new Error('useABTestClient must be used within <ABTestProvider>.');
  }
  return client;
}