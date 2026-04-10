import { UserData, ABTestClientOptions, InitUserOptions, UpdateUserOptions, ExperimentConfig, ABTestPlugin, PersistedState } from '@/types';
import { UserManager } from './UserManagement';
import { ExperimentRegistry } from './ExperimentRegistry';
import { VariantAssigner } from './VariantAssigner';
import { PersistenceManager } from './PersistenceManager';

type ConfigChangeCallback = (config: ExperimentConfig) => void;
type ChangeCallback = () => void;

export class ABTestClient {
  private userManager: UserManager;
  private registry: ExperimentRegistry;
  private assigner: VariantAssigner;
  private persistence: PersistenceManager;
  private plugins: ABTestPlugin[];
  private overrides = new Map<string, string>();
  private configListeners: ConfigChangeCallback[] = [];
  private changeListeners: ChangeCallback[] = [];

  private overrideStorageKey: string;

  constructor(options: ABTestClientOptions) {
    this.userManager = new UserManager();
    this.registry = new ExperimentRegistry(options.experiments);
    this.assigner = new VariantAssigner();
    this.persistence = new PersistenceManager(options.storageKey);
    this.plugins = options.plugins ?? [];
    this.overrideStorageKey = `${options.storageKey ?? 'ab_test_lib'}_overrides`;

    if (options.transport) {
      options.transport.subscribe((config) => this.handleConfigUpdate(config));
    }

    this.persistence.onExternalChange((state) => this.handleCrossTabSync(state));
    this.loadPersistedOverrides();
  }

  initializeUser(userData: UserData, options?: InitUserOptions): void {
    const cached = this.persistence.load();


    if (cached && cached.user.id === userData.id && !options?.forceReassign) {
      this.userManager.setUser(cached.user);
      this.registry.restoreAssignments(cached.assignments);
      this.restoreOverrides(cached.overrides);
      this.notifyChange();
      return;
    }

    this.userManager.setUser(userData);
    this.registry.clearAssignments();
    this.persist();
    this.notifyPlugins('onUserInitialized', userData);
    this.notifyChange();
  }

  updateUser(userData: Partial<UserData>, options?: UpdateUserOptions): void {
    this.userManager.updateUser(userData);

    if (options?.reassignVariant) {
      this.registry.clearAssignments();
    }

    this.persist();
    this.notifyChange();
  }

  getVariant(experimentKey: string): string {
    const user = this.userManager.getUser();

    const override = this.overrides.get(experimentKey);
    if (override) return override;

    const cached = this.registry.getAssignment(experimentKey);
    if (cached) return cached;

    const experiment = this.registry.get(experimentKey);
    const variant = this.assigner.assign(user.id, experiment);

    this.registry.setAssignment(experimentKey, variant);
    this.persist();
    this.notifyPlugins('onVariantAssigned', experimentKey, variant, user.id);

    return variant;
  }

  isFeatureEnabled(flagKey: string): boolean {
    try {
      return this.getVariant(flagKey) === 'enabled';
    } catch {
      return false;
    }
  }

  overrideVariant(experimentKey: string, variant: string): void {
    this.overrides.set(experimentKey, variant);
    this.persist();
    this.notifyPlugins('onOverrideSet', experimentKey, variant);
    this.notifyChange();
  }

  resetOverrides(experimentKey?: string): void {
    if (experimentKey) {
      this.overrides.delete(experimentKey);
    } else {
      this.overrides.clear();
    }
    this.persist();
    this.notifyChange();
  }

  onConfigChange(callback: ConfigChangeCallback): () => void {
    this.configListeners.push(callback);
    return () => {
      this.configListeners = this.configListeners.filter((cb) => cb !== callback);
    };
  }

  onChange(callback: ChangeCallback): () => void {
    this.changeListeners.push(callback);
    return () => {
      this.changeListeners = this.changeListeners.filter((cb) => cb !== callback);
    };
  }

  addPlugin(plugin: ABTestPlugin): void {
    this.plugins.push(plugin);
  }

  private handleConfigUpdate(config: ExperimentConfig): void {
    this.registry.update(config);
    this.registry.clearAssignment(config.key);
    this.notifyPlugins('onConfigUpdated', config);
    this.configListeners.forEach((cb) => cb(config));
    this.notifyChange();
  }

  private handleCrossTabSync(state: PersistedState): void {
    if (!this.userManager.isInitialized()) return;

    const currentUser = this.userManager.getUser();
    if (state.user.id !== currentUser.id) return;

    this.registry.restoreAssignments(state.assignments);
    this.restoreOverrides(state.overrides);
    this.notifyChange();
  }

  private restoreOverrides(overrides: Record<string, string>): void {
    this.overrides.clear();
    Object.entries(overrides).forEach(([key, val]) => {
      this.overrides.set(key, val);
    });
  }

  private persist(): void {
    this.persistOverrides();

    if (!this.userManager.isInitialized()) return;

    const state: PersistedState = {
      user: this.userManager.getUser(),
      assignments: this.registry.getAllAssignments(),
      overrides: Object.fromEntries(this.overrides),
    };

    this.persistence.save(state);
  }

  private persistOverrides(): void {
    try {
      localStorage.setItem(this.overrideStorageKey, JSON.stringify(Object.fromEntries(this.overrides)));
    } catch {
      // silent
    }
  }

  private loadPersistedOverrides(): void {
    try {
      const raw = localStorage.getItem(this.overrideStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([key, val]) => {
          if (typeof val === 'string') {
            this.overrides.set(key, val);
          }
        });
      }
    } catch {
      // silent
    }
  }

  private notifyChange(): void {
    this.changeListeners.forEach((cb) => cb());
  }

  private notifyPlugins(hook: keyof ABTestPlugin, ...args: unknown[]): void {
    this.plugins.forEach((plugin) => {
      try {
        const fn = plugin[hook] as ((...a: unknown[]) => void) | undefined;
        fn?.(...args);
      } catch (err) {
        console.warn(`[ABTest] Plugin error in ${hook}:`, err);
      }
    });
  }
}

export function createABTestClient(options: ABTestClientOptions): ABTestClient {
  return new ABTestClient(options);
}