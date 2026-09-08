/**
 * MCP Tool Definitions - JSON Schema definitions for AI agent consumption
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const toolDefinitions: ToolDefinition[] = [

  // ── Posts ──────────────────────────────────────────────────────────────────

  {
    name: 'create_post',
    description: 'Create a new post on Bluesky (max 300 chars). Optionally set language codes, reply to an existing post, or attach up to 4 images. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Post text content (max 300 characters)', maxLength: 300 },
        langs: { type: 'array', items: { type: 'string' }, description: 'Language codes, e.g. ["en"]', maxItems: 5 },
        reply: {
          type: 'object',
          description: 'Reply configuration',
          properties: {
            rootUri: { type: 'string', description: 'Root post URI (at://...)' },
            rootCid: { type: 'string', description: 'Root post CID' },
            parentUri: { type: 'string', description: 'Parent post URI (at://...)' },
            parentCid: { type: 'string', description: 'Parent post CID' }
          },
          required: ['rootUri', 'rootCid', 'parentUri', 'parentCid']
        },
        images: {
          type: 'array',
          description: 'Up to 4 images to attach to the post',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Base64 data URI, HTTPS URL, or local file path of the image' },
              alt: { type: 'string', description: 'Alt text for the image' },
              aspectRatio: {
                type: 'object',
                properties: {
                  width: { type: 'number', description: 'Image width in pixels' },
                  height: { type: 'number', description: 'Image height in pixels' }
                },
                required: ['width', 'height']
              }
            },
            required: ['source', 'alt']
          }
        }
      },
      required: ['text']
    }
  },
  {
    name: 'get_posts',
    description: 'Fetch specific posts by their AT Protocol URIs (up to 25 at once). Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uris: { type: 'array', items: { type: 'string' }, description: 'Array of post URIs (at://...)', maxItems: 25 }
      },
      required: ['uris']
    }
  },
  {
    name: 'get_likes',
    description: 'Get the list of users who liked a specific post. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)', pattern: '^at://' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of results (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      },
      required: ['uri']
    }
  },
  {
    name: 'get_reposted_by',
    description: 'Get the list of users who reposted a specific post. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)', pattern: '^at://' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of results (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      },
      required: ['uri']
    }
  },
  {
    name: 'like_post',
    description: 'Like a post on Bluesky. Returns the like record URI — save this if you may want to unlike later. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)' },
        cid: { type: 'string', description: 'Post CID (content identifier)' }
      },
      required: ['uri', 'cid']
    }
  },
  {
    name: 'repost_post',
    description: 'Repost a post on Bluesky. Returns the repost record URI — save this if you may want to un-repost later. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)' },
        cid: { type: 'string', description: 'Post CID (content identifier)' }
      },
      required: ['uri', 'cid']
    }
  },
  {
    name: 'unlike_post',
    description: 'Remove a like from a post on Bluesky by deleting the Like record. Pass the like record URI returned by like_post (e.g. at://did:.../app.bsky.feed.like/rkey), not the original post URI. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Like record URI to delete (at://...)', pattern: '^at://' }
      },
      required: ['uri']
    }
  },
  {
    name: 'unrepost_post',
    description: 'Remove a repost on Bluesky by deleting the Repost record. Pass the repost record URI returned by repost_post (e.g. at://did:.../app.bsky.feed.repost/rkey), not the original post URI. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Repost record URI to delete (at://...)', pattern: '^at://' }
      },
      required: ['uri']
    }
  },
  {
    name: 'delete_post',
    description: 'Delete a post on Bluesky by its AT Protocol URI or record key (rkey). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://did/app.bsky.feed.post/rkey)', pattern: '^at://' },
        rkey: { type: 'string', description: 'Record key of the post (alternative to uri)' }
      }
    }
  },

  // ── Feeds ──────────────────────────────────────────────────────────────────

  {
    name: 'get_timeline',
    description: "Get the authenticated user's home timeline (posts from followed accounts). Requires authentication.",
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        limit: { type: 'number', description: 'Number of posts to return (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      }
    }
  },
  {
    name: 'get_feed',
    description: 'Get posts from a custom feed generator using its at:// URI. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        feed: { type: 'string', description: 'Feed generator URI (at://did/...)', pattern: '^at://' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of posts (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      },
      required: ['feed']
    }
  },
  {
    name: 'get_author_feed',
    description: "Get posts from a specific user's profile feed. Can filter by type. Works with or without authentication.",
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'string', description: "Actor's DID or handle (e.g. handle.bsky.social)" },
        filter: {
          type: 'string',
          enum: ['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads'],
          description: 'Filter type for posts',
          default: 'posts_with_replies'
        },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of posts (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      },
      required: ['actor']
    }
  },
  {
    name: 'get_thread',
    description: 'Get a full post thread including replies and parent posts. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://did/app.bsky.feed.post/...)', pattern: '^at://' },
        depth: { type: 'number', description: 'Reply depth to fetch (0-1000, default 6)', minimum: 0, maximum: 1000, default: 6 },
        parentHeight: { type: 'number', description: 'Parent posts to include (0-1000, default 80)', minimum: 0, maximum: 1000, default: 80 }
      },
      required: ['uri']
    }
  },

  // ── Profiles ───────────────────────────────────────────────────────────────

  {
    name: 'get_profile',
    description: 'Get detailed profile for a single user (bio, follower counts, avatar, etc.). Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'string', description: "Actor's DID or handle" }
      },
      required: ['actor']
    }
  },
  {
    name: 'get_profiles',
    description: 'Get detailed profiles for multiple users at once (batch, up to 25). Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        actors: { type: 'array', items: { type: 'string' }, description: 'Array of DIDs or handles', maxItems: 25 }
      },
      required: ['actors']
    }
  },
  {
    name: 'get_suggestions',
    description: 'Get suggested users to follow based on your activity. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of suggestions (1-100, default 10)', minimum: 1, maximum: 100, default: 10 }
      }
    }
  },

  // ── Search ─────────────────────────────────────────────────────────────────

  {
    name: 'search_actors',
    description: 'Search for Bluesky users by name or handle. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Search query (name, handle, or keyword)', maxLength: 100 },
        limit: { type: 'number', description: 'Number of results (1-100, default 10)', minimum: 1, maximum: 100, default: 10 }
      },
      required: ['term']
    }
  },
  {
    name: 'search_actors_typeahead',
    description: 'Quick autocomplete search for Bluesky users as you type. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Search prefix (min 1 character)', maxLength: 100 },
        limit: { type: 'number', description: 'Number of suggestions (1-100, default 10)', minimum: 1, maximum: 100, default: 10 }
      },
      required: ['term']
    }
  },
  {
    name: 'search_posts',
    description: 'Search posts by keyword, hashtag, author, language, or mention. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keywords, hashtags, etc.)', maxLength: 500 },
        limit: { type: 'number', description: 'Number of results (1-100, default 20)', minimum: 1, maximum: 100, default: 20 },
        cursor: { type: 'string', description: 'Pagination cursor' },
        sort: { type: 'string', enum: ['latest', 'top'], description: 'Sort by latest or top engagement', default: 'latest' },
        mentions: { type: 'string', description: 'Filter posts mentioning this actor (handle or DID)' },
        author: { type: 'string', description: 'Filter posts by this author (handle or DID)' },
        lang: { type: 'string', description: 'Filter by language code (e.g. "en", "ja", "es")' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_accounts',
    description: 'Search accounts via the admin endpoint (requires admin privileges on the PDS). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Filter by email address', format: 'email' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of results (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      }
    }
  },

  // ── Account / Preferences ──────────────────────────────────────────────────

  {
    name: 'get_preferences',
    description: 'Get private account preferences (content filters, feed settings, saved feeds, moderation). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'update_email',
    description: 'Update the email address associated with the authenticated account. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'New email address', format: 'email' },
        token: { type: 'string', description: 'Optional verification token (if required by the PDS)' }
      },
      required: ['email']
    }
  },

  // ── Server / Account Management ─────────────────────────────────────────────

  {
    name: 'admin_send_email',
    description: 'Send an email as a PDS admin. Requires authentication and admin privileges.',
    inputSchema: {
      type: 'object',
      properties: {
        recipientDid: { type: 'string', description: 'DID of the recipient' },
        content: { type: 'string', description: 'Email body content' },
        subject: { type: 'string', description: 'Email subject line' },
        senderDid: { type: 'string', description: 'DID of the sender (optional)' },
        comment: { type: 'string', description: 'Internal comment (optional)' }
      },
      required: ['recipientDid', 'content']
    }
  },
  {
    name: 'confirm_email',
    description: 'Confirm an email address using a verification token. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to confirm', format: 'email' },
        token: { type: 'string', description: 'Verification token' }
      },
      required: ['email', 'token']
    }
  },
  {
    name: 'create_account',
    description: 'Create a new Bluesky/AT Protocol account. No authentication required.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address for the new account', format: 'email' },
        handle: { type: 'string', description: 'Desired handle (e.g. name.bsky.social)' },
        password: { type: 'string', description: 'Account password' },
        inviteCode: { type: 'string', description: 'Invite code (if required by the PDS)' },
        verificationCode: { type: 'string', description: 'Verification code (optional)' },
        verificationPhone: { type: 'string', description: 'Verification phone number (optional)' },
        plcOp: { type: 'object', description: 'PLC operation object (optional)' }
      },
      required: ['email', 'handle', 'password']
    }
  },
  {
    name: 'create_app_password',
    description: 'Create a new app password for the authenticated account. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable name for the app password' }
      },
      required: ['name']
    }
  },
  {
    name: 'create_invite_code',
    description: 'Create a single invite code. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        forAccount: { type: 'string', description: 'DID of the account the code is for (optional)' },
        useCount: { type: 'number', description: 'Number of times the code can be used', minimum: 1 }
      }
    }
  },
  {
    name: 'create_invite_codes',
    description: 'Create multiple invite codes at once. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        codeCount: { type: 'number', description: 'Number of codes to create', minimum: 1 },
        useCount: { type: 'number', description: 'Number of uses per code', minimum: 1 },
        forAccounts: { type: 'array', items: { type: 'string' }, description: 'DIDs to create codes for' }
      }
    }
  },
  {
    name: 'create_session',
    description: 'Create an authentication session with a Bluesky PDS. Returns access and refresh tokens. No authentication required.',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Handle or email address' },
        password: { type: 'string', description: 'Account password or app password' },
        authFactorToken: { type: 'string', description: 'Two-factor auth token (optional)' }
      },
      required: ['identifier', 'password']
    }
  },
  {
    name: 'deactivate_account',
    description: 'Deactivate the authenticated account. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        deleteAfter: { type: 'string', description: 'ISO 8601 timestamp for when to permanently delete the account (optional)' }
      }
    }
  },
  {
    name: 'delete_account',
    description: 'Permanently delete the authenticated account. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        password: { type: 'string', description: 'Account password for confirmation' }
      },
      required: ['password']
    }
  },
  {
    name: 'delete_session',
    description: 'Delete the current authentication session (invalidate access token). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'describe_server',
    description: 'Get information about the PDS server (available user domains, contact info, etc.). No authentication required.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_account_invite_codes',
    description: 'Get invite codes associated with the authenticated account. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        includeUsed: { type: 'boolean', description: 'Include already-used codes' },
        createAvailable: { type: 'boolean', description: 'Create new codes if available' }
      }
    }
  },
  {
    name: 'get_service_auth',
    description: 'Get a signed JWT token for service-to-service authentication. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        aud: { type: 'string', description: 'DID of the audience service' },
        lxm: { type: 'string', description: 'Lexicon method this token is for (optional)' },
        exp: { type: 'number', description: 'Expiration time in seconds from now (optional)' }
      },
      required: ['aud']
    }
  },
  {
    name: 'get_session',
    description: 'Get details about the current authenticated session. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_app_passwords',
    description: 'List all app passwords for the authenticated account. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'refresh_session',
    description: 'Refresh the current authentication session using the refresh token. Returns new access and refresh tokens. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // ── Chat ───────────────────────────────────────────────────────────────────

  {
    name: 'add_reaction',
    description: 'Add a reaction (emoji) to a specific message in a Bluesky DM conversation. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        convoId: { type: 'string', description: 'Conversation ID' },
        messageId: { type: 'string', description: 'Message ID to react to' },
        value: { type: 'string', description: 'Reaction emoji value' }
      },
      required: ['convoId', 'messageId', 'value']
    }
  },
  {
    name: 'remove_reaction',
    description: 'Remove a previously added reaction from a message in a Bluesky DM conversation. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        convoId: { type: 'string', description: 'Conversation ID' },
        messageId: { type: 'string', description: 'Message ID to remove reaction from' },
        value: { type: 'string', description: 'Reaction emoji value to remove' }
      },
      required: ['convoId', 'messageId', 'value']
    }
  },
  {
    name: 'get_messages',
    description: 'Get messages in a Bluesky DM conversation with pagination. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        convoId: { type: 'string', description: 'Conversation ID' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of messages to return (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      },
      required: ['convoId']
    }
  },
  {
    name: 'send_message',
    description: 'Send a text message to a Bluesky DM conversation. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        convoId: { type: 'string', description: 'Conversation ID' },
        message: {
          type: 'object',
          description: 'Message content',
          properties: {
            text: { type: 'string', description: 'Message text content', maxLength: 1000 }
          },
          required: ['text']
        }
      },
      required: ['convoId', 'message']
    }
  },
  {
    name: 'send_message_batch',
    description: 'Send a batch of text messages to multiple Bluesky DM conversations at once. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of messages to send (max 25)',
          maxItems: 25,
          items: {
            type: 'object',
            properties: {
              convoId: { type: 'string', description: 'Conversation ID' },
              message: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'Message text content', maxLength: 1000 }
                },
                required: ['text']
              }
            },
            required: ['convoId', 'message']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'get_message_context',
    description: 'Get moderation context for a specific chat message (surrounding messages, conversation info). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Message ID to get context for' }
      },
      required: ['messageId']
    }
  },

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  {
    name: 'create_bookmark',
    description: 'Save a post as a private bookmark on your account. Only app.bsky.feed.post records are supported. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI to bookmark (at://...)', pattern: '^at://' },
        cid: { type: 'string', description: 'Post CID (content identifier)' }
      },
      required: ['uri', 'cid']
    }
  },
  {
    name: 'delete_bookmark',
    description: 'Remove a saved bookmark by its post URI. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI of the bookmark to delete (at://...)', pattern: '^at://' }
      },
      required: ['uri']
    }
  },
  {
    name: 'get_bookmarks',
    description: 'List all private bookmarks on your account with pagination. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of bookmarks to return (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      }
    }
  },

  // ── Drafts ─────────────────────────────────────────────────────────────────

  {
    name: 'create_draft',
    description: 'Create a draft post. Optionally attach up to 4 images. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Draft text content (max 300 characters)', maxLength: 300 },
        langs: { type: 'array', items: { type: 'string' }, description: 'Language codes, e.g. ["en"]', maxItems: 5 },
        images: {
          type: 'array',
          description: 'Up to 4 images to attach to the draft',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Base64 data URI, HTTPS URL, or local file path of the image' },
              alt: { type: 'string', description: 'Alt text for the image' },
              aspectRatio: {
                type: 'object',
                properties: {
                  width: { type: 'number', description: 'Image width in pixels' },
                  height: { type: 'number', description: 'Image height in pixels' }
                },
                required: ['width', 'height']
              }
            },
            required: ['source', 'alt']
          }
        }
      },
      required: ['text']
    }
  },
  {
    name: 'update_draft',
    description: 'Update an existing draft post, optionally replacing its text, languages, and images. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Draft ID to update' },
        text: { type: 'string', description: 'Updated draft text content (max 300 characters)', maxLength: 300 },
        langs: { type: 'array', items: { type: 'string' }, description: 'Language codes, e.g. ["en"]', maxItems: 5 },
        images: {
          type: 'array',
          description: 'Up to 4 images to attach to the draft',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Base64 data URI, HTTPS URL, or local file path of the image' },
              alt: { type: 'string', description: 'Alt text for the image' },
              aspectRatio: {
                type: 'object',
                properties: {
                  width: { type: 'number', description: 'Image width in pixels' },
                  height: { type: 'number', description: 'Image height in pixels' }
                },
                required: ['width', 'height']
              }
            },
            required: ['source', 'alt']
          }
        }
      },
      required: ['id', 'text']
    }
  },
  {
    name: 'delete_draft',
    description: 'Delete a draft by its ID. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Draft ID to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_drafts',
    description: 'List all drafts with pagination. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of drafts to return (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      }
    }
  },

  // ── Age Assurance ──────────────────────────────────────────────────────────

  {
    name: 'begin_age_assurance',
    description: 'Initiate the Age Assurance flow for the authenticated account. Used for age verification on Bluesky. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_age_assurance_config',
    description: 'Get the Age Assurance configuration for the current account (provider info, requirements, etc.). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_age_assurance_state',
    description: 'Get the current Age Assurance state/status for the authenticated account (verified, pending, etc.). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // ── Blob Upload ────────────────────────────────────────────────────────────

  {
    name: 'upload_blob',
    description: 'Upload a blob (image, video, or other file) to the authenticated user\'s PDS repository via com.atproto.repo.uploadBlob. Returns a blob reference that can be used in post embeds, profile media, or other record types. Supports base64 data URIs, HTTPS URLs, and local file paths. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Image or file source: base64 data URI (data:image/png;base64,...), HTTPS URL (https://...), or local absolute file path (/path/to/image.png)'
        },
        mimeType: {
          type: 'string',
          description: 'Optional MIME type override (e.g. image/png, image/jpeg, video/mp4). If omitted, inferred from file extension or data URI'
        }
      },
      required: ['source']
    }
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  {
    name: 'test_connectivity',
    description: 'Test the connection to Bluesky and check if authentication is working correctly.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }

];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(t => t.name === name);
}

export function getAllToolNames(): string[] {
  return toolDefinitions.map(t => t.name);
}
