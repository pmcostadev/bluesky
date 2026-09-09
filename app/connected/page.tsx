'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Landing page after a Composio connection completes.
 *
 * Composio appends ?status=success&connected_account_id=... (snake_case via
 * link(), camelCase via the legacy initiate()), so both spellings are read.
 *
 * ---
 * TWO hard-won rules govern this page.
 *
 * 1. Do not gate auto-close behind window.opener.
 *    Composio's pages send Cross-Origin-Opener-Policy: same-origin. When a popup
 *    navigates through a COOP document the browser severs the opener
 *    relationship permanently: window.opener is null here even though the window
 *    really was opened by script. Gating the close on it disabled the close in
 *    exactly the case it was written for.
 *
 * 2. Do not close until the connection is actually ACTIVE.
 *    `status=success` in this URL only means the redirect chain finished. The
 *    connected account can still be INITIALIZING for a moment afterwards, and
 *    closing during that window looked like success while leaving the account
 *    unusable. So this page polls the server and only closes once the status is
 *    terminal. Closing early is worse than closing late: the user walks away
 *    believing they connected.
 */

const CHANNEL = 'bluesky-mcp-connect';
const POLL_MS = 1200;
const GIVE_UP_MS = 90_000;

type View = 'checking' | 'connected' | 'failed';

export default function Connected() {
  const [view, setView] = useState<View>('checking');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const raw = (p.get('status') ?? '').toLowerCase();
    const id = p.get('connected_account_id') ?? p.get('connectedAccountId');
    setAccountId(id);

    /** Tell every listener that survives COOP, then close. */
    const finish = (outcome: View, status: string) => {
      if (done.current) return;
      done.current = true;
      setView(outcome);

      const payload = {
        source: 'bluesky-mcp',
        type: 'composio-connected',
        status,
        connectedAccountId: id
      };

      try {
        new BroadcastChannel(CHANNEL).postMessage(payload);
      } catch {
        // unsupported
      }
      try {
        window.localStorage.setItem(CHANNEL, JSON.stringify({ ...payload, at: Date.now() }));
      } catch {
        // storage blocked
      }
      try {
        window.opener?.postMessage(payload, '*');
      } catch {
        // opener severed
      }

      // A failed connection stays on screen: the user needs to read why.
      if (outcome === 'failed') return;

      // Give the announcements a tick to leave the page before it disappears.
      const attempt = () => {
        try {
          window.close();
        } catch {
          // not script-closable
        }
      };
      window.setTimeout(attempt, 150);
      window.setTimeout(attempt, 700);
      window.setTimeout(() => setStuck(true), 1800);
    };

    if (raw === 'failed') {
      setDetail('The authorization did not complete. Nothing was saved.');
      finish('failed', 'failed');
      return;
    }

    // No id to verify against: the redirect said what it said, and there is
    // nothing further we can check.
    if (!id) {
      finish('connected', raw || 'unknown');
      return;
    }

    let cancelled = false;
    const deadline = Date.now() + GIVE_UP_MS;

    (async () => {
      while (!cancelled && !done.current) {
        try {
          const res = await fetch(`/api/connect/status?connectionId=${encodeURIComponent(id)}`, {
            cache: 'no-store'
          });
          const body = await res.json();
          const status = String(body.status ?? 'UNKNOWN').toUpperCase();

          if (status === 'ACTIVE') return finish('connected', 'success');

          if (['EXPIRED', 'FAILED', 'DELETED', 'INACTIVE'].includes(status)) {
            setDetail(`The connection ended as ${status}. Nothing was saved, so you can try again.`);
            return finish('failed', 'failed');
          }
        } catch {
          // transient: keep polling
        }

        if (Date.now() > deadline) {
          setDetail(
            'This is taking longer than expected. The connection may still complete; check back in your app.'
          );
          return finish('failed', 'timeout');
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const failed = view === 'failed';

  return (
    <main className="wrap">
      <div className="card" data-state={view}>
        <div className="mark" aria-hidden="true">
          {failed ? '\u00d7' : view === 'checking' ? '\u00b7\u00b7\u00b7' : '\u2713'}
        </div>

        <h1>
          {failed ? 'Not connected' : view === 'checking' ? 'Finishing up' : 'Account connected'}
        </h1>

        <p className="lede">
          {failed
            ? (detail ?? 'The authorization did not complete, so you can safely try again.')
            : view === 'checking'
              ? 'Confirming your account with the server. This takes a moment.'
              : 'Your Bluesky account is authorized. The server can now act on your behalf.'}
        </p>

        {accountId && (
          <p className="meta">
            connection <code>{accountId}</code>
          </p>
        )}

        {view === 'connected' && (
          <p className="meta">{stuck ? 'You can close this window.' : 'Closing\u2026'}</p>
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
        .card[data-state='checking'] .mark {
          font-size: 20px;
          letter-spacing: 2px;
          color: #93a1b8;
          background: rgba(147, 161, 184, 0.1);
          border-color: rgba(147, 161, 184, 0.35);
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
