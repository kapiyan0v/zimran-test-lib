import { UserData, ABTestClientOptions, InitUserOptions, UpdateUserOptions, ExperimentConfig, ABTestPlugin, PersistedState } from '../types';
import { UserManager } from './UserManagement';
import { ExperimentRegistry } from './ExperimentRegistry';
import { VariantAssigner } from './VariantAssigner';
import { PersistenceManager } from './PersistenceManager';
import { ABTestError } from './errors';

type ConfigChangeCallback = (config: ExperimentConfig) => void;

export class ABTestClient {
  private userManager: UserManager;
  private registry: ExperimentRegistry;
  private assigner: VariantAssigner;
  private persistence: PersistenceManager;
  private plugins: ABTestPlugin[];
  private overrides = new Map<string, string>();
  private configListeners: ConfigChangeCallback[] = [];

  constructor(options: ABTestClientOptions) {
    this.userManager = new UserManager();
    this.registry = new ExperimentRegistry(options.experiments);
    this.assigner = new VariantAssigner();
    this.persistence = new PersistenceManager(options.storageKey);
    this.plugins = options.plugins ?? [];

    if (options.transport) {
      options.transport.subscribe((config) => this.handleConfigUpdate(config));
    }

    this.persistence.onExternalChange((state) => this.handleCrossTabSync(state));
  }

  initializeUser(userData: UserData, options?: InitUserOptions): void {
    const cached = this.persistence.load();

    // Rehydrate if same user and not forcing reassign
    if (cached && cached.user.id === userData.id && !options?.forceReassign) {
      this.userManager.setUser(cached.user);
      this.registry.restoreAssignments(cached.assignments);
      this.restoreOverrides(cached.overrides);
      return;
    }

    this.userManager.setUser(userData);
    this.registry.clearAssignments();
    this.persist();
    this.notifyPlugins('onUserInitialized', userData);
  }

  updateUser(userData: Partial<UserData>, options?: UpdateUserOptions): void {
    this.userManager.updateUser(userData);

    if (options?.reassignVariant) {
      this.registry.clearAssignments();
    }

    this.persist();
  }

  getVariant(experimentKey: string): string {
    const user = this.userManager.getUser();

    // Check overrides first (QA mode)
    const override = this.overrides.get(experimentKey);
    if (override) return override;

    // Check cached assignment
    const cached = this.registry.getAssignment(experimentKey);
    if (cached) return cached;

    // Compute new assignment
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
  }

  resetOverrides(experimentKey?: string): void {
    if (experimentKey) {
      this.overrides.delete(experimentKey);
    } else {
      this.overrides.clear();
    }
    this.persist();
  }

  onConfigChange(callback: ConfigChangeCallback): () => void {
    this.configListeners.push(callback);
    return () => {
      this.configListeners = this.configListeners.filter((cb) => cb !== callback);
    };
  }

  addPlugin(plugin: ABTestPlugin): void {
    this.plugins.push(plugin);
  }

  // ── Private ───────────────────────────────────────

  private handleConfigUpdate(config: ExperimentConfig): void {
    this.registry.update(config);
    this.notifyPlugins('onConfigUpdated', config);
    this.configListeners.forEach((cb) => cb(config));
  }

  private handleCrossTabSync(state: PersistedState): void {
    if (!this.userManager.isInitialized()) return;

    const currentUser = this.userManager.getUser();
    if (state.user.id !== currentUser.id) return;

    this.registry.restoreAssignments(state.assignments);
    this.restoreOverrides(state.overrides);
  }

  private restoreOverrides(overrides: Record<string, string>): void {
    this.overrides.clear();
    Object.entries(overrides).forEach(([key, val]) => {
      this.overrides.set(key, val);
    });
  }

  private persist(): void {
    if (!this.userManager.isInitialized()) return;

    const state: PersistedState = {
      user: this.userManager.getUser(),
      assignments: this.registry.getAllAssignments(),
      overrides: Object.fromEntries(this.overrides),
    };

    this.persistence.save(state);
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

// ── Factory function ────────────────────────────────

export function createABTestClient(options: ABTestClientOptions): ABTestClient {
  return new ABTestClient(options);
}