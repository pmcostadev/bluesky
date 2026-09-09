import { BSKY_SCOPE, isConfidential } from '@/oauth/client';

/**
 * Landing page.
 *
 * Anyone who arrives here followed a link from the repository, an MCP client, or
 * a consent screen, and wants two answers: what is this, and is it safe to
 * connect. So the auth model is stated plainly and the specification table
 * reports live server facts rather than describing the server in the abstract.
 */

export const dynamic = 'force-dynamic';

const REPO = 'https://github.com/pmcostadev/bluesky';
const ENDPOINT = 'https://bluesky.pmcosta.dev/mcp';

export default function Home() {
  const confidential = isConfidential();
  const scopes = BSKY_SCOPE.split(/\s+/).filter(Boolean);

  return (
    <>
      <div className="shell">
        <section className="hero">
          <span className="label">Model Context Protocol server</span>
          <h1 className="display-xl">
            Bluesky
            <br />
            without a
            <br />
            password
          </h1>
          <p className="lede">
            Gives an AI assistant access to a Bluesky account through AT Protocol OAuth. You
            approve it on Bluesky itself, and you revoke it there. Nothing to paste, nothing
            stored.
          </p>

          <div className="chips">
            <span className="chip label-sm">42 tools</span>
            <span className="chip label-sm">OAuth only</span>
            <span className="chip label-sm">DPoP bound</span>
            <span className="chip label-sm">
              {confidential ? '180-day sessions' : '14-day sessions'}
            </span>
          </div>
        </section>

        <section className="section">
          <div className="section-label label">
            <span>01 &mdash; Connect a client</span>
            <span className="rule" />
          </div>

          <p className="body" style={{ marginBottom: 24 }}>
            Any MCP client that speaks OAuth registers itself: there is nothing to configure by
            hand and no credential to copy. Point it at this endpoint.
          </p>

          <code className="code-block">{ENDPOINT}</code>

          <p className="body" style={{ marginTop: 24 }}>
            It will ask your Bluesky server for{' '}
            {scopes.map((s, i) => (
              <span key={s}>
                <code className="inline">{s}</code>
                {i < scopes.length - 1 ? ' ' : ''}
              </span>
            ))}
            . The third one is what makes direct messages work.
          </p>
        </section>

        <section className="section">
          <div className="section-label label">
            <span>02 &mdash; What it holds</span>
            <span className="rule" />
          </div>

          <div className="grid grid-3">
            <article className="card">
              <h3 className="title-sm">No passwords</h3>
              <p className="body">
                There is no code path that accepts a Bluesky password or an app password. The
                server holds a grant, which is a different kind of thing entirely.
              </p>
            </article>

            <article className="card">
              <h3 className="title-sm">Bound to a key</h3>
              <p className="body">
                Every request upstream is signed with a key its token is tied to. A token on its
                own, without that key, does nothing.
              </p>
            </article>

            <article className="card">
              <h3 className="title-sm">Yours to revoke</h3>
              <p className="body">
                Access ends from your Bluesky settings, whenever you decide, without asking this
                server for permission.
              </p>
            </article>
          </div>
        </section>

        <section className="section">
          <div className="section-label label">
            <span>03 &mdash; Specification</span>
            <span className="rule" />
          </div>

          <table className="specs">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>42</td>
                <td>
                  Tools: posts, feeds, threads, search, follows, likes, reposts, bookmarks,
                  drafts, notifications, preferences, direct messages
                </td>
              </tr>
              <tr>
                <td>OAuth 2.1</td>
                <td>
                  AT Protocol profile: DPoP-bound access tokens, pushed authorization requests,
                  PKCE, handle-to-server identity resolution
                </td>
              </tr>
              <tr>
                <td>{confidential ? 'private_key_jwt' : 'none'}</td>
                <td>
                  Token endpoint authentication.{' '}
                  {confidential
                    ? 'Signed ES256 client assertions, which is what raises session lifetime to 180 days.'
                    : 'Public client mode, so sessions are capped at 14 days.'}
                </td>
              </tr>
              <tr>
                <td>RFC 7591</td>
                <td>Dynamic client registration, so MCP clients enrol themselves</td>
              </tr>
              <tr>
                <td>Streamable</td>
                <td>MCP transport over HTTP, stateless, no persistent process</td>
              </tr>
              <tr>
                <td>0</td>
                <td>
                  Destructive tools. Account deletion, deactivation, app-password management,
                  invite codes, and server administration are all deliberately absent
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="shell">
        <div className="cta">
          <div className="cta-inner">
            <div className="icon-tile" aria-hidden="true">
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="square"
                strokeLinejoin="miter"
              >
                <path d="m18 16 4-4-4-4" />
                <path d="m6 8-4 4 4 4" />
                <path d="m14.5 4-5 16" />
              </svg>
            </div>

            <span className="label">Public domain, no conditions</span>
            <h2 className="display-md">Read it, fork it, run your own</h2>
            <a className="btn btn-on-primary" href={REPO}>
              View the source
            </a>
          </div>
        </div>

        <footer className="foot label-sm">
          <a href={REPO}>GitHub</a>
          <a href={`${REPO}/blob/main/CONNECT.md`}>Connect guide</a>
          <a href={`${REPO}/blob/main/SECURITY.md`}>Security</a>
          <a href="/client-metadata.json">Client metadata</a>
          <a href="https://pmcosta.dev">pmcosta.dev</a>
        </footer>
      </div>
    </>
  );
}
