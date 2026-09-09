# Bluesky MCP Server

An MCP server that gives an AI assistant access to a Bluesky account through **AT Protocol OAuth**, with no password anywhere in the system.

Most social MCP servers ask the user for an app password and forward it on every call. This one implements the atproto OAuth profile end to end (DPoP, PAR, PKCE, `private_key_jwt`), so the server holds a revocable, scope-limited grant instead of a credential. App passwords are rejected outright.

TypeScript, deployed on Vercel, MCP Streamable HTTP transport.

---

## Why this exists

AT Protocol OAuth is meaningfully harder than ordinary OAuth 2, and the difficulty is why most integrations skip it:

| Requirement | What it means here |
| --- | --- |
| **No central provider** | Every account lives on its own PDS. Authorization starts by resolving a handle or host to the right authorization server. |
| **DPoP** | Every API call is signed with a key bound to the token. A stolen token is useless without the key. |
| **Single-use refresh tokens** | Tokens rotate on every refresh, so sessions need real storage and a lock. Two concurrent refreshes will kill a session. |
| **`client_id` is a URL** | There is no app registration. A hosted metadata document *is* the client identity. |
| **Confidential clients** | Public clients are capped at 14-day sessions. Signed client assertions raise that to 180 days. |
| **Service proxying** | DMs live on a different service from the AppView, and each lexicon must be proxied to the right one. |

All of that is handled. The result is a server that a non-developer can connect in two clicks and revoke from Bluesky settings at any time.

---

## What it does

- **42 tools** covering posts, feeds, threads, search, profiles, follows, likes, reposts, bookmarks, drafts, preferences, notifications, and direct messages
- **OAuth only** — password login, account creation, app-password management, invite codes, and admin/destructive account operations are deliberately absent
- **DMs** via `transition:chat.bsky`, proxied to the chat service rather than the AppView
- **Dynamic Client Registration** so MCP clients register themselves with no manual setup
- **Zero-input sign-in** — users are sent straight to their PDS login; no handle to type
- **Drop-in connect helper** (`/connect.js`) for embedding the flow in another product

---

## Architecture

The server wears two hats, which is the part worth reading if you are here for the code:

```
MCP client  ──OAuth──▶  this server  ──OAuth──▶  user's PDS
(Composio,               (authorization         (bsky.social
 Claude, ...)             server + client)       or self-hosted)
```

To the MCP client it is an **authorization server**: it implements RFC 8414 metadata, RFC 7591 dynamic registration, PKCE, and issues its own opaque tokens.

To Bluesky it is an **OAuth client**: it publishes client metadata at a public URL, signs client assertions with an ES256 keyset, and holds DPoP-bound sessions in Redis.

The tokens it issues are pointers to a DID. The real Bluesky session never leaves server-side storage.

```
app/
  mcp/                     MCP endpoint (Streamable HTTP)
  api/oauth/
    metadata/              RFC 8414 authorization server metadata
    register/              RFC 7591 dynamic client registration
    authorize/             identity resolution + PAR handoff
    callback/              token exchange, DPoP verification
    token/                 our own token issuance
    session/               administrative diagnostics
  client-metadata.json/    our client identity, as seen by Bluesky
  jwks.json/               public half of the signing keyset
  api/connect/             optional Composio connection helpers
src/
  oauth/
    client.ts              OAuth client, keyset, public/confidential mode
    store.ts               Redis session + state stores, refresh lock
    resolve.ts             bearer token -> live DPoP session
    adopt.ts               DPoP bridge + per-lexicon service proxying
    seal.ts                encrypted, stateless token sealing
  bluesky-client.ts        AT Protocol calls
  handlers.ts              tool implementations
  toolDefinitions.ts       tool schemas
```

---

## Deploy your own

```bash
git clone https://github.com/pmcostadev/bluesky.git
cd bluesky
npm install
vercel
```

Attach a Redis/KV store to the project, then set:

| Variable | Purpose |
| --- | --- |
| `OAUTH_PUBLIC_ORIGIN` | Public https origin. It forms the `client_id`, so it must be the domain users reach. |
| `OAUTH_SIGNING_SECRET` | 32+ random chars. Encrypts the tokens this server issues. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Session storage. Set automatically by the Vercel KV integration. |
| `BLUESKY_PRIVATE_KEY_1` | ES256 private key as single-line JWK. Optional, but without it sessions expire every 14 days. |

Full list and generation commands in [`.env.example`](./.env.example). Connection-flow details in [`CONNECT.md`](./CONNECT.md).

Verify it came up correctly:

```bash
curl https://your-domain/client-metadata.json   # token_endpoint_auth_method
curl https://your-domain/jwks.json              # your public signing keys
```

---

## Connect an account

Any MCP client that speaks OAuth can register itself and connect. Point it at:

```
https://your-domain/mcp
```

To embed the flow in your own product, one script tag replaces the whole integration:

```html
<script src="https://your-domain/connect.js"></script>
<button onclick="connectBluesky({ userId: 'user_123' })">Connect Bluesky</button>
```

It creates the connection, opens the consent popup, polls until the account is genuinely active, and resolves. See [`CONNECT.md`](./CONNECT.md).

---

## Security posture

- **No passwords, ever.** There is no code path that accepts a Bluesky password or app password.
- **Tokens are not credentials.** The tokens this server issues carry only a DID; Bluesky tokens and their DPoP keys stay in server-side storage.
- **DPoP-bound.** Every upstream call is signed with the key its token is bound to.
- **Least privilege.** Destructive and admin-only operations (delete account, deactivate, admin email, invite codes, app-password management) are not exposed as tools.
- **Revocable.** Users revoke access from Bluesky settings without touching this server.
- **Diagnostics are gated.** The administrative endpoint is disabled unless `ADMIN_TOKEN` is set, and that token is deliberately unrelated to the signing secret.

---

## Credits

This started as a fork of [Ravishka17/Bluesky-MCP](https://github.com/Ravishka17/Bluesky-MCP), which used app-password authentication. The authentication layer, tool surface, and transport have since been rewritten: OAuth replaced passwords entirely, and the tool list was audited down from 56 to 42 by removing operations that were impossible, destructive, or admin-only.

## License

Public domain under [The Unlicense](./UNLICENSE). Copy it, ship it, sell it, no conditions.
