import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // Discovery documents for the OAuth layer. The .well-known paths are what
  // MCP clients probe first; they map onto route handlers under /api/oauth.
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/oauth/metadata',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/oauth/resource',
      },
      {
        source: '/.well-known/oauth-protected-resource/mcp',
        destination: '/api/oauth/resource',
      },
      {
        source: '/.well-known/oauth-authorization-server/mcp',
        destination: '/api/oauth/metadata',
      },
    ];
  },
};

export default nextConfig;
