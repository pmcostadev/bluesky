import { corsHeaders, preflight } from '@/cors';

export const runtime = 'nodejs';

/**
 * A drop-in browser helper, so a host product needs no Composio code at all:
 *
 *   <script src="https://bluesky.pmcosta.dev/connect.js"></script>
 *   <button onclick="connectBluesky({ userId: 'user_123' })">Connect Bluesky</button>
 *
 * connectBluesky() creates the connection, opens the OAuth popup, polls until
 * Composio reports ACTIVE, closes the popup, and resolves. It never sends the
 * user to a standalone connect page.
 */

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
  const script = SCRIPT.replace(/%ORIGIN%/g, origin(req));

  return new Response(script, {
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

const SCRIPT = `/* Bluesky MCP connect helper. Served from %ORIGIN%/connect.js */
(function () {
  'use strict';

  var ORIGIN = '%ORIGIN%';
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
      'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
        ',toolbar=no,menubar=no,location=no,status=no'
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

  function checkStatus(connectionId) {
    return fetch(
      ORIGIN + '/api/connect/status?connectionId=' + encodeURIComponent(connectionId),
      { cache: 'no-store' }
    )
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
  function connectBluesky(options) {
    var opts = options || {};
    var timeoutMs = opts.timeoutMs || 10 * 60 * 1000;
    var intervalMs = opts.pollIntervalMs || 2000;
    var notify = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};

    return startLink(opts).then(function (link) {
      var connectionId = link.connectionId;

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

      return new Promise(function (resolve, reject) {
        var settled = false;
        var deadline = Date.now() + timeoutMs;
        var closedAt = null;
        var timer = null;

        function cleanup() {
          settled = true;
          if (timer) window.clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          try {
            if (popup && !popup.closed) popup.close();
          } catch (e) {
            // cross-origin popup; it closes itself
          }
        }

        function succeed(status) {
          if (settled) return;
          cleanup();
          var result = { connectionId: connectionId, status: status };
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

        function onMessage(event) {
          if (event.origin !== ORIGIN) return;
          var data = event.data || {};
          if (data.source !== 'bluesky-mcp') return;
          // A fast path only: the callback page says it is done, but Composio is
          // the source of truth, so still confirm with a status check.
          if (!connectionId) {
            succeed(data.status === 'failed' ? 'UNKNOWN' : 'ACTIVE');
            return;
          }
          poll(true);
        }

        function poll(immediate) {
          if (settled) return;

          if (!connectionId) {
            // Nothing to poll; rely on the popup closing itself.
            if (popup.closed) return succeed('UNKNOWN');
            timer = window.setTimeout(poll, intervalMs);
            return;
          }

          checkStatus(connectionId).then(function (status) {
            if (settled) return;
            notify(status);

            if (TERMINAL_OK.indexOf(status) !== -1) return succeed(status);
            if (TERMINAL_BAD.indexOf(status) !== -1) {
              return fail('The connection ended as ' + status + '. Nothing was saved; try again.');
            }

            if (popup.closed) {
              // Give the callback a grace period: the window can close a beat
              // before Composio flips the record to ACTIVE.
              if (closedAt === null) closedAt = Date.now();
              if (Date.now() - closedAt > 15000) {
                return fail('The authorization window was closed before the connection completed.');
              }
            }

            if (Date.now() > deadline) {
              return fail('The connection was not completed in time. Start it again.');
            }

            timer = window.setTimeout(poll, intervalMs);
          });
        }

        window.addEventListener('message', onMessage);
        timer = window.setTimeout(poll, immediate ? 0 : intervalMs);
      });
    });
  }

  window.connectBluesky = connectBluesky;
})();
`;
