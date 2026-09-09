import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

/**
 * Two families, strictly separated by role: Inter carries meaning, JetBrains
 * Mono carries structure (labels, buttons, counts, anything that measures).
 */
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap'
});

/**
 * The canonical origin. OAUTH_PUBLIC_ORIGIN is already required for the OAuth
 * layer and is the domain users actually reach, so it is the right source of
 * truth here too. VERCEL_URL is deliberately not used: it changes on every
 * deployment, which would hand search engines a different canonical each time.
 */
const SITE = (process.env.OAUTH_PUBLIC_ORIGIN ?? 'https://bluesky.pmcosta.dev').replace(/\/$/, '');

const TITLE = 'Bluesky MCP Server';
const TAGLINE = 'AT Protocol OAuth, not app passwords';
const DESCRIPTION =
  'An MCP server that gives an AI assistant access to a Bluesky account through AT Protocol OAuth. DPoP-bound tokens, PAR, PKCE, and 42 tools including direct messages. No password is ever stored or sent.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),

  title: {
    default: `${TITLE} — ${TAGLINE}`,
    template: `%s — ${TITLE}`
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  authors: [{ name: 'Pedro Costa', url: 'https://pmcosta.dev' }],
  creator: 'Pedro Costa',
  publisher: 'Pedro Costa',
  keywords: [
    'MCP',
    'Model Context Protocol',
    'MCP server',
    'Bluesky',
    'AT Protocol',
    'atproto',
    'OAuth',
    'DPoP',
    'AI agent',
    'Claude',
    'TypeScript'
  ],
  category: 'technology',

  alternates: {
    canonical: '/'
  },

  // Asset paths follow the canonical table in the pmcosta.dev design system, so
  // every property that shares the brand resolves them the same way.
  openGraph: {
    type: 'website',
    url: '/',
    siteName: TITLE,
    title: `${TITLE} — ${TAGLINE}`,
    description: DESCRIPTION,
    locale: 'en_US',
    images: [
      {
        url: '/brand/og-default.png',
        width: 1200,
        height: 630,
        alt: 'pmcosta.dev — Coimbra across the Mondego at dusk'
      }
    ]
  },

  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} — ${TAGLINE}`,
    description: DESCRIPTION,
    creator: '@pmcostadev',
    images: ['/brand/og-default.png']
  },

  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/brand/logo-96.png', type: 'image/png', sizes: '96x96' },
      { url: '/brand/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/brand/icon-512.png', type: 'image/png', sizes: '512x512' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  },

  manifest: '/site.webmanifest',

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' }
  }
};

export const viewport: Viewport = {
  themeColor: '#121011',
  colorScheme: 'dark'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
