# Connecting accounts

Two things live here: how your product connects a user's Bluesky account without
ever showing them a Composio page, and how this deployment gets 180-day sessions
instead of 14-day ones.

---

## 1. Seamless connect from your own product

Drop one script tag in, call one function. No Composio SDK, no redirect to a
standalone page.

```html
<script src="https://bluesky.pmcosta.dev/connect.js"></script>

<button id="connect">Connect Bluesky</button>

<script>
  document.getElementById('connect').onclick = function () {
    connectBluesky({ userId: 'user_123' })
      .then(function (r) {
        console.log('connected', r.connectionId, r.status);
      })
      .catch(function (e) {
        console.warn(e.message);
      });
  };
</script>
```

`connectBluesky()` does all of this:

| Step | What happens |
| --- | --- |
| 1 | POSTs to `/api/connect/link`, which creates the Composio connection with `callback_url` pointing at `/connected` on this domain |
| 2 | Opens the returned authorization URL in a centered popup (falls back to a full redirect if popups are blocked) |
| 3 | Polls `/api/connect/status?connectionId=...` every 2s and reports each status through `onStatus` |
| 4 | Resolves when Composio reports `ACTIVE`, closes the popup, and fires a `bluesky:connected` window event |
| 5 | Rejects on `EXPIRED` / `FAILED`, on a 10-minute timeout, or if the user closes the window early |

Options: `userId`, `authConfigId`, `popup` (`false` redirects the current tab),
`onStatus`, `timeoutMs`, `pollIntervalMs`.

If you would rather call the endpoints yourself:

```
POST /api/connect/link      { userId?, authConfigId? }
  -> { redirectUrl, connectionId, callbackUrl }

GET  /api/connect/status?connectionId=...
  -> { connectionId, status, toolkit }   status ACTIVE means done
```

Both send CORS headers. Restrict them with `CONNECT_ALLOWED_ORIGINS` once you
know your product's domains, otherwise any site can ask this deployment to start
a connection.

### Why not the Composio dashboard button

The landing page is fixed by the `callback_url` passed when the connection is
**created**. The dashboard passes its own, so dashboard-initiated connections
always end on `dashboard.composio.dev`. Creating the connection yourself is the
only way to land the user back in your product.

---

## 2. Confidential client: 180-day sessions

atproto caps **public** clients at 14 days per refresh token, so every connected
account would need re-authorising every fortnight. A **confidential** client
signs a `private_key_jwt` assertion at the token endpoint and gets up to 180
days.

Set at least one ES256 (EC P-256) private key as single-line JWK JSON:

```
BLUESKY_PRIVATE_KEY_1={"kty":"EC","crv":"P-256","alg":"ES256",...,"d":"..."}
BLUESKY_PRIVATE_KEY_2=   # optional, for rotation
BLUESKY_PRIVATE_KEY_3=   # optional
```

With none set, the server stays a public client and keeps working, just with the
14-day cap. Nothing else needs changing: `/client-metadata.json` switches
`token_endpoint_auth_method` to `private_key_jwt` and starts advertising
`jwks_uri`, and `/jwks.json` serves the public halves.

Generate a key with Node:

```bash
node -e "const {generateKeyPairSync}=require('crypto');const {privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});const j=privateKey.export({format:'jwk'});j.alg='ES256';j.use='sig';j.kid='bsky-1';console.log(JSON.stringify(j))"
```

Verify which mode is live:

```
GET /api/oauth/session?key=<first 12 chars of OAUTH_SIGNING_SECRET>
  -> { clientMode: "confidential", signingKeys: 1, sessionLifetime: "up to 180 days..." }
```

Existing sessions keep the lifetime they were issued under. Reconnect an account
(or `?did=...&reset=1`) to move it onto the longer one.

### Rotation

Add the new key as `BLUESKY_PRIVATE_KEY_2`, deploy, wait for PDSes to re-fetch
`/jwks.json` (cached 5 minutes), then remove the old one and renumber.

### The dependency trap

Do not add `@atproto/jwk-jose` as a direct dependency. Two copies of
`@atproto/jwk` end up in `node_modules`, a `JoseKey` from one is not an
`instanceof` the `Key` class the other checks against, the keyset silently ends
up empty, and client construction fails with "requires at least one ES256
signing key with a kid". `JoseKey` is imported from `@atproto/oauth-client-node`,
which re-exports it from its own resolved copy, and `package.json` pins
`@atproto/jwk` through `overrides`.
