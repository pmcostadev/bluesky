# Bluesky MCP Server

A Model Context Protocol (MCP) server that provides comprehensive Bluesky/AT Protocol access for AI assistants. Built in TypeScript, deployed on Vercel, and fully compatible with the **MCP Streamable HTTP transport** (protocol version `2025-03-26`).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ravishka17/Bluesky-MCP)

## Features

- **Post Operations** — Create posts, get posts, view likes and reposts
- **Feed Management** — Timeline, custom feeds, author feeds
- **Search Engine** — Search posts and users/actors
- **Profile Access** — View profiles, follower counts, bios (single and batch)
- **Thread Viewing** — Explore post threads and conversations
- **Bookmarks** — Create, delete, and list private bookmarks
- **Age Assurance** — Begin flow, get config and state
- **Secure Credential Management** — Credentials injected per-request via headers, never stored
- **Streamable HTTP** — Full MCP transport support (POST + GET + OPTIONS)
- **Multi-client Auth** — Three credential methods for different MCP clients
- **Vercel Ready** — Stateless serverless deployment

---

## Quick Start

### 1. Deploy to Vercel

Click the button above, or clone and deploy manually:

```bash
git clone https://github.com/Ravishka17/Bluesky-MCP.git
cd Bluesky-MCP
vercel
```

### 2. Create a Bluesky App Password

1. Log in to Bluesky
2. Go to **Settings → App Passwords**
3. Create a new app password
4. Note your handle (e.g. `yourname.bsky.social`) and the generated password

### 3. Connect Your AI Client

**MCP endpoint:** `https://your-app.vercel.app/mcp`

---

## Authentication

Credentials are **never stored** on the server. They are sent per-request via HTTP headers and held in memory only for the duration of that request.

Three credential methods are supported, with the following priority order:

### Method 1 — Two Separate Headers
Best for: HuggingChat, curl, any client supporting custom headers.

| Header | Value |
|--------|-------|
| `X-BLUESKY-IDENTIFIER` | Your handle or email |
| `X-BLUESKY-PASSWORD` | Your app password |

```bash
curl -X POST https://your-app.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -H "X-BLUESKY-IDENTIFIER: yourname.bsky.social" \
  -H "X-BLUESKY-PASSWORD: your-app-password" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Method 2 — Single Combined Header
Best for: Mistral Vibe CLI, clients with one `api_key_header` field.

Format: `handle:app-password` (splits on the first colon only, so passwords containing colons are safe)

```
X-BLUESKY-CREDENTIALS: yourname.bsky.social:your-app-password
```

### Method 3 — Authorization Bearer
Best for: MCP Playground, OpenAI-compatible clients, any tool using the `Authorization` header.

```
Authorization: Bearer yourname.bsky.social:your-app-password
```

---

## Client Configuration

### HuggingChat

In the **Add MCP Server** dialog, expand **HTTP Headers** and add:

| Header name | Value |
|-------------|-------|
| `X-BLUESKY-IDENTIFIER` | `yourname.bsky.social` |
| `X-BLUESKY-PASSWORD` | `your-app-password` |

### Claude Desktop

```json
{
  "mcpServers": {
    "bluesky": {
      "type": "http",
      "url": "https://your-app.vercel.app/mcp",
      "headers": {
        "X-BLUESKY-IDENTIFIER": "yourname.bsky.social",
        "X-BLUESKY-PASSWORD": "your-app-password"
      }
    }
  }
}
```

### Claude Code / CLI

```bash
claude mcp add bluesky --transport http https://your-app.vercel.app/mcp
```

### Mistral Vibe (`~/.vibe/config.toml`)

```toml
[[mcp_servers]]
name = "bluesky"
transport = "streamable-http"
url = "https://your-app.vercel.app/mcp"
api_key_env = "BLUESKY_CREDENTIALS"
api_key_header = "X-BLUESKY-CREDENTIALS"
api_key_format = "{}"
```

Then set in `~/.vibe/.env`:
```
BLUESKY_CREDENTIALS=yourname.bsky.social:your-app-password
```

### YAML-based clients (config.yaml)

For tools like **Hermes Agent** (Nous Research) and other YAML-configured MCP clients:

```yaml
mcp_servers:
  bluesky:
    url: https://your-app.vercel.app/mcp
    headers:
      X-BLUESKY-CREDENTIALS: "${BLUESKY_CREDENTIALS}"
```

Set in your shell or `.env` file:
```
BLUESKY_CREDENTIALS=yourname.bsky.social:your-app-password
```

**Hermes Agent** example (`config.yaml`):
```yaml
mcp_servers:
  bluesky:
    url: https://your-app.vercel.app/mcp
    headers:
      X-BLUESKY-CREDENTIALS: "${BLUESKY_CREDENTIALS}"
```

### MCP Playground

- **Remote Server URL:** `https://your-app.vercel.app/mcp`
- **Auth Header:** `Bearer yourname.bsky.social:your-app-password`

### Generic MCP Client

Configure transport type `streamable-http` with the endpoint URL and any of the three auth methods above.

---

## MCP Tools

### Post Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `create_post` | Create a new post (max 300 chars, optional reply/lang) | ✅ |
| `get_posts` | Fetch specific posts by URI (up to 25) | ❌ |
| `get_likes` | Get users who liked a post | ❌ |
| `get_reposted_by` | Get users who reposted a post | ❌ |
| `like_post` | Like a post | ✅ |
| `repost_post` | Repost a post | ✅ |

### Feed Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `get_timeline` | Get home timeline (followed accounts) | ✅ |
| `get_feed` | Get posts from a feed generator (at:// URI) | ❌ |
| `get_author_feed` | Get posts by a specific user | ❌ |
| `get_thread` | Get post thread with replies and parents | ❌ |

### Profile Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `get_profile` | Get detailed profile for a single user | ❌ |
| `get_profiles` | Get profiles for multiple users (batch, up to 25) | ❌ |
| `get_suggestions` | Get suggested users to follow | ✅ |

### Search Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `search_posts` | Search posts by keyword, author, lang, mentions | ❌ |
| `search_actors` | Search for users by name or handle | ❌ |
| `search_actors_typeahead` | Autocomplete user search | ❌ |

### Account Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `get_preferences` | Get account preferences and content filters | ✅ |
| `update_email` | Update the email address associated with the account | ✅ |

### Server / Account Management Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `admin_send_email` | Send an email as a PDS admin | ✅ |
| `confirm_email` | Confirm an email address using a verification token | ✅ |
| `create_account` | Create a new Bluesky/AT Protocol account | ❌ |
| `create_app_password` | Create a new app password for the account | ✅ |
| `create_invite_code` | Create a single invite code | ✅ |
| `create_invite_codes` | Create multiple invite codes at once | ✅ |
| `create_session` | Create an authentication session (login) | ❌ |
| `deactivate_account` | Deactivate the authenticated account | ✅ |
| `delete_account` | Permanently delete the authenticated account | ✅ |
| `delete_session` | Invalidate the current session | ✅ |
| `describe_server` | Get PDS server information | ❌ |
| `get_account_invite_codes` | Get invite codes for the account | ✅ |
| `get_service_auth` | Get a signed JWT for service auth | ✅ |
| `get_session` | Get current session details | ✅ |
| `list_app_passwords` | List all app passwords | ✅ |
| `refresh_session` | Refresh session tokens | ✅ |

### Bookmark Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `create_bookmark` | Save a post as a private bookmark | ✅ |
| `delete_bookmark` | Remove a bookmark by URI | ✅ |
| `get_bookmarks` | List all private bookmarks | ✅ |

### Age Assurance Operations

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `begin_age_assurance` | Initiate the age assurance flow | ✅ |
| `get_age_assurance_config` | Get age assurance provider config | ✅ |
| `get_age_assurance_state` | Get current age assurance status | ✅ |

### Utility

| Tool | Description | Auth Required |
|------|-------------|:---:|
| `test_connectivity` | Test connection and check auth status | ❌ |

---

## MCP Prompts

| Prompt | Description |
|--------|-------------|
| `bluesky_usage_guide` | Comprehensive guide for Bluesky tasks |
| `search_posts_template` | Template for searching posts |
| `compose_post` | Template for composing posts |

---

## Verify Deployment

```bash
# Health check
curl https://your-app.vercel.app/health

# Check available auth methods
curl https://your-app.vercel.app/mcp

# Test MCP initialize
curl -X POST https://your-app.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

---

## Security

1. **Credentials never stored** — not in Vercel env vars, not in git, not on disk
2. **Per-request injection** — credentials are passed in headers and held in memory only for that request
3. **Three auth methods** — flexible for any client without compromising security
4. **Input sanitization** — all inputs validated and sanitized before hitting the Bluesky API
5. **Rate limiting** — tiered limits for read vs write operations
6. **Security headers** — X-Frame-Options, X-Content-Type-Options, etc.

---

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build
```

For local development, credentials can be passed via headers in every request. No env vars needed.

---

## Architecture

```
Bluesky-MCP/
├── app/
│   ├── mcp/route.ts        # MCP endpoint — credential extraction + transport
│   ├── health/route.ts     # Health check
│   ├── layout.tsx
│   └── page.tsx
├── src/
│   ├── mcp-server.ts       # MCP server — tool routing, credential injection
│   ├── bluesky-client.ts   # Bluesky API client (all methods)
│   ├── handlers.ts         # Tool handlers
│   ├── toolDefinitions.ts  # Tool schemas
│   ├── sanitize.ts         # Input sanitization
│   ├── middleware.ts       # Rate limiting, security headers
│   ├── types.ts            # TypeScript types
│   └── utils.ts            # Utilities
├── vercel.json
└── package.json
```

---

## License

This project is released into the public domain under [The Unlicense](./UNLICENSE).

This is free and unencumbered software. Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, for any purpose, commercial or non-commercial, and by any means, without any conditions or restrictions.
