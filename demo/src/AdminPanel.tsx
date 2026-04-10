import { useState, useCallback, useEffect } from 'react';
import { useABTestClient } from '@zimran-test-lib/core/react';
import { MockTransport } from '@zimran-test-lib/core/transports';
import type { ExperimentConfig } from '@zimran-test-lib/core';

interface AdminPanelProps {
  transport: MockTransport;
  initialExperiments: ExperimentConfig[];
}

interface ExperimentDraft {
  key: string;
  variants: string[];
  split: number[];
  enabled: boolean;
}

interface NewExperimentForm {
  key: string;
  variantsCsv: string;
  splitCsv: string;
  enabled: boolean;
}

export function AdminPanel({ transport, initialExperiments }: AdminPanelProps) {
  const client = useABTestClient();
  const [experiments, setExperiments] = useState<ExperimentDraft[]>(
    () => initialExperiments.map((e) => ({ ...e, split: [...e.split] }))
  );
  const [userInitialized, setUserInitialized] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overrideKey, setOverrideKey] = useState('');
  const [overrideVariant, setOverrideVariant] = useState('');
  const [pushLog, setPushLog] = useState<string[]>([]);
  const [newExp, setNewExp] = useState<NewExperimentForm>({
    key: '',
    variantsCsv: 'control,variant_a',
    splitCsv: '50,50',
    enabled: true,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Try to read current assignments
  const refreshAssignments = useCallback(() => {
    try {
      client.getVariant; // just check client exists
      setUserInitialized(true);
      const result: Record<string, string> = {};
      for (const exp of experiments) {
        try {
          result[exp.key] = client.getVariant(exp.key);
        } catch {
          // user not initialized yet
          setUserInitialized(false);
          return;
        }
      }
      setAssignments(result);
    } catch {
      setUserInitialized(false);
    }
  }, [client, experiments]);

  useEffect(() => {
    refreshAssignments();

    const unsub = client.onChange(() => {
      refreshAssignments();
    });

    return unsub;
  }, [client, refreshAssignments]);

  const handleSplitChange = (expIndex: number, splitIndex: number, value: string) => {
    setExperiments((prev) => {
      const next = prev.map((e) => ({ ...e, split: [...e.split] }));
      next[expIndex].split[splitIndex] = parseInt(value, 10) || 0;
      return next;
    });
  };

  const handleToggleEnabled = (expIndex: number) => {
    setExperiments((prev) => {
      const next = prev.map((e) => ({ ...e, split: [...e.split] }));
      next[expIndex].enabled = !next[expIndex].enabled;
      return next;
    });
  };

  const handlePushConfig = (exp: ExperimentDraft) => {
    const total = exp.split.reduce((s, n) => s + n, 0);
    if (total !== 100) {
      alert(`Split for "${exp.key}" sums to ${total}, must be 100.`);
      return;
    }

    const config: ExperimentConfig = {
      key: exp.key,
      variants: [...exp.variants],
      split: [...exp.split],
      enabled: exp.enabled,
    };

    transport.emit(config);
    setPushLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Pushed "${exp.key}": split=[${exp.split}], enabled=${exp.enabled}`,
      ...prev.slice(0, 19),
    ]);
  };

  const handlePushAll = () => {
    for (const exp of experiments) {
      const total = exp.split.reduce((s, n) => s + n, 0);
      if (total !== 100) {
        alert(`Split for "${exp.key}" sums to ${total}, must be 100. Fix before pushing.`);
        return;
      }
    }
    experiments.forEach(handlePushConfig);
  };

  const handleSetOverride = () => {
    if (!overrideKey || !overrideVariant) return;
    client.overrideVariant(overrideKey, overrideVariant);
    setOverrides((prev) => ({ ...prev, [overrideKey]: overrideVariant }));
    refreshAssignments();
    setPushLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Override: "${overrideKey}" → "${overrideVariant}"`,
      ...prev.slice(0, 19),
    ]);
  };

  const handleClearOverride = (key: string) => {
    client.resetOverrides(key);
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    refreshAssignments();
    setPushLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Cleared override for "${key}"`,
      ...prev.slice(0, 19),
    ]);
  };

  const handleClearAllOverrides = () => {
    client.resetOverrides();
    setOverrides({});
    refreshAssignments();
    setPushLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Cleared all overrides`,
      ...prev.slice(0, 19),
    ]);
  };

  const handleCreateExperiment = () => {
    const variants = newExp.variantsCsv.split(',').map((v) => v.trim()).filter(Boolean);
    const split = newExp.splitCsv.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

    if (!newExp.key.trim()) {
      alert('Experiment key is required.');
      return;
    }
    if (experiments.some((e) => e.key === newExp.key.trim())) {
      alert(`Experiment "${newExp.key}" already exists.`);
      return;
    }
    if (variants.length < 2) {
      alert('At least 2 variants required.');
      return;
    }
    if (variants.length !== split.length) {
      alert(`Variants count (${variants.length}) doesn't match split count (${split.length}).`);
      return;
    }
    const total = split.reduce((s, n) => s + n, 0);
    if (total !== 100) {
      alert(`Split sums to ${total}, must be 100.`);
      return;
    }

    const config: ExperimentConfig = {
      key: newExp.key.trim(),
      variants,
      split,
      enabled: newExp.enabled,
    };

    // Add to local state and immediately push via transport
    setExperiments((prev) => [...prev, { ...config, split: [...config.split] }]);
    transport.emit(config);

    setPushLog((prev) => [
      `[${new Date().toLocaleTimeString()}] Created & pushed "${config.key}": variants=[${variants}], split=[${split}], enabled=${config.enabled}`,
      ...prev.slice(0, 19),
    ]);

    // Reset form
    setNewExp({ key: '', variantsCsv: 'control,variant_a', splitCsv: '50,50', enabled: true });
    setShowCreateForm(false);
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Admin Panel</h1>
        <a href="#demo" onClick={(e) => { e.preventDefault(); window.location.hash = ''; }} style={{ fontSize: 14 }}>Back to Demo</a>
      </div>

      {/* Experiments Editor */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: '0 0 12px' }}>Experiments</h2>
          <button
            onClick={handlePushAll}
            style={{
              padding: '8px 20px',
              cursor: 'pointer',
              background: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            Push All Changes
          </button>
        </div>

        {experiments.map((exp, expIndex) => {
          const total = exp.split.reduce((s, n) => s + n, 0);
          const isValid = total === 100;

          return (
            <div
              key={exp.key}
              style={{
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                background: exp.enabled ? '#fff' : '#fafafa',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <code style={{ fontSize: 16, fontWeight: 600 }}>{exp.key}</code>
                  {!exp.enabled && (
                    <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>DISABLED</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={exp.enabled}
                      onChange={() => handleToggleEnabled(expIndex)}
                    />
                    Enabled
                  </label>
                  <button
                    onClick={() => handlePushConfig(exp)}
                    disabled={!isValid}
                    style={{
                      padding: '4px 12px',
                      cursor: isValid ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      background: isValid ? '#4caf50' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                    }}
                  >
                    Push
                  </button>
                </div>
              </div>

              {/* Split editor */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Variant</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, width: 100 }}>Split %</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Bar</th>
                    {userInitialized && (
                      <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, width: 80 }}>Assigned</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {exp.variants.map((variant, splitIndex) => {
                    const isAssigned = assignments[exp.key] === variant;
                    const isOverridden = overrides[exp.key] === variant;
                    const colors = ['#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#f44336', '#009688'];
                    const color = colors[splitIndex % colors.length];

                    return (
                      <tr key={variant} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <code>{variant}</code>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number"
                            value={exp.split[splitIndex]}
                            onChange={(e) => handleSplitChange(expIndex, splitIndex, e.target.value)}
                            min={0}
                            max={100}
                            style={{ width: 60, padding: '4px 6px', fontSize: 14 }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ background: '#f0f0f0', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(exp.split[splitIndex], 100)}%`,
                                height: '100%',
                                background: color,
                                borderRadius: 4,
                                transition: 'width 0.2s',
                              }}
                            />
                          </div>
                        </td>
                        {userInitialized && (
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {isAssigned && (
                              <span
                                style={{
                                  background: isOverridden ? '#ff9800' : color,
                                  color: 'white',
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                {isOverridden ? 'OVERRIDE' : 'ACTIVE'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Split total indicator */}
              <div style={{ marginTop: 8, fontSize: 12, color: isValid ? '#4caf50' : '#f44336' }}>
                Total: {total}% {isValid ? '' : '(must be 100)'}
              </div>
            </div>
          );
        })}
        {/* Create new experiment */}
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '8px 20px',
              cursor: 'pointer',
              background: '#fff',
              color: '#1976d2',
              border: '2px dashed #1976d2',
              borderRadius: 8,
              fontWeight: 600,
              width: '100%',
              fontSize: 14,
            }}
          >
            + Create New Experiment
          </button>
        ) : (
          <div style={{ border: '2px solid #1976d2', borderRadius: 8, padding: 16, background: '#e3f2fd' }}>
            <h3 style={{ margin: '0 0 12px', color: '#1976d2' }}>New Experiment</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13 }}>
                Key:
                <input
                  value={newExp.key}
                  onChange={(e) => setNewExp((p) => ({ ...p, key: e.target.value }))}
                  placeholder="e.g. pricing_page"
                  style={{ marginLeft: 8, padding: '4px 8px', fontSize: 14, width: 200 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Variants (comma-separated):
                <input
                  value={newExp.variantsCsv}
                  onChange={(e) => setNewExp((p) => ({ ...p, variantsCsv: e.target.value }))}
                  placeholder="control,variant_a,variant_b"
                  style={{ marginLeft: 8, padding: '4px 8px', fontSize: 14, width: 300 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Split % (comma-separated):
                <input
                  value={newExp.splitCsv}
                  onChange={(e) => setNewExp((p) => ({ ...p, splitCsv: e.target.value }))}
                  placeholder="50,50"
                  style={{ marginLeft: 8, padding: '4px 8px', fontSize: 14, width: 200 }}
                />
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={newExp.enabled}
                  onChange={(e) => setNewExp((p) => ({ ...p, enabled: e.target.checked }))}
                />
                Enabled (starts immediately)
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleCreateExperiment}
                  style={{
                    padding: '6px 16px',
                    cursor: 'pointer',
                    background: '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  Create & Push
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  style={{
                    padding: '6px 16px',
                    cursor: 'pointer',
                    background: '#fff',
                    color: '#666',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <hr style={{ margin: '24px 0' }} />

      {/* Overrides */}
      <section>
        <h2>Overrides (QA Mode)</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
          Force a specific variant for the current user. Overrides take priority over computed assignments.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <select
            value={overrideKey}
            onChange={(e) => {
              setOverrideKey(e.target.value);
              setOverrideVariant('');
            }}
            style={{ padding: '6px 10px', fontSize: 14 }}
          >
            <option value="">Select experiment...</option>
            {experiments.map((e) => (
              <option key={e.key} value={e.key}>{e.key}</option>
            ))}
          </select>

          <select
            value={overrideVariant}
            onChange={(e) => setOverrideVariant(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 14 }}
            disabled={!overrideKey}
          >
            <option value="">Select variant...</option>
            {overrideKey &&
              experiments
                .find((e) => e.key === overrideKey)
                ?.variants.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
          </select>

          <button
            onClick={handleSetOverride}
            disabled={!overrideKey || !overrideVariant}
            style={{
              padding: '6px 14px',
              cursor: overrideKey && overrideVariant ? 'pointer' : 'not-allowed',
              background: overrideKey && overrideVariant ? '#ff9800' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            Set Override
          </button>

          {Object.keys(overrides).length > 0 && (
            <button
              onClick={handleClearAllOverrides}
              style={{
                padding: '6px 14px',
                cursor: 'pointer',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: 4,
              }}
            >
              Clear All
            </button>
          )}
        </div>

        {/* Active overrides list */}
        {Object.keys(overrides).length > 0 && (
          <div style={{ background: '#fff3e0', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#e65100' }}>Active Overrides</div>
            {Object.entries(overrides).map(([key, variant]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                }}
              >
                <span>
                  <code>{key}</code> → <code>{variant}</code>
                </span>
                <button
                  onClick={() => handleClearOverride(key)}
                  style={{
                    padding: '2px 10px',
                    cursor: 'pointer',
                    fontSize: 12,
                    background: 'transparent',
                    border: '1px solid #e65100',
                    color: '#e65100',
                    borderRadius: 4,
                  }}
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        )}

        {!userInitialized && (
          <p style={{ color: '#999', fontSize: 13 }}>
            Initialize a user on the Demo page first to use overrides.
          </p>
        )}
      </section>

      <hr style={{ margin: '24px 0' }} />

      {/* Event Log */}
      <section>
        <h2>Activity Log</h2>
        {pushLog.length === 0 ? (
          <p style={{ color: '#999', fontSize: 13 }}>No actions yet. Edit splits and push changes to see activity.</p>
        ) : (
          <div
            style={{
              background: '#263238',
              color: '#b2dfdb',
              borderRadius: 8,
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {pushLog.map((entry, i) => (
              <div key={i} style={{ padding: '2px 0' }}>{entry}</div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
