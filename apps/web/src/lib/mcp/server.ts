// eslint-disable-next-line import/no-unresolved
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";

import {
  ensureActorContentAccess,
  ensureActorPermission,
  type RequestActor,
} from "@/lib/auth/request-actor";
import { handleGetDashboardStats } from "@/lib/api/dashboard";
import { handleCreateContent, handleListContent } from "@/lib/api/content/collection";
import {
  handleDeleteContentItem,
  handleGetContentItem,
  handlePatchContentItem,
} from "@/lib/api/content/item";
import { handleGetCaptionProgress } from "@/lib/api/content/caption-progress";
import {
  handleSaveCaptions,
  handleTriggerCaptions,
  saveCaptionsRequestSchema,
  triggerCaptionsRequestSchema,
} from "@/lib/api/content/captions";
import { handleGetRenderProgress } from "@/lib/api/content/progress";
import { handleListRenders, handleDeleteRender } from "@/lib/api/content/renders";
import { handleCancelRenderRequest, handleRenderRequest } from "@/lib/api/content/render";
import { handleRescanContent } from "@/lib/api/content/rescan";
import { handleGetMetaProviders } from "@/lib/api/meta/providers";
import { handleListNotifications } from "@/lib/api/notifications/list";
import { handleMarkNotificationsRead } from "@/lib/api/notifications/mark-read";
import { handleGetPublishProviders } from "@/lib/api/publish/providers";
import { handleGetPublishProgress } from "@/lib/api/content/publish-progress";
import { handleListPublishes } from "@/lib/api/content/publishes";
import { handleGetSettings, handleUpdateSettings } from "@/lib/api/settings";
import { handleDeleteDraft } from "@/lib/api/uploads";
import {
  handleCreateUserApiKey,
  handleDeleteUserApiKey,
  handleListUserApiKeys,
  handleUpdateUserApiKey,
} from "@/lib/api/user/api-keys";
import { handleGetProfile, handleUpdateProfile, profileSchema } from "@/lib/api/user/profile";
import {
  handleGetUserNotificationPreferences,
  handleUpdateUserNotificationPreferences,
} from "@/lib/api/user-preferences";
import {
  apiKeyCreateSchema,
  apiKeyUpdateSchema,
  type ApiKeyPermission,
} from "@/lib/data/api-keys";
import {
  contentDraftCreateRequestSchema,
  contentQuerySchema,
  contentUpdateSchema,
} from "@/lib/data/content";
import {
  notificationsListQuerySchema,
  notificationsMarkReadRequestSchema,
} from "@/lib/data/notifications";
import { triggerRenderRequestSchema } from "@/lib/data/render";
import { settingsUpdateRequestSchema } from "@/lib/data/settings";
import { userNotificationPreferencesUpdateRequestSchema } from "@/lib/data/user-preferences";
import { getUserUploadsDir } from "@/lib/content/store";
import { getStorage } from "@/lib/storage";

type ToolContext = {
  actor: RequestActor;
  request: Request;
};

type QueryValue = string | number | boolean | null | undefined;
type QueryInput = Record<string, QueryValue>;
type ToolInput = Record<string, unknown>;

const storage = getStorage();

const jsonToolResult = (data: unknown): CallToolResult => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    },
  ],
});

const getUploadWorkflowGuide = (context: ToolContext) => {
  const baseUrl = new URL(context.request.url);
  const uploadsUrl = new URL("/api/uploads", baseUrl);
  const contentUrl = new URL("/api/content", baseUrl);

  return {
    summary:
      "Upload assets as drafts first, then create the content item from the returned draft paths.",
    recommendedForAgents:
      "For real files, especially videos, upload directly to the HTTP multipart endpoint instead of sending file bytes through MCP tool arguments.",
    authentication: {
      header: "Authorization: Bearer <ESTUDIO_API_KEY>",
      requiredPermissions: {
        uploadDrafts: ["uploads:write"],
        createContent: ["content:write"],
        inspectDrafts: ["uploads:read"],
      },
      currentActor:
        context.actor.kind === "api-key"
          ? {
              kind: context.actor.kind,
              permissions: context.actor.apiKey.permissions,
              resources: context.actor.apiKey.resources,
            }
          : { kind: context.actor.kind },
    },
    httpDraftUpload: {
      method: "POST",
      url: uploadsUrl.toString(),
      contentType: "multipart/form-data",
      fields: {
        file: "Binary file body for the asset.",
        kind: "One of: thumbnail, video, song.",
      },
      response: {
        path: "Draft storage path. Pass this into estudio_content_create.",
        kind: "The asset kind that was uploaded.",
        expiresAt: "Unix timestamp in milliseconds. Drafts currently expire after roughly 6 hours.",
      },
      curlExample:
        "curl -X POST https://studio.example.com/api/uploads -H 'Authorization: Bearer <ESTUDIO_API_KEY>' -F kind=video -F file=@./video.mp4",
    },
    createContent: {
      mcpTool: "estudio_content_create",
      httpEndpoint: {
        method: "POST",
        url: contentUrl.toString(),
      },
      requiredDraftPathFields: ["thumbnailPath", "videoPath", "songPath"],
      optionalFields: ["title", "mode", "settings"],
      sequence: [
        "Upload thumbnail draft and keep returned path.",
        "Upload video draft and keep returned path.",
        "Upload song draft and keep returned path.",
        "Call estudio_content_create with thumbnailPath, videoPath, songPath, and metadata.",
      ],
    },
    mcpUploadPolicy: {
      inlineFileUpload: "disabled",
      reason:
        "MCP tool calls should not carry binary payloads or base64 file data because that bloats client context, transport payloads, logs, and model/tool history.",
      requiredPath:
        "Upload binaries with the HTTP multipart endpoint, then use MCP tools with the returned draft paths.",
    },
    safeInspection: {
      tool: "estudio_upload_draft_info",
      note: "Returns draft metadata and an authenticated app API URL without returning raw binary bytes into the model context.",
    },
  };
};

const responseToToolResult = async (response: Response): Promise<CallToolResult> => {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            typeof body === "string"
              ? body || response.statusText
              : JSON.stringify(body, null, 2),
        },
      ],
    };
  }

  return jsonToolResult(body);
};

const requirePermission = (actor: RequestActor, permission: ApiKeyPermission) => {
  const error = ensureActorPermission(actor, permission);
  if (!error) return null;
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Missing permission: ${permission}`,
      },
    ],
  } satisfies CallToolResult;
};

const requestWithQuery = (baseRequest: Request, query: QueryInput) => {
  const url = new URL(baseRequest.url);
  url.search = "";

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return new Request(url, {
    headers: baseRequest.headers,
    method: "GET",
  });
};

const requestWithJson = (baseRequest: Request, payload: unknown, method = "POST") =>
  new Request(baseRequest.url, {
    headers: {
      ...Object.fromEntries(baseRequest.headers.entries()),
      "content-type": "application/json",
    },
    method,
    body: JSON.stringify(payload ?? {}),
  });

const addTool = (
  server: McpServer,
  context: ToolContext,
  name: string,
  config: {
    title: string;
    description: string;
    permission: ApiKeyPermission;
    inputSchema?: z.ZodRawShape;
  },
  handler: (args: ToolInput) => Promise<Response>
) => {
  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
    },
    async (args: ToolInput) => {
      const permissionError = requirePermission(context.actor, config.permission);
      if (permissionError) return permissionError;

      const response = await handler(args ?? {});
      return responseToToolResult(response);
    }
  );
};

const requireContentAccess = (actor: RequestActor, contentId: string) => {
  const error = ensureActorContentAccess(actor, contentId);
  if (!error) return null;
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Content resource is not allowed: ${contentId}`,
      },
    ],
  } satisfies CallToolResult;
};

export const createEstudioMcpServer = (context: ToolContext) => {
  const server = new McpServer(
    {
      name: "estudio",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.registerTool(
    "estudio_upload_workflow_guide",
    {
      title: "Upload workflow guide",
      description:
        "Explain the safe draft-upload-to-content workflow for agents and API clients without moving file bytes through MCP context.",
    },
    async () => jsonToolResult(getUploadWorkflowGuide(context))
  );

  addTool(
    server,
    context,
    "estudio_profile_get",
    {
      title: "Get profile",
      description: "Return the authenticated user's profile metadata.",
      permission: "profile:read",
    },
    () => handleGetProfile(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_profile_update",
    {
      title: "Update profile",
      description: "Update the authenticated user's profile name.",
      permission: "profile:write",
      inputSchema: profileSchema.shape,
    },
    (args) => handleUpdateProfile(requestWithJson(context.request, args, "PUT"), context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_upload_draft_delete",
    {
      title: "Delete draft asset",
      description: "Delete a staged draft upload path before it is turned into a content item.",
      permission: "uploads:write",
      inputSchema: {
        path: z.string().min(1),
      },
    },
    (args) => handleDeleteDraft(requestWithJson(context.request, args, "DELETE"), context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_upload_draft_info",
    {
      title: "Get draft asset info",
      description:
        "Return metadata and a temporary app API URL for a staged draft upload without echoing binary file data into the agent context.",
      permission: "uploads:read",
      inputSchema: {
        path: z.string().min(1),
      },
    },
    async (args) => {
      const targetPath = String(args.path ?? "");
      const uploadsBaseDir = getUserUploadsDir(context.actor.userId);
      if (!targetPath.startsWith(uploadsBaseDir)) {
        return new Response(JSON.stringify({ error: "Invalid path." }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const stats = await storage.stat(targetPath);
      if (!stats) {
        return new Response(JSON.stringify({ error: "Draft not found." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      const url = new URL(context.request.url);
      url.pathname = "/api/uploads";
      url.search = "";
      url.searchParams.set("path", targetPath);

      return Response.json({
        path: targetPath,
        size: stats.size,
        modifiedAt: new Date(stats.mtimeMs).toISOString(),
        url: url.toString(),
      });
    }
  );

  addTool(
    server,
    context,
    "estudio_content_list",
    {
      title: "List content",
      description: "List content items visible to the authenticated actor.",
      permission: "content:read",
      inputSchema: contentQuerySchema.partial().shape,
    },
    (args) =>
      handleListContent(
        requestWithQuery(context.request, args as QueryInput),
        context.actor.userId
      )
  );

  addTool(
    server,
    context,
    "estudio_content_get",
    {
      title: "Get content item",
      description: "Fetch one content item by ID.",
      permission: "content:read",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args) => {
      const id = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, id);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleGetContentItem(context.actor.userId, id);
    }
  );

  addTool(
    server,
    context,
    "estudio_content_create",
    {
      title: "Create content item",
      description:
        "Create a content item from existing draft upload paths for thumbnail, video, and song assets.",
      permission: "content:write",
      inputSchema: contentDraftCreateRequestSchema.shape,
    },
    (args) =>
      handleCreateContent(requestWithJson(context.request, args), context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_content_update",
    {
      title: "Update content item",
      description: "Patch content metadata, mode, settings, status, and palette fields.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
        ...contentUpdateSchema.shape,
      },
    },
    async (args) => {
      const { id, ...payload } = args;
      const contentId = String(id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handlePatchContentItem(
        requestWithJson(context.request, payload, "PATCH"),
        context.actor.userId,
        contentId
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_content_delete",
    {
      title: "Delete content item",
      description: "Delete a content item and optionally keep rendered outputs.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
        keepRenders: z.boolean().optional(),
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleDeleteContentItem(
        requestWithQuery(context.request, {
          keepRenders: args.keepRenders === true ? "1" : undefined,
        }),
        context.actor.userId,
        contentId
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_content_trigger_render",
    {
      title: "Trigger render",
      description: "Queue or run a render for a content item.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
        ...triggerRenderRequestSchema.shape,
      },
    },
    async (args) => {
      const { id, ...payload } = args;
      const contentId = String(id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleRenderRequest(
        requestWithJson(context.request, payload),
        context.actor.userId,
        contentId
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_content_cancel_render",
    {
      title: "Cancel render",
      description: "Cancel an active or queued render for a content item.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleCancelRenderRequest(context.actor.userId, contentId);
    }
  );

  addTool(
    server,
    context,
    "estudio_content_trigger_captions",
    {
      title: "Trigger captions",
      description: "Generate captions for a content item.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
        ...triggerCaptionsRequestSchema.shape,
      },
    },
    async (args) => {
      const { id, ...payload } = args;
      const contentId = String(id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleTriggerCaptions(
        requestWithJson(context.request, payload),
        context.actor.userId,
        contentId
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_content_captions_get",
    {
      title: "Get captions",
      description:
        "Fetch a content item including saved captions data from its settings payload.",
      permission: "content:read",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleGetContentItem(context.actor.userId, contentId);
    }
  );

  addTool(
    server,
    context,
    "estudio_content_save_captions",
    {
      title: "Save captions",
      description: "Persist caption document data for a content item.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
        ...saveCaptionsRequestSchema.shape,
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleSaveCaptions(
        requestWithJson(context.request, { captionsData: args.captionsData }, "PUT"),
        context.actor.userId,
        contentId
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_content_rescan",
    {
      title: "Rescan content",
      description: "Rescan the user's content storage and recreate missing records.",
      permission: "content:write",
    },
    () => handleRescanContent(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_content_render_progress",
    {
      title: "Get render progress",
      description: "Return active render progress snapshots.",
      permission: "content:read",
    },
    () => handleGetRenderProgress(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_content_caption_progress",
    {
      title: "Get caption progress",
      description: "Return active caption progress snapshots.",
      permission: "content:read",
    },
    () => handleGetCaptionProgress(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_content_renders_list",
    {
      title: "List renders",
      description: "List rendered output files for a content item.",
      permission: "content:read",
      inputSchema: {
        id: z.string().min(1),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleListRenders(
        requestWithQuery(context.request, args as QueryInput),
        context.actor.userId,
        contentId
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_content_render_delete",
    {
      title: "Delete render",
      description: "Delete a rendered output file for a content item.",
      permission: "content:write",
      inputSchema: {
        id: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleDeleteRender(context.actor.userId, contentId, String(args.name ?? ""));
    }
  );

  addTool(
    server,
    context,
    "estudio_dashboard_stats_get",
    {
      title: "Get dashboard stats",
      description: "Return dashboard metrics for the authenticated user.",
      permission: "dashboard:read",
      inputSchema: {
        range: z.enum(["all"]).optional(),
        days: z.number().int().positive().max(365).optional(),
      },
    },
    (args) =>
      handleGetDashboardStats(
        context.actor.userId,
        requestWithQuery(context.request, args as QueryInput)
      )
  );

  addTool(
    server,
    context,
    "estudio_notifications_list",
    {
      title: "List notifications",
      description: "List persisted and live notifications.",
      permission: "notifications:read",
      inputSchema: notificationsListQuerySchema.partial().shape,
    },
    (args) =>
      handleListNotifications(context.actor.userId, {
        limit: typeof args.limit === "number" ? args.limit.toString() : undefined,
        unreadOnly:
          typeof args.unreadOnly === "boolean"
            ? args.unreadOnly.toString()
            : undefined,
      })
  );

  addTool(
    server,
    context,
    "estudio_notifications_mark_read",
    {
      title: "Mark notifications read",
      description: "Mark all notifications or specific notification IDs as read.",
      permission: "notifications:write",
      inputSchema: notificationsMarkReadRequestSchema.shape,
    },
    (args) => handleMarkNotificationsRead(context.actor.userId, args)
  );

  addTool(
    server,
    context,
    "estudio_publish_providers_list",
    {
      title: "List publish providers",
      description: "List publish provider targets and connection status.",
      permission: "publish:read",
    },
    () => handleGetPublishProviders(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_publish_progress_get",
    {
      title: "Get publish progress",
      description: "Return active publish progress snapshots.",
      permission: "publish:read",
    },
    () => handleGetPublishProgress(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_content_publishes_list",
    {
      title: "List content publishes",
      description: "List publish records and available publish targets for a content item.",
      permission: "publish:read",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (args) => {
      const contentId = String(args.id ?? "");
      const resourceError = requireContentAccess(context.actor, contentId);
      if (resourceError) {
        return new Response(JSON.stringify({ error: resourceError.content[0]?.text }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return handleListPublishes(context.request, contentId, context.actor.userId);
    }
  );

  addTool(
    server,
    context,
    "estudio_settings_get",
    {
      title: "Get settings",
      description: "Return app settings and storage stats for the authenticated user.",
      permission: "settings:read",
    },
    () => handleGetSettings(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_settings_update",
    {
      title: "Update settings",
      description: "Update app settings for the authenticated user.",
      permission: "settings:write",
      inputSchema: settingsUpdateRequestSchema.shape,
    },
    (args) =>
      handleUpdateSettings(
        requestWithJson(context.request, args, "PATCH"),
        context.actor.userId
      )
  );

  addTool(
    server,
    context,
    "estudio_notification_preferences_get",
    {
      title: "Get notification preferences",
      description: "Return notification preference settings.",
      permission: "preferences:read",
    },
    () => handleGetUserNotificationPreferences(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_notification_preferences_update",
    {
      title: "Update notification preferences",
      description: "Patch push notification preferences.",
      permission: "preferences:write",
      inputSchema: userNotificationPreferencesUpdateRequestSchema.shape,
    },
    (args) =>
      handleUpdateUserNotificationPreferences(
        requestWithJson(context.request, args, "PATCH"),
        context.actor.userId
      )
  );

  addTool(
    server,
    context,
    "estudio_api_keys_list",
    {
      title: "List API keys",
      description: "List API keys owned by the authenticated user.",
      permission: "api_keys:read",
    },
    () => handleListUserApiKeys(context.actor.userId)
  );

  addTool(
    server,
    context,
    "estudio_api_keys_create",
    {
      title: "Create API key",
      description:
        "Create a user-owned API key. The secret is returned once and should be copied immediately.",
      permission: "api_keys:write",
      inputSchema: apiKeyCreateSchema.shape,
    },
    (args) =>
      handleCreateUserApiKey(
        requestWithJson(context.request, args),
        context.actor.userId
      )
  );

  addTool(
    server,
    context,
    "estudio_api_keys_update",
    {
      title: "Update API key",
      description: "Update an API key label, permissions, resources, expiry, or revoked state.",
      permission: "api_keys:write",
      inputSchema: {
        id: z.string().min(1),
        ...apiKeyUpdateSchema.shape,
      },
    },
    (args) => {
      const { id, ...payload } = args;
      return handleUpdateUserApiKey(
        requestWithJson(context.request, payload, "PATCH"),
        context.actor.userId,
        String(id ?? "")
      );
    }
  );

  addTool(
    server,
    context,
    "estudio_api_keys_delete",
    {
      title: "Delete API key",
      description: "Delete an API key owned by the authenticated user.",
      permission: "api_keys:write",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    (args) => handleDeleteUserApiKey(context.actor.userId, String(args.id ?? ""))
  );

  addTool(
    server,
    context,
    "estudio_meta_providers_get",
    {
      title: "Get auth providers",
      description: "Return enabled authentication provider metadata.",
      permission: "meta:read",
    },
    () => handleGetMetaProviders()
  );

  return server;
};
