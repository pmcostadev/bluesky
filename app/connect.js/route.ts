import { corsHeaders, preflight } from '@/cors';

export const runtime = 'nodejs';

/**
 * A drop-in browser helper, so a host product needs no Composio code at all:
 *
 *   <script src="https://bluesky.pmcosta.dev/connect.js"></script>
 *   <button onclick="connectBluesky({ userId: 'user_123' })">Connect Bluesky</button>
 *
 * connectBluesky() creates the connection, opens the OAuth popup, polls until
 * Composio reports ACTIVE, and resolves. It never sends the user to a
 * standalone connect page.
 *
 * ---
 * Cross-Origin-Opener-Policy shapes this whole file. Composio's pages send
 * COOP: same-origin, which severs the opener relationship mid-flow. Two
 * consequences, both of which used to break this helper:
 *
 *   1. The popup's window.opener becomes null, so its postMessage never
 *      arrives. The callback page therefore closes itself and also announces
 *      over BroadcastChannel; postMessage is now only a bonus path.
 *   2. Our handle to the popup is disowned, and popup.closed starts reporting
 *      true while the window is still open. Treating that as "user closed the
 *      window" produced a false failure on a connection that was succeeding.
 *
 * The server-side status poll is the only authority here, and the ONLY thing
 * that resolves this promise as connected. Neither the popup closing nor an
 * announcement from the callback page is treated as proof: both can happen
 * while the account is still INITIALIZING, and reporting success then leaves the
 * user believing they connected when no usable account exists.
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
  var CHANNEL = 'bluesky-mcp-connect';
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
  // Resolves ONLY when Composio reports the account ACTIVE.
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

      // Without an id there is nothing to verify against, and guessing is how
      // an unfinished connection gets reported as done. Fail loudly instead.
      if (!connectionId) {
        try {
          popup.close();
        } catch (e) {
          // disowned
        }
        return Promise.reject(
          new Error(
            'Composio did not return a connection id, so completion cannot be verified. Check COMPOSIO_AUTH_CONFIG_ID on the server.'
          )
        );
      }

      return new Promise(function (resolve, reject) {
        var settled = false;
        var deadline = Date.now() + timeoutMs;
        var timer = null;
        var channel = null;

        function schedule(delay) {
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(poll, delay);
        }

        function announced(data) {
          if (!data || data.source !== 'bluesky-mcp') return;
          // The callback page reached our domain. That is a hint to check now,
          // not evidence of success.
          schedule(0);
        }

        function onMessage(event) {
          if (event.origin !== ORIGIN) return;
          announced(event.data);
        }

        try {
          channel = new BroadcastChannel(CHANNEL);
          channel.onmessage = function (event) {
            announced(event.data);
          };
        } catch (e) {
          // BroadcastChannel unsupported; polling covers it
        }

        function cleanup() {
          settled = true;
          if (timer) window.clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          if (channel) {
            try {
              channel.close();
            } catch (e) {
              // already closed
            }
          }
          // The callback page closes itself. This is a best-effort tidy-up, and
          // is expected to fail silently once COOP has disowned the handle.
          try {
            if (popup && !popup.closed) popup.close();
          } catch (e) {
            // disowned popup
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

        function poll() {
          if (settled) return;

          checkStatus(connectionId).then(function (status) {
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

        window.addEventListener('message', onMessage);
        schedule(intervalMs);
      });
    });
  }

  window.connectBluesky = connectBluesky;
})();
`;
