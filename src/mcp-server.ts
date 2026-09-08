import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { BlueskyClient } from './bluesky-client';
import { toolHandlers, isValidTool } from './handlers';
import { toolDefinitions } from './toolDefinitions';
import { formatError, createSuccessResponse, createErrorResponse } from './utils';
import type { BlueskyCredentials } from './types';

const SERVER_VERSION = '1.0.0';

export function createMCPServer(credentials?: { identifier?: string; password?: string }): Server {
  const server = new Server(
    { name: 'bluesky-mcp', version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema
    }))
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'bluesky://authenticated-user/profile',
        name: 'Current User Profile',
        description: 'The profile of the currently authenticated Bluesky user',
        mimeType: 'application/json'
      },
      {
        uri: 'bluesky://timeline',
        name: 'User Timeline',
        description: "The authenticated user's home timeline",
        mimeType: 'application/json'
      }
    ]
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'bluesky_usage_guide',
        description: 'Comprehensive guide to using Bluesky MCP tools for various tasks',
        arguments: [{ name: 'task', description: 'Task type: search, post, profile, feed, thread', required: true }]
      },
      {
        name: 'search_posts_template',
        description: 'Template for searching posts with various filters',
        arguments: [{ name: 'topic', description: 'Topic or keyword to search for', required: true }]
      },
      {
        name: 'compose_post',
        description: 'Template for composing a well-formatted Bluesky post',
        arguments: [{ name: 'content', description: 'The main content of the post', required: true }]
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!isValidTool(name)) {
      return {
        content: [{ type: 'text', text: JSON.stringify(createErrorResponse(`Unknown tool: ${name}`, 'UNKNOWN_TOOL')) }],
        isError: true
      };
    }

    try {
      // Build credentials: prefer injected HTTP headers, fall back to env vars
      let blueskyCredentials: BlueskyCredentials | undefined;

      if (credentials?.identifier && credentials?.password) {
        blueskyCredentials = {
          identifier: credentials.identifier,
          password: credentials.password
        };
      } else if (process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD) {
        blueskyCredentials = {
          identifier: process.env.BLUESKY_IDENTIFIER,
          password: process.env.BLUESKY_APP_PASSWORD
        };
      }

      const client = new BlueskyClient();

      if (blueskyCredentials) {
        await client.authenticate(blueskyCredentials);
      }

      const handler = toolHandlers[name];
      const result = await handler(client, args || {});

      if (!result.success) {
        return {
          content: [{ type: 'text', text: JSON.stringify(createErrorResponse(result.error || 'Unknown error', 'TOOL_ERROR')) }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(createSuccessResponse(result.data)) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify(createErrorResponse(formatError(error), 'EXECUTION_ERROR')) }],
        isError: true
      };
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'bluesky_usage_guide':
        return { messages: [{ role: 'user', content: { type: 'text', text: getUsageGuidePrompt(args?.task as string) } }] };
      case 'search_posts_template':
        return { messages: [{ role: 'user', content: { type: 'text', text: getSearchPostsPrompt(args?.topic as string) } }] };
      case 'compose_post':
        return { messages: [{ role: 'user', content: { type: 'text', text: getComposePostPrompt(args?.content as string) } }] };
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}

function getUsageGuidePrompt(task?: string): string {
  const t = (task || '').toLowerCase();
  if (t.includes('search')) return `Use search_posts for keyword search, search_actors for users, search_actors_typeahead for autocomplete, search_accounts for admin account search.`;
  if (t.includes('post')) return `Use create_post with text (max 300 chars). Optionally set langs and reply. Use delete_post to remove a post by URI or rkey. Use upload_blob to upload images/files separately and get a blob reference for use in posts or other records.`;
  if (t.includes('blob') || t.includes('upload')) return `Use upload_blob to upload a blob (image, video, or file) to your PDS. Provide the source as a base64 data URI, HTTPS URL, or local file path. Returns a blob reference with $type, ref, mimeType, and size that can be used in post embeds or other record types.`;
  if (t.includes('profile')) return `Use get_profile for a single user, get_profiles for batch lookup (up to 25 actors).`;
  if (t.includes('feed')) return `Use get_timeline (auth), get_feed (at:// URI), or get_author_feed.`;
  if (t.includes('thread')) return `Use get_thread with a post URI. Control depth and parentHeight.`;
  if (t.includes('draft')) return `Use create_draft to save a draft, update_draft to modify an existing draft, get_drafts to list drafts, delete_draft to remove a draft by ID. You can attach up to 4 images (base64 data URI, HTTPS URL, or local file path) with alt text to drafts and posts.`;
  if (t.includes('chat') || t.includes('message')) return `Use send_message to send a DM, send_message_batch for multiple DMs, get_messages to list conversation messages, add_reaction to react to a message, remove_reaction to remove a reaction, get_message_context for moderation context.`;
  if (t.includes('account')) return `Use get_preferences for account settings, update_email to change your email address, create_app_password to generate app passwords, list_app_passwords to view them, get_session to check session info, refresh_session to renew tokens, delete_session to invalidate the session, deactivate_account to deactivate, delete_account to permanently delete, confirm_email to verify an email change, get_account_invite_codes to list invite codes, create_invite_code or create_invite_codes to generate codes.`;
  if (t.includes('server')) return `Use describe_server to get PDS info, create_account to register a new account, create_session to log in and get tokens.`;
  if (t.includes('admin')) return `Use admin_send_email to send emails as a PDS admin (requires admin privileges).`;
  return `Tools: create_post, delete_post, get_timeline, get_feed, get_author_feed, get_thread, get_profile, get_profiles, search_posts, search_actors, search_actors_typeahead, search_accounts, get_posts, get_likes, get_reposted_by, like_post, unlike_post, repost_post, unrepost_post, get_suggestions, get_preferences, update_email, admin_send_email, confirm_email, create_account, create_app_password, create_invite_code, create_invite_codes, create_session, deactivate_account, delete_account, delete_session, describe_server, get_account_invite_codes, get_service_auth, get_session, list_app_passwords, refresh_session, add_reaction, remove_reaction, get_messages, send_message, send_message_batch, get_message_context, create_draft, delete_draft, get_drafts, create_bookmark, delete_bookmark, get_bookmarks, begin_age_assurance, get_age_assurance_config, get_age_assurance_state, upload_blob, test_connectivity.`;
}

function getSearchPostsPrompt(topic?: string): string {
  return `Search Bluesky for: ${topic || '[topic]'}\nUse search_posts with query="${topic || 'your topic'}", sort="latest" or "top".`;
}

function getComposePostPrompt(content?: string): string {
  return `Compose a Bluesky post (max 300 chars):\n${content || '[content]'}\nUse create_post with text and optionally langs: ["en"]. You can attach up to 4 images by providing an images array with source (base64 data URI, HTTPS URL, or local file path) and alt text. Alternatively, use upload_blob first to upload images individually and get blob references.`;
}
