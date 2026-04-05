import { PersistedState } from '../types';

export class PersistenceManager {
  private storageKey: string;
  private listeners: Array<(state: PersistedState) => void> = [];

  constructor(storageKey: string = 'ab_test_lib') {
    this.storageKey = storageKey;
    this.listenForCrossTabChanges();
  }

  save(state: PersistedState): void {
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      console.warn('[ABTest] Failed to save:', error);
    }
  }

  load(): PersistedState | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (!this.isValidState(parsed)) {
        console.warn('[ABTest] Corrupted localStorage data, clearing.');
        this.clear();
        return null;
      }

      return parsed;
    } catch (error) {
      console.warn('[ABTest] Failed to parse, clearing:', error);
      this.clear();
      return null
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('[ABTest] Failed to clear localStorage:', error);
    }
  }

  onExternalChange(callback: (state: PersistedState) => void): () => void {
    this.listeners.push(callback);

    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private listenForCrossTabChanges(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== this.storageKey) return;

      if (!event.newValue) return;

      try {
        const parsed = JSON.parse(event.newValue);
        if (this.isValidState(parsed)) {
          this.listeners.forEach((cb) => cb(parsed));
        }
      } catch {
      }
    });
  }

  private isValidState(data: unknown): data is PersistedState {
    if (typeof data !== 'object' || data === null) return false;

    const obj = data as Record<string, unknown>;

    if (typeof obj.user !== 'object' || obj.user === null) return false;
    if (typeof (obj.user as Record<string, unknown>).id !== 'string') return false;

    if (typeof obj.assignments !== 'object' || obj.assignments === null) return false;
    if (typeof obj.overrides !== 'object' || obj.overrides === null) return false;

    return true;
  }
}