# Security policy

## Reporting a vulnerability

Email **me@pmcosta.dev** with the details. Please do not open a public issue for
anything exploitable.

Include what you did, what happened, and what you expected. A proof of concept
helps but is not required. I will acknowledge within a few days and credit you in
the fix unless you would rather stay anonymous.

## What this server holds

Worth knowing before you look for problems:

- **No passwords.** There is no code path that accepts a Bluesky password or app
  password. Any that appears to is a bug worth reporting.
- **Access tokens issued by this server carry only a DID.** They are encrypted and
  are pointers, not credentials.
- **Bluesky tokens and their DPoP private keys live in Redis**, keyed by DID, and
  never leave the server.
- **Client signing keys come from environment variables** and are never written to
  disk or logged.

So the interesting attack surface is: forging or replaying a token this server
issued, reaching another account's session, bypassing the PKCE or redirect_uri
checks at `/api/oauth/authorize` and `/api/oauth/token`, or getting the admin
diagnostics at `/api/oauth/session` to answer without a valid `ADMIN_TOKEN`.

## Deploying safely

If you run your own copy:

| Do | Why |
| --- | --- |
| Set `ADMIN_TOKEN` to a random value unrelated to `OAUTH_SIGNING_SECRET` | It gates a diagnostics endpoint that can delete stored sessions. Left unset, that endpoint is disabled, which is the safe default. |
| Set `CONNECT_ALLOWED_ORIGINS` | Without it, any origin can ask your deployment to start a Composio connection. |
| Keep `OAUTH_SIGNING_SECRET` secret and stable | Rotating it invalidates every token this server has issued. |
| Use ES256 signing keys | Enables the confidential client, and 180-day sessions instead of 14-day ones. |
| Never commit a `.env` file | `.gitignore` covers it; do not fight that. |

## Scope

Out of scope: vulnerabilities in Bluesky, the AT Protocol, or Vercel themselves
(report those upstream), and findings that require an attacker to already hold the
victim's environment variables.
