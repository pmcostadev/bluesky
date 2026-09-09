import { corsHeaders, preflight } from '@/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A drop-in browser helper, so a host product needs no Composio code at all:
 *
 *   <script src="https://bluesky.pmcosta.dev/connect.js"></script>
 *   <button onclick="connectBluesky({ userId: 'user_123' })">Connect Bluesky</button>
 *
 * connectBluesky() creates the connection, opens the OAuth popup, polls until
 * Composio reports ACTIVE, and resolves.
 *
 * ---
 * Served with no-store. This file is embedded by other sites, so a cached copy
 * means a deploy silently does nothing for everyone holding the old one: you
 * change the code, redeploy, retest, and watch the previous version's behaviour.
 * It is a few hundred bytes; correctness beats the cache hit.
 *
 * ---
 * Cross-Origin-Opener-Policy shapes this whole file. Composio's pages send
 * COOP: same-origin, which severs the opener relationship mid-flow. Two
 * consequences, both of which used to break this helper:
 *
 *   1. The popup's window.opener becomes null, so a postMessage from it never
 *      arrives.
 *   2. Our handle to the popup is disowned, and popup.closed starts reporting
 *      true while the window is still open. Treating that as "user closed the
 *      window" produced a false failure on a connection that was succeeding.
 *
 * The server-side status poll is therefore the only authority, and the only
 * thing that resolves this promise as connected.
 *
 * Polling sends BOTH the connection id and the user id, because the id returned
 * when the link is created is not always the id the connected account ends up
 * with. Sending only the id meant every poll came back unresolved on an account
 * that was already ACTIVE, and the caller's spinner ran forever.
 */

/** Bump when the script body changes, so a stale copy is identifiable. */
const HELPER_VERSION = '4';

function origin(req: Request): string {
  const explicit = process.env.OAUTH_PUBLIC_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return proto + '://' + host;
}

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request) {
  const script = SCRIPT.replace(/%ORIGIN%/g, origin(req)).replace(/%VERSION%/g, HELPER_VERSION);

  return new Response(script, {
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Pragma: 'no-cache'
    }
  });
}

const SCRIPT = `/* Bluesky MCP connect helper v%VERSION%. Served from %ORIGIN%/connect.js */
(function () {
  'use strict';

  var ORIGIN = '%ORIGIN%';
  var VERSION = '%VERSION%';
  var TERMINAL_OK = ['ACTIVE'];
  var TERMINAL_BAD = ['EXPIRED', 'FAILED', 'DELETED', 'INACTIVE'];

  function centeredPopup(url) {
    var w = 520;
    var h = 720;
    var dualLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    var dualTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    var width = window.innerWidth || document.documentElement.clientWidth || screen.width;
    var height = window.innerHeight || document.documentElement.clientHeight || screen.height;
    var left = (width - w) / 2 + dualLeft;
    var top = (height - h) / 2 + dualTop;
    return window.open(
      url,
      'bluesky-connect',
      'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top
    );
  }

  function startLink(opts) {
    var payload = {};
    if (opts.userId) payload.userId = opts.userId;
    if (opts.authConfigId) payload.authConfigId = opts.authConfigId;

    return fetch(ORIGIN + '/api/connect/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = {};
        try {
          body = JSON.parse(text);
        } catch (e) {
          // non-JSON error page
        }
        if (!res.ok) {
          throw new Error(body.message || body.detail || body.error || 'Could not start the connection.');
        }
        if (!body.redirectUrl) throw new Error('The server did not return an authorization URL.');
        return body;
      });
    });
  }

  function checkStatus(connectionId, userId) {
    var q = [];
    if (connectionId) q.push('connectionId=' + encodeURIComponent(connectionId));
    if (userId) q.push('userId=' + encodeURIComponent(userId));

    return fetch(ORIGIN + '/api/connect/status?' + q.join('&'), { cache: 'no-store' })
      .then(function (res) {
        return res.json();
      })
      .then(function (body) {
        return typeof body.status === 'string' ? body.status.toUpperCase() : 'UNKNOWN';
      })
      .catch(function () {
        return 'UNKNOWN';
      });
  }

  //
  // Connect a Bluesky account.
  //
  //   connectBluesky({
  //     userId: 'user_123',      your own user id; Composio keys the account to it
  //     authConfigId: 'ac_...',  optional, defaults to the server's configured one
  //     popup: true,             false redirects the current tab instead
  //     onStatus: function (s) {},
  //     timeoutMs: 600000,
  //     pollIntervalMs: 2000
  //   })
  //     .then(function (result) { /* result.connectionId, result.status */ })
  //     .catch(function (err) {});
  //
  // Resolves ONLY when Composio reports the account ACTIVE.
  //
  function connectBluesky(options) {
    var opts = options || {};
    var timeoutMs = opts.timeoutMs || 10 * 60 * 1000;
    var intervalMs = opts.pollIntervalMs || 2000;
    var notify = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};

    return startLink(opts).then(function (link) {
      var connectionId = link.connectionId || null;
      var userId = link.userId || opts.userId || null;

      if (opts.popup === false) {
        window.location.href = link.redirectUrl;
        return new Promise(function () {});
      }

      var popup = centeredPopup(link.redirectUrl);
      if (!popup) {
        // Popup blocked: fall back to a full redirect rather than dead-ending.
        window.location.href = link.redirectUrl;
        return new Promise(function () {});
      }

      notify('INITIALIZING');

      // With neither identifier there is nothing to verify against, and guessing
      // is how an unfinished connection gets reported as done.
      if (!connectionId && !userId) {
        try {
          popup.close();
        } catch (e) {
          // disowned
        }
        return Promise.reject(
          new Error('No connection id or user id to verify against, so completion cannot be confirmed.')
        );
      }

      return new Promise(function (resolve, reject) {
        var settled = false;
        var deadline = Date.now() + timeoutMs;
        var timer = null;

        function schedule(delay) {
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(poll, delay);
        }

        function cleanup() {
          settled = true;
          if (timer) window.clearTimeout(timer);
          // Composio's own page closes the popup. This is a best-effort tidy-up,
          // expected to fail silently once COOP has disowned the handle.
          try {
            if (popup && !popup.closed) popup.close();
          } catch (e) {
            // disowned popup
          }
        }

        function succeed(status) {
          if (settled) return;
          cleanup();
          var result = { connectionId: connectionId, status: status, helperVersion: VERSION };
          try {
            window.dispatchEvent(new CustomEvent('bluesky:connected', { detail: result }));
          } catch (e) {
            // older browsers
          }
          resolve(result);
        }

        function fail(message) {
          if (settled) return;
          cleanup();
          reject(new Error(message));
        }

        function poll() {
          if (settled) return;

          checkStatus(connectionId, userId).then(function (status) {
            if (settled) return;
            notify(status);

            if (TERMINAL_OK.indexOf(status) !== -1) return succeed(status);
            if (TERMINAL_BAD.indexOf(status) !== -1) {
              return fail('The connection ended as ' + status + '. Nothing was saved; try again.');
            }

            // popup.closed is deliberately not consulted: after COOP severance
            // it reports true on a window that is still open and mid-consent.
            if (Date.now() > deadline) {
              return fail('The connection was not completed in time. Start it again.');
            }

            schedule(intervalMs);
          });
        }

        schedule(1500);
      });
    });
  }

  connectBluesky.version = VERSION;
  window.connectBluesky = connectBluesky;
})();
`;
