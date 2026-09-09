'use client';

import { useEffect, useState } from 'react';

/**
 * Landing page after a Composio connection completes.
 *
 * Composio appends ?status=success&connected_account_id=... (snake_case via
 * link(), camelCase via the legacy initiate()), so both spellings are read.
 *
 * If this page was opened as a popup it closes itself, which is the behaviour
 * the Composio dashboard never gave us.
 */
export default function Connected() {
  const [countdown, setCountdown] = useState(3);
  const [isPopup, setIsPopup] = useState(false);
  const [status, setStatus] = useState<'success' | 'failed' | 'unknown'>('unknown');
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const raw = (p.get('status') ?? '').toLowerCase();
    setStatus(raw === 'success' ? 'success' : raw === 'failed' ? 'failed' : 'unknown');
    setAccountId(p.get('connected_account_id') ?? p.get('connectedAccountId'));

    // window.opener is set when we were opened by another window.
    const popup = Boolean(window.opener && window.opener !== window);
    setIsPopup(popup);

    if (!popup) return;

    // Let the opener know, in case it wants to refresh state.
    try {
      window.opener.postMessage(
        { source: 'bluesky-mcp', type: 'composio-connected', status: raw },
        '*'
      );
    } catch {
      // cross-origin opener; the close below still works
    }

    const tick = window.setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          window.clearInterval(tick);
          window.close();
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => window.clearInterval(tick);
  }, []);

  const failed = status === 'failed';

  return (
    <main className="wrap">
      <div className="card" data-state={status}>
        <div className="mark" aria-hidden="true">
          {failed ? '\u00d7' : '\u2713'}
        </div>

        <h1>{failed ? 'Not connected' : 'Account connected'}</h1>

        <p className="lede">
          {failed
            ? 'The authorization did not complete. Nothing was saved, so you can safely try again.'
            : 'Your Bluesky account is authorized. The server can now act on your behalf.'}
        </p>

        {accountId && (
          <p className="meta">
            connection <code>{accountId}</code>
          </p>
        )}

        {isPopup ? (
          <p className="meta">
            closing this window in {countdown}
            {countdown === 1 ? ' second' : ' seconds'}\u2026
          </p>
        ) : (
          <a className="btn" href="/">
            Back to the server
          </a>
        )}
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
          text-align: center;
        }
        .mark {
          width: 56px;
          height: 56px;
          margin: 0 auto 22px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 28px;
          line-height: 1;
          background: rgba(17, 133, 254, 0.14);
          color: #1185fe;
          border: 1px solid rgba(17, 133, 254, 0.45);
        }
        .card[data-state='failed'] .mark {
          background: rgba(255, 90, 120, 0.12);
          color: #ff5a78;
          border-color: rgba(255, 90, 120, 0.45);
        }
        h1 {
          margin: 0 0 12px;
          font-size: 24px;
          letter-spacing: -0.02em;
        }
        .lede {
          margin: 0 0 20px;
          font-size: 15px;
          line-height: 1.6;
          color: #93a1b8;
        }
        .meta {
          margin: 0;
          font-size: 13px;
          color: #93a1b8;
        }
        .meta + .meta {
          margin-top: 10px;
        }
        code {
          font-family: ui-monospace, monospace;
          font-size: 12.5px;
          color: #eef3fb;
          word-break: break-all;
        }
        .btn {
          display: inline-block;
          margin-top: 22px;
          padding: 11px 20px;
          border-radius: 10px;
          background: #1185fe;
          color: #fff;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
        }
        .btn:hover {
          background: #3aa0ff;
        }
      `}</style>
    </main>
  );
}
