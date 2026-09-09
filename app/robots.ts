import type { MetadataRoute } from 'next';

const SITE = (process.env.OAUTH_PUBLIC_ORIGIN ?? 'https://bluesky.pmcosta.dev').replace(/\/$/, '');

/**
 * The landing page is the only thing worth indexing. Everything else here is
 * protocol surface: OAuth endpoints, the MCP transport, and the connection
 * helpers. Crawling those produces nothing useful and fills logs with 400s, so
 * they are disallowed. /client-metadata.json and /jwks.json stay crawlable
 * because they are public documents that identify this client.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/mcp', '/connect', '/connected']
      }
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE
  };
}
