import type { ReactNode } from 'react';

/**
 * /connected must never be served from a cache.
 *
 * It is a client component, so Next would happily prerender it once and hand
 * out a static copy from the CDN. That copy keeps the behaviour it was built
 * with, which means a deploy that changes the close logic appears to do nothing:
 * you redeploy, retest, and watch the old version run. Debugging that is a trap
 * worth spending a file to avoid.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function ConnectedLayout({ children }: { children: ReactNode }) {
  return children;
}
