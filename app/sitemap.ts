import type { MetadataRoute } from 'next';

const SITE = (process.env.OAUTH_PUBLIC_ORIGIN ?? 'https://bluesky.pmcosta.dev').replace(/\/$/, '');

/** One page. A sitemap this small still helps: it declares the canonical host. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1
    }
  ];
}
