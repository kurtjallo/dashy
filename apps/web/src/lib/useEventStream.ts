'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActivityEvent } from '@dashy/shared';
import { API, getFeed } from './api';

/** Live-feed connection state surfaced to the UI. */
export type StreamStatus = 'live' | 'reconnecting' | 'polling';

/** Consecutive EventSource errors before we give up and fall back to polling. */
const MAX_ERRORS_BEFORE_POLLING = 5;
/** Poll cadence once degraded (spec: 60s). */
const POLL_INTERVAL_MS = 60_000;
/** Low-frequency probe that tries to re-open the live stream while polling. */
const PROBE_INTERVAL_MS = 60_000;

/**
 * Subscribe to the `/api/v1/stream` SSE feed. Native `EventSource` reconnects on
 * its own (and replays via `Last-Event-ID`); we only escalate after repeated
 * failures, switching to a 60s `getFeed()` poll while a slow probe keeps trying
 * to recover the live stream. Each parsed `activity` frame is handed to `onEvent`;
 * de-duplication is the caller's job. Everything is torn down on unmount.
 */
export function useEventStream(
  enabled: boolean,
  onEvent: (event: ActivityEvent) => void,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('reconnecting');

  // Keep the latest callback without re-subscribing the stream on every render.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      setStatus('reconnecting');
      return;
    }

    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let probeTimer: ReturnType<typeof setInterval> | null = null;
    let errorCount = 0;
    let closed = false;

    const stopTimers = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
      }
    };

    const poll = async () => {
      try {
        const feed = await getFeed();
        if (closed || !feed) return;
        for (const ev of feed) onEventRef.current(ev);
      } catch {
        // Stay in polling mode; the next tick retries.
      }
    };

    const startPolling = () => {
      if (pollTimer) return; // already degraded
      setStatus('polling');
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      probeTimer = setInterval(connect, PROBE_INTERVAL_MS);
    };

    function connect() {
      if (closed || source) return;
      errorCount = 0;
      const es = new EventSource(`${API}/api/v1/stream`, { withCredentials: true });
      source = es;

      es.addEventListener('open', () => {
        if (closed) return;
        errorCount = 0;
        stopTimers();
        setStatus('live');
      });

      es.addEventListener('activity', (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as ActivityEvent;
          onEventRef.current(ev);
        } catch {
          // Ignore a malformed frame rather than tearing down the stream.
        }
      });

      es.addEventListener('error', () => {
        if (closed) return;
        errorCount += 1;
        if (errorCount >= MAX_ERRORS_BEFORE_POLLING) {
          es.close();
          if (source === es) source = null;
          startPolling();
        } else if (pollTimer === null) {
          setStatus('reconnecting');
        }
      });
    }

    connect();

    return () => {
      closed = true;
      stopTimers();
      source?.close();
      source = null;
    };
  }, [enabled]);

  return status;
}
