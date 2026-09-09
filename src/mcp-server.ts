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
import { bindOAuthSession } from './oauth/adopt';
import type { ResolvedAuth } from './oauth/resolve';

const SERVER_VERSION = '2.0.0';

/**
 * Build an MCP server bound to one authenticated account.
 *
 * Authentication is OAuth only. `auth` is resolved per request in the route
 * handler, so a single deployment serves many accounts without ever holding a
 * password: the DPoP-bound session is created, used, and discarded within the
 * lifetime of one request.
 */
export function createMCPServer(auth: ResolvedAuth): Server {
  const server = new Server(
    { name: 'bluesky-mcp', version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map((def) => ({
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
        arguments: [
          {
            name: 'task',
            description: 'Task type: search, post, profile, feed, thread',
            required: true
          }
        ]
      },
      {
        name: 'search_posts_template',
        description: 'Template for searching posts with various filters',
        arguments: [
          { name: 'topic', description: 'Topic or keyword to search for', required: true }
        ]
      },
      {
        name: 'compose_post',
        description: 'Template for composing a well-formatted Bluesky post',
        arguments: [
          { name: 'content', description: 'The main content of the post', required: true }
        ]
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!isValidTool(name)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(createErrorResponse(`Unknown tool: ${name}`, 'UNKNOWN_TOOL'))
          }
        ],
        isError: true
      };
    }

    try {
      const client = new BlueskyClient();
      bindOAuthSession(client, auth.agent, auth.session);

      const handler = toolHandlers[name];
      const result = await handler(client, args || {});

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                createErrorResponse(result.error || 'Unknown error', 'TOOL_ERROR')
              )
            }
          ],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(createSuccessResponse(result.data)) }]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(createErrorResponse(formatError(error), 'EXECUTION_ERROR'))
          }
        ],
        isError: true
      };
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'bluesky_usage_guide':
        return {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: getUsageGuidePrompt(args?.task as string) }
            }
          ]
        };
      case 'search_posts_template':
        return {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: getSearchPostsPrompt(args?.topic as string) }
            }
          ]
        };
      case 'compose_post':
        return {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: getComposePostPrompt(args?.content as string) }
            }
          ]
        };
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}

/**
 * Guidance for the model, per task area.
 *
 * Only exposed tools may be named here. Advertising a tool that was removed
 * (app-password management, invite codes, account deletion, admin email) makes
 * the model attempt it and report a capability the server does not have.
 */
function getUsageGuidePrompt(task?: string): string {
  const t = (task || '').toLowerCase();
  if (t.includes('search'))
    return `Use search_posts for keyword search, search_actors for users, and search_actors_typeahead for autocomplete.`;
  if (t.includes('post'))
    return `Use create_post with text (max 300 chars). Optionally set langs and reply. Use delete_post to remove a post by URI or rkey. Use upload_blob to upload images or files separately and get a blob reference for use in posts.`;
  if (t.includes('blob') || t.includes('upload'))
    return `Use upload_blob to upload a blob (image, video, or file) to the PDS. Provide the source as a base64 data URI, HTTPS URL, or local file path. Returns a blob reference with $type, ref, mimeType, and size for use in post embeds.`;
  if (t.includes('profile'))
    return `Use get_profile for a single user, get_profiles for batch lookup (up to 25 actors).`;
  if (t.includes('feed'))
    return `Use get_timeline for the home feed, get_feed for a feed generator (at:// URI), or get_author_feed for one account.`;
  if (t.includes('thread'))
    return `Use get_thread with a post URI. Control depth and parentHeight.`;
  if (t.includes('draft'))
    return `Use create_draft to save a draft, update_draft to modify one, get_drafts to list them, delete_draft to remove one by ID. Up to 4 images with alt text can be attached.`;
  if (t.includes('bookmark'))
    return `Use create_bookmark to save a post, get_bookmarks to list them, delete_bookmark to remove one by URI.`;
  if (t.includes('chat') || t.includes('message'))
    return `Use send_message to send a DM, send_message_batch for several, get_messages to list a conversation, add_reaction and remove_reaction for reactions, get_message_context for surrounding messages. Requires the transition:chat.bsky scope, which is granted at connection time.`;
  if (t.includes('account'))
    return `Use get_preferences for account settings, get_session for session info, and update_email to change the email address. Session refresh is automatic through the OAuth layer. App-password management, invite codes, account creation, deactivation, and deletion are intentionally not available on this server.`;
  if (t.includes('server'))
    return `Use describe_server for PDS info. Account creation and password login are not available: this server authenticates with OAuth only.`;
  return `Tools: create_post, delete_post, get_timeline, get_feed, get_author_feed, get_thread, get_profile, get_profiles, search_posts, search_actors, search_actors_typeahead, get_posts, get_likes, get_reposted_by, like_post, unlike_post, repost_post, unrepost_post, follow_user, unfollow_user, get_followers, get_follows, get_suggestions, get_preferences, update_email, confirm_email, describe_server, get_service_auth, get_session, get_notifications, add_reaction, remove_reaction, get_messages, send_message, send_message_batch, get_message_context, create_draft, update_draft, delete_draft, get_drafts, create_bookmark, delete_bookmark, get_bookmarks, get_age_assurance_config, get_age_assurance_state, upload_blob, test_connectivity.`;
}

function getSearchPostsPrompt(topic?: string): string {
  return `Search Bluesky for: ${topic || '[topic]'}\nUse search_posts with query="${
    topic || 'your topic'
  }", sort="latest" or "top".`;
}

function getComposePostPrompt(content?: string): string {
  return `Compose a Bluesky post (max 300 chars):\n${
    content || '[content]'
  }\nUse create_post with text and optionally langs: ["en"]. Up to 4 images can be attached by providing an images array with source (base64 data URI, HTTPS URL, or local file path) and alt text, or use upload_blob first to get blob references.`;
}
