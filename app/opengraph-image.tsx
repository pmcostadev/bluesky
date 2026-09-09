import { ImageResponse } from 'next/og';

/**
 * The social share card, generated rather than stored.
 *
 * Two reasons it is code and not a PNG in public/: it cannot drift out of sync
 * with the numbers on the page, and it costs nothing in the repository. Layout
 * follows the brand rule for OG images: all text in the left 55%, the warm disc
 * on the right, nothing overlapping it.
 */

export const alt = 'Bluesky MCP Server — AT Protocol OAuth, not app passwords';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const SURFACE = '#121011';
const RAISED = '#1c1817';
const BORDER = '#2d2825';
const ON_SURFACE = '#f2ede7';
const MUTED = '#9a938a';
const PRIMARY = '#ff8000';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: SURFACE,
          position: 'relative'
        }}
      >
        {/* The 4px accent edge, the same one the page hero carries. */}
        <div style={{ width: 8, height: '100%', background: PRIMARY }} />

        {/* Warm disc, right side. Text never crosses into it. */}
        <div
          style={{
            position: 'absolute',
            right: -90,
            top: 110,
            width: 420,
            height: 420,
            borderRadius: 420,
            background: PRIMARY,
            opacity: 0.92
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: 660,
            height: '100%',
            padding: '0 0 0 64px'
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 5,
              color: PRIMARY,
              textTransform: 'uppercase'
            }}
          >
            pmcosta.dev
          </div>

          <div
            style={{
              marginTop: 28,
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: -3,
              color: ON_SURFACE,
              textTransform: 'uppercase'
            }}
          >
            Bluesky MCP
          </div>

          <div
            style={{
              marginTop: 26,
              fontSize: 27,
              lineHeight: 1.4,
              color: MUTED,
              maxWidth: 560
            }}
          >
            AT Protocol OAuth, not app passwords. 42 tools, direct messages
            included.
          </div>

          <div style={{ display: 'flex', marginTop: 40, gap: 10 }}>
            {['42 TOOLS', 'DPOP + PKCE', 'NO PASSWORDS'].map((chip) => (
              <div
                key={chip}
                style={{
                  display: 'flex',
                  padding: '10px 18px',
                  border: `1px solid ${BORDER}`,
                  background: RAISED,
                  color: MUTED,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 2
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
