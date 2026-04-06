# @zimran-test-lib/core

A modular A/B testing library for React and vanilla JavaScript. Deterministic variant assignment, localStorage persistence, real-time config updates, and a plugin system — all in a lightweight package.

## Installation

```bash
npm install @zimran-test-lib/core
```

React is an optional peer dependency. Install it if you plan to use the React hooks:

```bash
npm install react
```

## Quick Start

```ts
import { createABTestClient } from '@zimran-test-lib/core';

const client = createABTestClient({
  experiments: [
    {
      key: 'checkout-button',
      variants: ['control', 'green', 'orange'],
      split: [34, 33, 33],
      enabled: true,
    },
  ],
});

client.initializeUser({ id: 'user-42', email: 'user@example.com' });

const variant = client.getVariant('checkout-button');
// => 'control', 'green', or 'orange' — deterministic per user
```

## Core Concepts

### Deterministic Assignment

Variants are assigned using an FNV-1a hash of `userId:experimentKey`. The same user always gets the same variant for a given experiment, even across sessions and devices. The hash maps to a bucket (0–99), which is matched against cumulative split percentages.

### Persistence

Assignments are saved to `localStorage` and restored on next visit. Cross-tab synchronization is handled automatically via `storage` events — if one tab updates an assignment, other tabs pick it up.

### Feature Flags

Feature flags are just experiments with two variants: `'disabled'` and `'enabled'`.

```ts
const darkMode = client.isFeatureEnabled('dark-mode');
// true if the user's variant is 'enabled'
```

## API Reference

### `createABTestClient(options)`

Creates a new client instance.

| Option | Type | Required | Description |
|---|---|---|---|
| `experiments` | `ExperimentConfig[]` | Yes | Array of experiment configurations |
| `transport` | `ConfigTransport` | No | Real-time config update transport |
| `plugins` | `ABTestPlugin[]` | No | Array of lifecycle plugins |
| `storageKey` | `string` | No | localStorage key (default: `'ab_test_lib'`) |

### `ExperimentConfig`

```ts
interface ExperimentConfig {
  key: string;        // Unique experiment identifier
  variants: string[]; // Variant names, e.g. ['control', 'variant_a']
  split: number[];    // Traffic percentages, must sum to 100
  enabled: boolean;   // When false, all users get the first variant
}
```

### Client Methods

#### `initializeUser(userData, options?)`

Sets the current user. Restores cached assignments from localStorage if the same user was previously initialized.

```ts
client.initializeUser({ id: 'user-42' });

// Force fresh assignment (ignores cache):
client.initializeUser({ id: 'user-42' }, { forceReassign: true });
```

#### `updateUser(partialData, options?)`

Updates the current user's data. Optionally clears cached assignments to force reassignment.

```ts
client.updateUser({ email: 'new@example.com' });

// Reassign all variants after update:
client.updateUser({ plan: 'premium' }, { reassignVariant: true });
```

#### `getVariant(experimentKey)`

Returns the assigned variant for the given experiment. Computes and caches the assignment on first call.

```ts
const variant = client.getVariant('checkout-button');
```

#### `isFeatureEnabled(flagKey)`

Returns `true` if the user's variant for the given flag is `'enabled'`.

```ts
if (client.isFeatureEnabled('dark-mode')) {
  enableDarkMode();
}
```

#### `overrideVariant(experimentKey, variant)`

Sets an admin override that takes priority over the computed assignment.

```ts
client.overrideVariant('checkout-button', 'orange');
```

#### `resetOverrides(experimentKey?)`

Clears overrides. Pass a key to clear a single override, or call with no arguments to clear all.

```ts
client.resetOverrides('checkout-button'); // clear one
client.resetOverrides();                  // clear all
```

#### `onConfigChange(callback)`

Subscribes to experiment config updates (from a transport). Returns an unsubscribe function.

```ts
const unsub = client.onConfigChange((config) => {
  console.log('Experiment updated:', config.key);
});

// Later:
unsub();
```

#### `addPlugin(plugin)`

Adds a plugin at runtime.

```ts
client.addPlugin({
  onVariantAssigned(key, variant, userId) {
    analytics.track('experiment_viewed', { key, variant, userId });
  },
});
```

## React Integration

```tsx
import { ABTestProvider, useExperiment, useFeatureFlag } from '@zimran-test-lib/core/react';

function App() {
  return (
    <ABTestProvider
      experiments={[
        { key: 'hero-banner', variants: ['control', 'redesign'], split: [50, 50], enabled: true },
        { key: 'dark-mode', variants: ['disabled', 'enabled'], split: [50, 50], enabled: true },
      ]}
    >
      <Page />
    </ABTestProvider>
  );
}
```

### `useExperiment(experimentKey)`

Returns `{ variant: string | null, isReady: boolean }`. Automatically updates when the experiment config changes via a transport.

```tsx
function HeroBanner() {
  const { variant, isReady } = useExperiment('hero-banner');

  if (!isReady) return <DefaultBanner />;

  return variant === 'redesign' ? <NewBanner /> : <OldBanner />;
}
```

### `useFeatureFlag(flagKey)`

Returns a `boolean`. Reacts to config changes.

```tsx
function Settings() {
  const darkMode = useFeatureFlag('dark-mode');
  return <div className={darkMode ? 'dark' : 'light'}>...</div>;
}
```

### `useABTestClient()`

Returns the raw `ABTestClient` instance from context. Must be used inside `<ABTestProvider>`.

```tsx
function AdminPanel() {
  const client = useABTestClient();
  return (
    <button onClick={() => client.overrideVariant('hero-banner', 'redesign')}>
      Force redesign
    </button>
  );
}
```

## Transports

Transports push experiment config updates to the client in real time.

```ts
import { MockTransport, WebSocketTransport, LongPollingTransport } from '@zimran-test-lib/core/transports';
```

### MockTransport

For development and testing. Manually emit config updates.

```ts
const transport = new MockTransport();
const client = createABTestClient({ experiments, transport });

// Simulate a remote config change:
transport.emit({
  key: 'checkout-button',
  variants: ['control', 'blue'],
  split: [50, 50],
  enabled: true,
});
```

### WebSocketTransport

Connects to a WebSocket server that sends `ExperimentConfig` JSON messages.

```ts
const transport = new WebSocketTransport({
  url: 'wss://your-server.com/ab-config',
  reconnectInterval: 5000, // optional, default 5000ms
});
```

### LongPollingTransport

Polls an HTTP endpoint at a configurable interval.

```ts
const transport = new LongPollingTransport({
  url: 'https://your-server.com/api/ab-config',
  intervalMs: 30000, // optional, default 30000ms
});
```

## Plugins

Plugins hook into lifecycle events. All hooks are optional.

```ts
interface ABTestPlugin {
  onUserInitialized?(user: UserData): void;
  onVariantAssigned?(experimentKey: string, variant: string, userId: string): void;
  onConfigUpdated?(config: ExperimentConfig): void;
  onOverrideSet?(experimentKey: string, variant: string): void;
  onError?(error: Error): void;
}
```

Example — analytics plugin:

```ts
const analyticsPlugin: ABTestPlugin = {
  onVariantAssigned(key, variant, userId) {
    analytics.track('ab_test_assignment', { experiment: key, variant, userId });
  },
  onConfigUpdated(config) {
    console.log(`[AB] Config updated: ${config.key}`);
  },
};

const client = createABTestClient({
  experiments,
  plugins: [analyticsPlugin],
});
```

## TypeScript

All types are exported from the main entry point:

```ts
import type {
  UserData,
  ExperimentConfig,
  ABTestClientOptions,
  ABTestPlugin,
  ConfigTransport,
  InitUserOptions,
  UpdateUserOptions,
} from '@zimran-test-lib/core';
```

## License

MIT
