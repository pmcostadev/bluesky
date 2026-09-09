# Contributing

Issues and pull requests are welcome. This is public domain software; anything you
contribute goes into the public domain too.

## Getting it running

```bash
npm install
cp .env.example .env.local   # fill in the required values
npm run dev
```

You need a Redis/KV store even locally, because atproto refresh tokens are
single-use and rotate on every refresh, so sessions cannot live in memory across
requests. A free Upstash database is enough.

One catch: `OAUTH_PUBLIC_ORIGIN` becomes your OAuth `client_id`, and Bluesky
fetches it over the network. `localhost` is accepted for development, but for a
realistic end-to-end test you need a public https origin (a tunnel or a preview
deployment).

Before opening a PR:

```bash
npx tsc --noEmit
npm run build
```

CI runs both.

## Things worth knowing before you change the OAuth layer

These cost real debugging time. They are not obvious from reading the code.

**Do not add `@atproto/jwk-jose` as a direct dependency.** npm then resolves two
copies of `@atproto/jwk`, a `JoseKey` built from one is not an `instanceof` the
`Key` class the other checks against, the keyset silently ends up empty, and
client construction fails claiming no ES256 key was provided. `JoseKey` is
imported from `@atproto/oauth-client-node`, which re-exports it from its own
resolved copy, and `package.json` pins `@atproto/jwk` through `overrides`.

**Never derive a guard from `OAUTH_SIGNING_SECRET`.** An earlier version accepted
the first 12 characters of it as an admin key, which put a fragment of a signing
secret into URLs, browser history, and screenshots. Use `ADMIN_TOKEN`.

**Every scope list must come from `BSKY_SCOPE`.** Hardcoding a narrower list in
the authorization-server metadata, the DCR response, or the token response makes
clients see a partial grant and quietly lose capability, most visibly DMs.

**`popup.closed` lies.** Composio's pages send `Cross-Origin-Opener-Policy:
same-origin`, which permanently severs the opener relationship: `window.opener`
becomes null in the popup, and the opener's handle reports `closed === true` on a
window that is still open. Never treat either as evidence. Poll the server.

**Changing the requested scope does not affect existing accounts.** A stored
session keeps the scope it was granted until it is deleted and re-authorized. Use
the diagnostics endpoint (`ADMIN_TOKEN` required) to inspect or clear one.

## What is intentionally missing

Please do not add these back:

- Password or app-password authentication, in any form
- Account creation, deactivation, or deletion
- App-password management or invite-code tools
- PDS admin operations

The point of this server is that it holds a revocable, scope-limited grant and
nothing more. A larger tool surface at the cost of that is not an improvement.

## Style

Match what is there: TypeScript, no semicolon-free experiments, comments that
explain *why* rather than restating the code. If a line exists because of a
specific failure, say which failure.

## Security

Do not open a public issue for anything exploitable. See [SECURITY.md](./SECURITY.md).
