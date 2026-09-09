import { BSKY_SCOPE, isConfidential } from '@/oauth/client';

/**
 * Landing page.
 *
 * Anyone arriving here followed a link from the repo, from an MCP client, or
 * from a consent screen, and wants one of two answers: what is this, and is it
 * safe to connect. So it states the auth model plainly and reports live server
 * facts rather than describing itself in the abstract.
 */

export const dynamic = 'force-dynamic';

const REPO = 'https://github.com/pmcostadev/bluesky';

export default function Home() {
  const confidential = isConfidential();
  const scopes = BSKY_SCOPE.split(/\s+/).filter(Boolean);

  return (
    <main className="wrap">
      <div className="inner">
        <header>
          <img src="/bluesky-logo.png" alt="" width={64} height={64} />
          <div>
            <h1>Bluesky MCP</h1>
            <p className="sub">Model Context Protocol server for Bluesky and AT Protocol</p>
          </div>
        </header>

        <p className="lede">
          Gives an AI assistant access to a Bluesky account through{' '}
          <strong>AT Protocol OAuth</strong>. No password, no app password, nothing to paste. You
          approve access on Bluesky itself and revoke it there whenever you like.
        </p>

        <div className="grid">
          <div className="stat">
            <span className="k">Tools</span>
            <span className="v">42</span>
            <span className="d">posts, feeds, search, follows, drafts, DMs</span>
          </div>
          <div className="stat">
            <span className="k">Auth</span>
            <span className="v">OAuth only</span>
            <span className="d">DPoP-bound, PAR, PKCE</span>
          </div>
          <div className="stat">
            <span className="k">Client mode</span>
            <span className="v">{confidential ? 'Confidential' : 'Public'}</span>
            <span className="d">
              {confidential ? 'sessions last up to 180 days' : 'sessions capped at 14 days'}
            </span>
          </div>
        </div>

        <section>
          <h2>Connect a client</h2>
          <p className="body">
            Any MCP client that speaks OAuth can register itself. Point it at this endpoint:
          </p>
          <pre>
            <code>https://bluesky.pmcosta.dev/mcp</code>
          </pre>
          <p className="body">
            Requested scopes:{' '}
            {scopes.map((s, i) => (
              <span key={s}>
                <code className="inline">{s}</code>
                {i < scopes.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        </section>

        <section>
          <h2>What it will not do</h2>
          <p className="body">
            Deliberately absent: password login, account creation, app-password management, invite
            codes, admin operations, account deactivation and deletion. A smaller surface that is
            correct beats a longer list.
          </p>
        </section>

        <footer>
          <a href={REPO}>Source on GitHub</a>
          <span className="dot">&middot;</span>
          <a href={`${REPO}/blob/main/CONNECT.md`}>Embed the connect flow</a>
          <span className="dot">&middot;</span>
          <a href="/client-metadata.json">Client metadata</a>
          <span className="dot">&middot;</span>
          <span className="muted">Public domain</span>
        </footer>
      </div>

      <style>{`
        :root { color-scheme: dark; }
        body {
          margin: 0;
          background: #0b1220;
          color: #eef3fb;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .wrap { min-height: 100vh; display: flex; justify-content: center; padding: 64px 24px; }
        .inner { width: 100%; max-width: 720px; }
        header { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
        header img { width: 64px; height: auto; border-radius: 16px; }
        h1 { margin: 0; font-size: 30px; letter-spacing: -0.025em; }
        .sub { margin: 4px 0 0; font-size: 14.5px; color: #93a1b8; }
        .lede {
          margin: 0 0 32px;
          font-size: 17px;
          line-height: 1.65;
          color: #c7d2e2;
        }
        .lede strong { color: #eef3fb; }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 12px;
          margin-bottom: 40px;
        }
        .stat {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 16px 18px;
          background: #141c2b;
          border: 1px solid #243043;
          border-radius: 14px;
        }
        .k {
          font-family: ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #1185fe;
        }
        .v { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
        .d { font-size: 12.5px; line-height: 1.5; color: #93a1b8; }
        section { margin-bottom: 34px; }
        h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: -0.01em; }
        .body { margin: 0 0 12px; font-size: 14.5px; line-height: 1.65; color: #93a1b8; }
        pre {
          margin: 0 0 12px;
          padding: 14px 16px;
          background: #0e1522;
          border: 1px solid #243043;
          border-radius: 10px;
          overflow-x: auto;
        }
        code {
          font-family: ui-monospace, monospace;
          font-size: 13px;
          color: #4ade80;
        }
        code.inline {
          padding: 2px 6px;
          background: #0e1522;
          border: 1px solid #243043;
          border-radius: 5px;
          font-size: 12px;
          color: #c7d2e2;
        }
        footer {
          padding-top: 24px;
          border-top: 1px solid #243043;
          font-size: 13.5px;
          color: #93a1b8;
        }
        footer a { color: #1185fe; text-decoration: none; }
        footer a:hover { text-decoration: underline; }
        .dot { margin: 0 9px; color: #3a465c; }
        .muted { color: #6b7a91; }
      `}</style>
    </main>
  );
}
