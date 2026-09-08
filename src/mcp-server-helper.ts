import type { MCPConfiguration } from './types';

export function loadMCPConfiguration(): MCPConfiguration | { error: string } {
  const bskyIdentifier = process.env.BSKY_IDENTIFIER;
  const bskyPassword = process.env.BSKY_PASSWORD;

  if (!bskyIdentifier || !bskyPassword) {
    return {
      error: 'Missing Bluesky credentials. Please set BSKY_IDENTIFIER and BSKY_PASSWORD environment variables.',
    };
  }

  return {
    identifier: bskyIdentifier,
    password: bskyPassword,
  };
}
