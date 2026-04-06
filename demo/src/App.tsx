import { useState, useCallback, useEffect } from 'react';
import { ABTestProvider, useABTestClient, useExperiment, useFeatureFlag } from '@zimran-test-lib/core/react';
import { MockTransport } from '@zimran-test-lib/core/transports';
import type { ExperimentConfig } from '@zimran-test-lib/core';
import { AdminPanel } from './AdminPanel';

const experiments: ExperimentConfig[] = [
  {
    key: 'checkout_flow',
    variants: ['control', 'variant_a', 'variant_b'],
    split: [50, 30, 20],
    enabled: true,
  },
  {
    key: 'new_header',
    variants: ['enabled', 'disabled'],
    split: [50, 50],
    enabled: true,
  },
];

const transport = new MockTransport();

function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handler = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  return route;
}

export function App() {
  const route = useHashRoute();
  const isAdmin = route === '#admin';

  return (
    <ABTestProvider experiments={experiments} transport={transport}>
      {isAdmin ? (
        <AdminPanel transport={transport} initialExperiments={experiments} />
      ) : (
        <DemoPage />
      )}
    </ABTestProvider>
  );
}

function DemoPage() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>A/B Test Library Demo</h1>
        <a href="#admin" style={{ fontSize: 14 }}>Admin Panel</a>
      </div>
      <div style={{ marginTop: 24 }}>
        <UserSection />
        <hr style={{ margin: '24px 0' }} />
        <ExperimentSection />
        <hr style={{ margin: '24px 0' }} />
        <ConfigPanel />
      </div>
    </div>
  );
}

function UserSection() {
  const client = useABTestClient();
  const [userId, setUserId] = useState('user-123');
  const [email, setEmail] = useState('demo@example.com');
  const [initialized, setInitialized] = useState(false);

  const handleInit = useCallback(() => {
    client.initializeUser({ id: userId, email });
    setInitialized(true);
  }, [client, userId, email]);

  return (
    <section>
      <h2>1. Initialize User</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300 }}>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User ID"
          style={{ padding: '8px 12px', fontSize: 14 }}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ padding: '8px 12px', fontSize: 14 }}
        />
        <button onClick={handleInit} style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>
          {initialized ? 'Re-initialize' : 'Initialize User'}
        </button>
      </div>
      {initialized && (
        <p style={{ color: 'green', marginTop: 8 }}>
          User <strong>{userId}</strong> initialized.
        </p>
      )}
    </section>
  );
}

function ExperimentSection() {
  const { variant: checkoutVariant, isReady: checkoutReady } = useExperiment('checkout_flow');
  const newHeaderEnabled = useFeatureFlag('new_header');

  return (
    <section>
      <h2>2. Experiment Results</h2>

      <div style={{ marginBottom: 16 }}>
        <h3>Checkout Flow Experiment</h3>
        {checkoutReady ? (
          <>
            <p>Your variant: <code style={{ background: '#f0f0f0', padding: '2px 6px' }}>{checkoutVariant}</code></p>
            {checkoutVariant === 'control' && (
              <div style={{ padding: 16, background: '#e8f5e9', borderRadius: 8 }}>
                Standard checkout — single page form.
              </div>
            )}
            {checkoutVariant === 'variant_a' && (
              <div style={{ padding: 16, background: '#e3f2fd', borderRadius: 8 }}>
                Multi-step checkout — wizard style with progress bar.
              </div>
            )}
            {checkoutVariant === 'variant_b' && (
              <div style={{ padding: 16, background: '#fff3e0', borderRadius: 8 }}>
                Express checkout — one-click purchase with saved payment.
              </div>
            )}
          </>
        ) : (
          <p style={{ color: '#999' }}>Initialize a user first to see your variant.</p>
        )}
      </div>

      <div>
        <h3>New Header (Feature Flag)</h3>
        {newHeaderEnabled ? (
          <div style={{ padding: 16, background: '#f3e5f5', borderRadius: 8 }}>
            New header is <strong>enabled</strong> for you!
          </div>
        ) : (
          <div style={{ padding: 16, background: '#fafafa', borderRadius: 8 }}>
            New header is <strong>disabled</strong>. Showing default header.
          </div>
        )}
      </div>
    </section>
  );
}

function ConfigPanel() {
  const [splitA, setSplitA] = useState('50');
  const [splitB, setSplitB] = useState('30');
  const [enabled, setEnabled] = useState(true);

  const handleUpdate = useCallback(() => {
    const a = parseInt(splitA, 10);
    const b = parseInt(splitB, 10);
    const control = 100 - a - b;

    if (control < 0 || a < 0 || b < 0) {
      alert('Split values must sum to 100 or less.');
      return;
    }

    transport.emit({
      key: 'checkout_flow',
      variants: ['control', 'variant_a', 'variant_b'],
      split: [control, a, b],
      enabled,
    });
  }, [splitA, splitB, enabled]);

  const handleToggleHeader = useCallback(() => {
    transport.emit({
      key: 'new_header',
      variants: ['enabled', 'disabled'],
      split: [50, 50],
      enabled: !enabled,
    });
  }, [enabled]);

  return (
    <section>
      <h2>3. Simulate Remote Config Update</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        This simulates a server pushing config changes via MockTransport.
      </p>

      <div style={{ marginBottom: 16 }}>
        <h3>Update Checkout Flow Split</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            variant_a %:
            <input
              type="number"
              value={splitA}
              onChange={(e) => setSplitA(e.target.value)}
              style={{ width: 60, marginLeft: 4, padding: '4px 8px' }}
              min={0}
              max={100}
            />
          </label>
          <label>
            variant_b %:
            <input
              type="number"
              value={splitB}
              onChange={(e) => setSplitB(e.target.value)}
              style={{ width: 60, marginLeft: 4, padding: '4px 8px' }}
              min={0}
              max={100}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <button onClick={handleUpdate} style={{ padding: '6px 14px', cursor: 'pointer' }}>
            Push Config
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#999' }}>
          control % = 100 - variant_a - variant_b
        </p>
      </div>

      <div>
        <h3>Toggle New Header Flag</h3>
        <button onClick={handleToggleHeader} style={{ padding: '6px 14px', cursor: 'pointer' }}>
          Toggle new_header experiment
        </button>
      </div>
    </section>
  );
}
