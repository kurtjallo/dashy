'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addSlackRule,
  addSlackWebhook,
  deleteSlackWebhook,
  listSlack,
  testSlackWebhook,
  type SlackConfig,
} from '@/lib/api';

const PROTECTED_BRANCH_MERGE = 'protected_branch_merge';

/** Slack alerts settings: connect webhooks, send a test, and toggle the merge alert. */
export default function SlackSettings() {
  const [config, setConfig] = useState<SlackConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSlack();
      if (!data) setError('Could not load Slack settings.');
      setConfig(data);
    } catch {
      setError('Could not load Slack settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = useCallback(async () => {
    if (name.trim().length === 0 || url.trim().length === 0) return;
    setAdding(true);
    setError(null);
    const webhook = await addSlackWebhook(name.trim(), url.trim());
    setAdding(false);
    if (!webhook) {
      setError('Could not add that webhook. URL must be a https://hooks.slack.com/… link.');
      return;
    }
    setName('');
    setUrl('');
    await load();
  }, [name, url, load]);

  const onTest = useCallback(async (webhookId: string) => {
    setTesting(webhookId);
    const status = await testSlackWebhook(webhookId);
    setTesting(null);
    setTestResult((prev) => ({
      ...prev,
      [webhookId]: status != null && status >= 200 && status < 300 ? 'Sent ✓' : 'Failed',
    }));
  }, []);

  const onDelete = useCallback(
    async (webhookId: string) => {
      setError(null);
      const ok = await deleteSlackWebhook(webhookId);
      if (!ok) {
        setError('Could not remove that webhook.');
        return;
      }
      await load();
    },
    [load],
  );

  const mergeRuleEnabled =
    config?.rules.some((r) => r.enabled && r.event_types.includes(PROTECTED_BRANCH_MERGE)) ?? false;
  const firstWebhook = config?.webhooks[0] ?? null;

  const onToggleMergeRule = useCallback(async () => {
    if (mergeRuleEnabled || !firstWebhook) return; // enable-only; no disable endpoint
    setToggling(true);
    setError(null);
    const rule = await addSlackRule({
      webhookId: firstWebhook.id,
      repoId: null,
      eventTypes: [PROTECTED_BRANCH_MERGE],
    });
    setToggling(false);
    if (!rule) {
      setError('Could not enable the merge alert.');
      return;
    }
    await load();
  }, [mergeRuleEnabled, firstWebhook, load]);

  return (
    <div className="repo-panel slack-panel">
      <div className="repo-panel-head">
        <span>Slack alerts</span>
      </div>

      {loading && <p className="muted">Loading Slack settings…</p>}
      {error && <p className="repo-error">{error}</p>}

      {config && config.webhooks.length > 0 && (
        <ul className="repo-list">
          {config.webhooks.map((wh) => (
            <li key={wh.id} className="repo-row slack-row">
              <div className="slack-row-main">
                <span className="repo-name">{wh.url_masked}</span>
                <span className={`slack-status slack-status--${wh.status}`}>{wh.status}</span>
              </div>
              <div className="slack-row-actions">
                {testResult[wh.id] && (
                  <span className="slack-test-result">{testResult[wh.id]}</span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={testing === wh.id}
                  onClick={() => void onTest(wh.id)}
                >
                  {testing === wh.id ? 'Sending…' : 'Send test'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void onDelete(wh.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {config && config.webhooks.length === 0 && !loading && (
        <p className="muted">No Slack webhooks connected yet.</p>
      )}

      <div className="slack-form">
        <input
          className="slack-input"
          type="text"
          placeholder="Name (e.g. #eng-alerts)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="slack-input slack-input--url"
          type="url"
          placeholder="https://hooks.slack.com/services/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm slack-add-btn"
          disabled={adding || name.trim().length === 0 || url.trim().length === 0}
          onClick={() => void onAdd()}
        >
          {adding ? 'Adding…' : 'Add webhook'}
        </button>
      </div>

      <label className="slack-toggle">
        <input
          type="checkbox"
          checked={mergeRuleEnabled}
          disabled={toggling || mergeRuleEnabled || !firstWebhook}
          onChange={() => void onToggleMergeRule()}
        />
        <span>Alert on protected-branch merges</span>
        {!firstWebhook && <span className="muted slack-toggle-hint">add a webhook first</span>}
      </label>
    </div>
  );
}
