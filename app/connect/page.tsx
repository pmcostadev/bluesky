'use client';

import { useEffect, useState } from 'react';

type State = 'idle' | 'starting' | 'waiting' | 'done' | 'error';

/**
 * Start a Bluesky connection from our own domain.
 *
 * Connecting from the Composio dashboard always lands the user back on
 * dashboard.composio.dev, because the landing page comes from a callback_url
 * passed at connection-creation time and the dashboard passes its own. Creating
 * the connection here lets us point that at /connected instead.
 */
export default function Connect() {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  // The popup tells us when it is finished.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.source !== 'bluesky-mcp') return;
      if (e.data?.type !== 'composio-connected') return;
      setState(e.data.status === 'failed' ? 'error' : 'done');
      if (e.data.status === 'failed') {
        setError('Authorization was not completed.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function start() {
    setState('starting');
    setError(null);

    try {
      const res = await fetch('/api/connect/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await res.json();

      if (!res.ok || !data.redirectUrl) {
        setState('error');
        setError(data.message ?? data.detail ?? data.error ?? 'Could not start the connection.');
        return;
      }

      const popup = window.open(
        data.redirectUrl,
        'bluesky-connect',
        'width=520,height=720,noopener=no'
      );

      if (!popup) {
        // Popup blocked: fall back to a full-page redirect.
        window.location.href = data.redirectUrl;
        return;
      }

      setState('waiting');
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Bluesky MCP</p>
        <h1>Connect your account</h1>
        <p className="lede">
          You will approve this on Bluesky itself, then land back here. Your password never
          touches this server, and access is revocable at any time from your Bluesky settings.
        </p>

        {state === 'done' ? (
          <div className="ok">Connected. You can close this page.</div>
        ) : (
          <button onClick={start} disabled={state === 'starting' || state === 'waiting'}>
            {state === 'starting'
              ? 'Starting\u2026'
              : state === 'waiting'
                ? 'Waiting for approval\u2026'
                : 'Connect Bluesky'}
          </button>
        )}

        {error && <div className="err">{error}</div>}

        <p className="note">
          Requests <code>atproto</code>, <code>transition:generic</code> and{' '}
          <code>transition:chat.bsky</code>: posting, reading, and direct messages.
        </p>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
        }
        .card {
          width: 100%;
          max-width: 460px;
          background: #141c2b;
          border: 1px solid #243043;
          border-radius: 18px;
          padding: 40px 36px;
        }
        .eyebrow {
          margin: 0 0 14px;
          font-family: ui-monospace, monospace;
          font-size: 11.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #1185fe;
        }
        h1 {
          margin: 0 0 12px;
          font-size: 26px;
          letter-spacing: -0.02em;
        }
        .lede {
          margin: 0 0 24px;
          font-size: 15px;
          line-height: 1.6;
          color: #93a1b8;
        }
        button {
          width: 100%;
          padding: 13px;
          border: 0;
          border-radius: 10px;
          background: #1185fe;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }
        button:hover:not(:disabled) {
          background: #3aa0ff;
        }
        button:disabled {
          opacity: 0.55;
          cursor: default;
        }
        .ok {
          padding: 13px;
          border-radius: 10px;
          background: rgba(17, 133, 254, 0.12);
          border: 1px solid rgba(17, 133, 254, 0.45);
          font-size: 14.5px;
          text-align: center;
        }
        .err {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          background: #2a1620;
          border: 1px solid #5b2434;
          color: #ffd9e0;
          font-size: 13.5px;
          line-height: 1.5;
          word-break: break-word;
        }
        .note {
          margin: 22px 0 0;
          font-size: 12.5px;
          line-height: 1.6;
          color: #93a1b8;
        }
        code {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: #eef3fb;
        }
      `}</style>
    </main>
  );
}
