export interface UserData {
  id: string;
  email?: string;
  [key: string]: unknown;
}

export interface ExperimentConfig {
  key: string;
  variants: string[];
  split: number[];
  enabled: boolean;
}

export interface ABTestClientOptions {
  experiments: ExperimentConfig[];
  transport?: ConfigTransport;
  plugins?: ABTestPlugin[];
  storageKey?: string;
}

export interface InitUserOptions {
  forceReassign?: boolean;
}

export interface UpdateUserOptions {
  reassignVariant?: boolean;
}

export interface PersistedState {
  user: UserData;
  assignments: Record<string, string>;
  overrides: Record<string, string>;
}

export interface ConfigTransport {
  subscribe(callback: (config: ExperimentConfig) => void): void;
  unsubscribe(): void;
}

export interface ABTestPlugin {
  onUserInitialized?(user: UserData): void;
  onVariantAssigned?(experimentKey: string, variant: string, userId: string): void;
  onConfigUpdated?(config: ExperimentConfig): void;
  onError?(error: Error): void;
  onOverrideSet?(experimentKey: string, variant: string): void;
}