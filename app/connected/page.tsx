'use client';

import { useEffect, useState } from 'react';

/**
 * Landing page after a Composio connection completes.
 *
 * Composio appends ?status=success&connected_account_id=... (snake_case via
 * link(), camelCase via the legacy initiate()), so both spellings are read.
 *
 * ---
 * Why this page does NOT check window.opener before closing itself:
 *
 * Composio's pages send Cross-Origin-Opener-Policy: same-origin. When a popup
 * navigates through a COOP document, the browser severs the opener relationship
 * for the remaining life of that window: window.opener is null here even though
 * the window really was opened by script, and the opener's own handle to this
 * window starts reporting closed === true.
 *
 * Gating auto-close behind window.opener therefore disabled it in exactly the
 * case it was written for. Self-closing still works after severance, so this
 * page always attempts it, tells anyone listening through every channel that
 * survives, and only falls back to a manual button if the browser refuses.
 */

const CHANNEL = 'bluesky-mcp-connect';

export default function Connected() {
  const [status, setStatus] = useState<'success' | 'failed' | 'unknown'>('unknown');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const raw = (p.get('status') ?? '').toLowerCase();
    const resolved = raw === 'success' ? 'success' : raw === 'failed' ? 'failed' : 'unknown';
    const id = p.get('connected_account_id') ?? p.get('connectedAccountId');

    setStatus(resolved);
    setAccountId(id);

    const payload = {
      source: 'bluesky-mcp',
      type: 'composio-connected',
      status: raw || 'unknown',
      connectedAccountId: id
    };

    // 1. Same-origin openers and tabs. Survives COOP severance because it does
    //    not depend on a window handle.
    try {
      new BroadcastChannel(CHANNEL).postMessage(payload);
    } catch {
      // BroadcastChannel unsupported
    }

    // 2. Storage event, for same-origin listeners without BroadcastChannel.
    try {
      window.localStorage.setItem(CHANNEL, JSON.stringify({ ...payload, at: Date.now() }));
    } catch {
      // storage blocked
    }

    // 3. postMessage, for the cross-origin opener when it did survive.
    try {
      window.opener?.postMessage(payload, '*');
    } catch {
      // opener severed or cross-origin
    }

    // Then close. No opener check: see the note above.
    const attempt = () => {
      try {
        window.close();
      } catch {
        // not script-closable
      }
    };

    attempt();
    const retry = window.setTimeout(attempt, 400);
    // If we are still rendering after this, the browser refused to close us.
    const giveUp = window.setTimeout(() => setStuck(true), 1400);

    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(giveUp);
    };
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

        {stuck ? (
          <p className="meta">You can close this window.</p>
        ) : (
          <p className="meta">Closing\u2026</p>
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
      `}</style>
    </main>
  );
}
