/**
 * Outbound Slack incoming-webhook client. Host-allowlisted to hooks.slack.com
 * (SSRF guard, ARCHITECTURE.md §5.4) with a hard 5s timeout so a hung Slack
 * endpoint can never stall the delivery worker.
 */

const SLACK_HOST = 'hooks.slack.com';
const TIMEOUT_MS = 5000;

/**
 * POST a JSON body to a Slack incoming webhook. Throws if the URL is not a
 * hooks.slack.com URL (allowlist) or if the request times out; otherwise returns
 * the HTTP status so the caller can decide delivered vs. retry.
 */
export async function postToSlack(webhookUrl: string, body: unknown): Promise<{ status: number }> {
  const url = new URL(webhookUrl);
  if (url.host !== SLACK_HOST) {
    throw new Error(`refusing to POST to non-Slack host: ${url.host}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
