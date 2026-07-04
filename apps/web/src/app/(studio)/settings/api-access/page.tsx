"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  Bell,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  FolderKanban,
  Globe,
  ImageUp,
  KeyRound,
  Layers3,
  LayoutDashboard,
  Pencil,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Trash2,
  UserRound,
  Wrench,
  CalendarDays,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ResponsiveActionMenu, type ActionItem } from "@/components/controls/responsive-action-menu";
import {
  StepperContent,
  StepperHeader,
  StepperMotion,
  StepperShell,
} from "@/components/controls/animated-stepper";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/ui/responsive-drawer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { sdk } from "@/lib/sdk";
import { useApiKeys } from "@/hooks/use-api-keys";
import { queryKeys } from "@/lib/http/query-keys";
import { syncApiKeyQueries } from "@/lib/http/query-sync";
import type { ApiKeyPermission, ApiKeyRecord } from "@/types";
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert";

const permissionDomains: Array<{
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions: Array<{ value: ApiKeyPermission; label: string; hint: string }>;
}> = [
  {
    id: "profile",
    title: "Profile",
    description: "Identity and account metadata attached to the key owner.",
    icon: UserRound,
    permissions: [
      {
        value: "profile:read",
        label: "Profile read",
        hint: "Read the user profile attached to the key.",
      },
      {
        value: "profile:write",
        label: "Profile write",
        hint: "Update profile details and connected account state.",
      },
    ],
  },
  {
    id: "content",
    title: "Content",
    description: "Library records and future content mutations.",
    icon: FolderKanban,
    permissions: [
      {
        value: "content:read",
        label: "Content read",
        hint: "List and fetch content records.",
      },
      {
        value: "content:write",
        label: "Content write",
        hint: "Reserved for future write endpoints.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Aggregated overview metrics and summary stats.",
    icon: LayoutDashboard,
    permissions: [
      {
        value: "dashboard:read",
        label: "Dashboard read",
        hint: "Read dashboard metrics and summary stats.",
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Notification center items and read state updates.",
    icon: Bell,
    permissions: [
      {
        value: "notifications:read",
        label: "Notifications read",
        hint: "List notification center items and status.",
      },
      {
        value: "notifications:write",
        label: "Notifications write",
        hint: "Update notification state such as marking items as read.",
      },
    ],
  },
  {
    id: "publish",
    title: "Publish",
    description: "Provider connections, publish targets, and publish actions.",
    icon: Send,
    permissions: [
      {
        value: "publish:read",
        label: "Publish read",
        hint: "Read publish providers, targets, and publish status.",
      },
      {
        value: "publish:write",
        label: "Publish write",
        hint: "Trigger publish actions and modify provider connections.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Global application settings for the Estudio workspace.",
    icon: Settings2,
    permissions: [
      {
        value: "settings:read",
        label: "Settings read",
        hint: "Read application settings.",
      },
      {
        value: "settings:write",
        label: "Settings write",
        hint: "Update application settings.",
      },
    ],
  },
  {
    id: "meta",
    title: "Meta",
    description: "Provider metadata and capability discovery endpoints.",
    icon: Globe,
    permissions: [
      {
        value: "meta:read",
        label: "Meta read",
        hint: "Read provider metadata and capability information.",
      },
    ],
  },
  {
    id: "preferences",
    title: "Preferences",
    description: "User-specific preferences such as notification settings.",
    icon: Wrench,
    permissions: [
      {
        value: "preferences:read",
        label: "Preferences read",
        hint: "Read user preference data.",
      },
      {
        value: "preferences:write",
        label: "Preferences write",
        hint: "Update user preference data.",
      },
    ],
  },
  {
    id: "uploads",
    title: "Uploads",
    description: "Draft upload lifecycle, asset staging, and cleanup.",
    icon: ImageUp,
    permissions: [
      {
        value: "uploads:read",
        label: "Uploads read",
        hint: "Inspect staged upload assets and upload metadata.",
      },
      {
        value: "uploads:write",
        label: "Uploads write",
        hint: "Create and delete staged uploads.",
      },
    ],
  },
  {
    id: "api_keys",
    title: "API Keys",
    description: "Manage API keys issued for the current user account.",
    icon: KeyRound,
    permissions: [
      {
        value: "api_keys:read",
        label: "API keys read",
        hint: "List issued API keys and their metadata.",
      },
      {
        value: "api_keys:write",
        label: "API keys write",
        hint: "Create, update, revoke, or delete API keys.",
      },
    ],
  },
];

const createEditorSteps = [
  { id: "details", label: "Details", icon: KeyRound },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "review", label: "Review", icon: Eye },
  { id: "secret", label: "Secret", icon: CheckCircle2 },
] satisfies Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>;

const editEditorSteps = [
  { id: "details", label: "Details", icon: KeyRound },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "review", label: "Review", icon: Eye },
] satisfies Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>;

type EditorStepId = "details" | "permissions" | "review" | "secret";
type PermissionMode = "restricted" | "unrestricted";

const allPermissionValues = permissionDomains.flatMap((domain) =>
  domain.permissions.map((permission) => permission.value)
);

const hasEveryPermission = (permissions: ApiKeyPermission[]) =>
  allPermissionValues.every((permission) => permissions.includes(permission));

type EditorState = {
  mode: "create" | "edit";
  apiKeyId: string | null;
  label: string;
  permissions: ApiKeyPermission[];
};

const createDefaultEditorState = (): EditorState => ({
  mode: "create",
  apiKeyId: null,
  label: "",
  permissions: ["profile:read", "content:read"],
});

const createEditorStateFromApiKey = (apiKey: ApiKeyRecord): EditorState => ({
  mode: "edit",
  apiKeyId: apiKey.id,
  label: apiKey.label,
  permissions: apiKey.permissions,
});

type DomainAccessLevel = "none" | "read" | "read-write";

const getDomainAccessLevel = (
  currentPermissions: ApiKeyPermission[],
  domainPermissions: ApiKeyPermission[]
): DomainAccessLevel => {
  const [readPermission, writePermission] = domainPermissions;
  const hasRead = readPermission ? currentPermissions.includes(readPermission) : false;
  const hasWrite = writePermission ? currentPermissions.includes(writePermission) : false;

  if (hasWrite) return "read-write";
  if (hasRead) return "read";
  return "none";
};

const setDomainAccessLevel = (
  currentPermissions: ApiKeyPermission[],
  domainPermissions: ApiKeyPermission[],
  level: DomainAccessLevel
) => {
  const [readPermission, writePermission] = domainPermissions;
  const remainingPermissions = currentPermissions.filter(
    (permission) => !domainPermissions.includes(permission)
  );

  if (level === "none") return remainingPermissions;
  if (level === "read") {
    return readPermission ? [...remainingPermissions, readPermission] : remainingPermissions;
  }

  return [
    ...remainingPermissions,
    ...(readPermission ? [readPermission] : []),
    ...(writePermission ? [writePermission] : []),
  ];
};

const formatAccessLabel = (level: DomainAccessLevel) => {
  if (level === "read-write") return "Read + Write";
  if (level === "read") return "Read";
  return "No access";
};

export default function ApiAccessSettingsPage() {
  const queryClient = useQueryClient();
  const apiKeysQuery = useApiKeys();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(createDefaultEditorState);
  const [lastSecret, setLastSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [editorStep, setEditorStep] = useState<EditorStepId>("details");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("restricted");
  const editorSteps = editor.mode === "create" ? createEditorSteps : editEditorSteps;

  const createMutation = useMutation({
    mutationFn: async (payload: unknown) => sdk.apiKeys.create(payload),
    onSuccess: async (result) => {
      setLastSecret(result.secret);
      setSecretCopied(false);
      setEditorStep("secret");
      toast.success("API key created.");
      await syncApiKeyQueries(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create API key.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
      action,
    }: {
      id: string;
      payload: unknown;
      action?: "save" | "revoke" | "restore";
    }) => {
      if (action === "revoke" || action === "restore") {
        const promise = sdk.apiKeys.update(id, payload);
        toast.promise(promise, {
          loading: action === "revoke" ? "Revoking API key..." : "Restoring API key...",
          success: action === "revoke" ? "API key revoked." : "API key restored.",
          error: (error) =>
            error instanceof Error
              ? error.message
              : action === "revoke"
                ? "Failed to revoke API key."
                : "Failed to restore API key.",
        });
        return promise;
      }

      return sdk.apiKeys.update(id, payload);
    },
    onSuccess: async (result, variables) => {
      queryClient.setQueryData<{ apiKeys: ApiKeyRecord[] } | undefined>(
        queryKeys.apiKeys,
        (current) =>
          current
            ? {
                ...current,
                apiKeys: current.apiKeys.map((apiKey) =>
                  apiKey.id === result.apiKey.id ? result.apiKey : apiKey
                ),
              }
            : current
      );
      setDrawerOpen(false);
      setEditorStep("details");
      setPermissionMode("restricted");
      if (variables.action === undefined || variables.action === "save") {
        toast.success("API key updated.");
      }
      await syncApiKeyQueries(queryClient);
    },
    onError: (error, variables) => {
      if (variables.action === "revoke" || variables.action === "restore") return;
      toast.error(error instanceof Error ? error.message : "Failed to update API key.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const promise = sdk.apiKeys.delete(id);
      toast.promise(promise, {
        loading: "Deleting API key...",
        success: "API key deleted.",
        error: (error) =>
          error instanceof Error ? error.message : "Failed to delete API key.",
      });
      return promise;
    },
    onSuccess: async (_result, id) => {
      queryClient.setQueryData<{ apiKeys: ApiKeyRecord[] } | undefined>(
        queryKeys.apiKeys,
        (current) =>
          current
            ? {
                ...current,
                apiKeys: current.apiKeys.filter((apiKey) => apiKey.id !== id),
              }
            : current
      );
      await syncApiKeyQueries(queryClient);
    },
  });

  useEffect(() => {
    if (!apiKeysQuery.error) return;
    toast.error(
      apiKeysQuery.error instanceof Error
        ? apiKeysQuery.error.message
        : "Failed to load API keys."
    );
  }, [apiKeysQuery.error]);

  const apiKeys = apiKeysQuery.data?.apiKeys ?? [];
  const isLoadingApiKeys = apiKeysQuery.isLoading;
  const activeKeyCount = apiKeys.filter((apiKey) => !apiKey.revokedAt).length;
  const revokedKeyCount = apiKeys.length - activeKeyCount;
  const effectivePermissions =
    permissionMode === "unrestricted" ? allPermissionValues : editor.permissions;
  const canSubmit = editor.label.trim().length > 0 && effectivePermissions.length > 0;
  const canContinueDetails = editor.label.trim().length > 0;
  const canContinuePermissions = effectivePermissions.length > 0;

  const stepValidation = (stepId: string) => {
    if (stepId === "permissions") return canContinueDetails;
    if (stepId === "review") return canContinueDetails && canContinuePermissions;
    if (stepId === "secret") return false;
    return true;
  };

  const reviewDomains = permissionDomains
    .map((domain) => {
      const domainPermissionValues = domain.permissions.map((permission) => permission.value);
      const access = getDomainAccessLevel(effectivePermissions, domainPermissionValues);

      if (access === "none") return null;

      return {
        ...domain,
        access,
      };
    })
    .filter(Boolean) as Array<(typeof permissionDomains)[number] & { access: DomainAccessLevel }>;

  const submitEditor = async () => {
    const payload = {
      label: editor.label,
      permissions: effectivePermissions,
      resources: {
        allowAllContent: true,
        contentIds: [],
      },
      expiresAt: null,
    };

    if (editor.mode === "create") {
      await createMutation.mutateAsync(payload);
      return;
    }

    if (!editor.apiKeyId) return;
    await updateMutation.mutateAsync({
      id: editor.apiKeyId,
      payload,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0f0f10]">
        <CardHeader className="relative p-0">
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
          <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/6 dark:text-zinc-100">
                <KeyRound className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-lg">API Access</CardTitle>
                <CardDescription className="mt-1 max-w-2xl">
                  Issue user-owned API keys, scope what they can read, and manage them from one place.
                </CardDescription>
                <div className="mt-4 grid max-w-3xl grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <ApiAccessStatCard
                    icon={KeyRound}
                    label="Total"
                    value={isLoadingApiKeys ? "..." : apiKeys.length}
                  />
                  <ApiAccessStatCard
                    icon={CheckCircle2}
                    label="Active"
                    value={isLoadingApiKeys ? "..." : activeKeyCount}
                    tone="active"
                  />
                  <ApiAccessStatCard
                    icon={Ban}
                    label="Revoked"
                    value={isLoadingApiKeys ? "..." : revokedKeyCount}
                    tone="revoked"
                  />
                  <ApiAccessStatCard
                    icon={Layers3}
                    label="Permissions"
                    value={allPermissionValues.length}
                  />
                </div>
              </div>
            </div>
            <Button
              type="button"
              className="gap-2 sm:self-start"
              onClick={() => {
                setEditor(createDefaultEditorState());
                setPermissionMode("restricted");
                setLastSecret(null);
                setSecretCopied(false);
                setEditorStep("details");
                setDrawerOpen(true);
              }}
            >
              <Sparkles className="h-4 w-4" />
              Add API key
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {isLoadingApiKeys ? (
          <>
            <ApiKeyCardSkeleton />
            <ApiKeyCardSkeleton />
            <ApiKeyCardSkeleton />
          </>
        ) : null}

        {!isLoadingApiKeys && apiKeys.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white dark:border-white/10 dark:bg-white/3">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <KeyRound className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="font-medium text-slate-900 dark:text-zinc-50">No API keys yet</p>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Create a key to start accessing Estudio programmatically.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoadingApiKeys
          ? apiKeys.map((apiKey) => (
              <ApiKeyCard
                key={apiKey.id}
                apiKey={apiKey}
                onEdit={() => {
                  setEditor(createEditorStateFromApiKey(apiKey));
                  setPermissionMode(hasEveryPermission(apiKey.permissions) ? "unrestricted" : "restricted");
                  setLastSecret(null);
                  setSecretCopied(false);
                  setEditorStep("details");
                  setDrawerOpen(true);
                }}
            onToggleRevoked={(revoked) =>
              updateMutation.mutate({
                id: apiKey.id,
                payload: { revoked },
                action: revoked ? "revoke" : "restore",
              })
            }
                onDelete={() => deleteMutation.mutate(apiKey.id)}
              />
            ))
          : null}
      </div>

      <ResponsiveDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setEditor(createDefaultEditorState());
            setEditorStep("details");
            setPermissionMode("restricted");
            setLastSecret(null);
            setSecretCopied(false);
          }
        }}
        className="flex min-h-0 w-screen max-w-none flex-col overflow-hidden border-0 bg-background shadow-2xl [--drawer-content-min-height:min(58dvh,560px)] sm:max-h-[min(92dvh,980px)] sm:border sm:[--drawer-content-min-height:520px] md:w-[min(90vw,1320px)] md:max-w-[min(90vw,1320px)] lg:w-[min(86vw,1040px)] lg:max-w-[min(86vw,1440px)]"
      >
        <ResponsiveDrawerHeader className="shrink-0">
          <ResponsiveDrawerTitle>
            {editor.mode === "create" ? "Create API key" : "Edit API key"}
          </ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            Choose the key label and permissions exposed to the app API.
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerContent className="min-h-0 flex-1 overflow-x-clip px-4 pb-6 sm:px-1 md:overflow-x-hidden md:overflow-y-auto">
          <StepperShell
            steps={editorSteps}
            currentId={editorStep}
            isComplete={false}
            onStepClick={
              editorStep === "secret" ? undefined : (id) => setEditorStep(id as EditorStepId)
            }
            validate={stepValidation}
          >
            <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur supports-backdrop-filter:bg-background">
              <StepperHeader />
            </div>
            <StepperContent>
              {({ direction }) => (
                <StepperMotion stepKey={editorStep} direction={direction} className="space-y-5 pt-4">
                  {editorStep === "details" ? (
                    <div className="space-y-5">
                      <div className="grid gap-2">
                        <Label htmlFor="api-key-label">Label</Label>
                        <Input
                          id="api-key-label"
                          value={editor.label}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, label: event.target.value }))
                          }
                          placeholder="Automation worker"
                        />
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm dark:bg-white/10 dark:text-zinc-100">
                            <SlidersHorizontal className="h-4 w-4" />
                          </span>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                              Name this key for the workflow that will use it.
                            </p>
                            <p className="text-xs text-slate-500 dark:text-zinc-400">
                              Good labels make it easier to revoke the right automation later.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {editorStep === "permissions" ? (
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                              Permission scopes
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                              Decide which parts of the API this key can access.
                            </p>
                          </div>
                          <Tabs
                            value={permissionMode}
                            onValueChange={(value) => {
                              const nextMode = value as PermissionMode;
                              setPermissionMode(nextMode);
                              if (nextMode === "unrestricted") {
                                setEditor((current) => ({
                                  ...current,
                                  permissions: allPermissionValues,
                                }));
                              }
                            }}
                            className="w-full gap-0 sm:w-75"
                          >
                            <TabsList className="grid h-9 w-full grid-cols-2">
                              <TabsTrigger value="restricted">Restricted</TabsTrigger>
                              <TabsTrigger value="unrestricted">Unrestricted</TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>
                        {permissionMode === "unrestricted" ? (
                          <Alert variant="warning" appearance="light" icon="warning">
                            <AlertIcon>
                              <TriangleAlert />
                            </AlertIcon>
                            <AlertContent>
                              <AlertTitle>Unrestricted API key</AlertTitle>
                              <AlertDescription>
                                This key receives every current API permission, including write access where available. Use it only for trusted server-side integrations.
                              </AlertDescription>
                            </AlertContent>
                          </Alert>
                        ) : (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
                            {permissionDomains.map((domain, index) => {
                              const DomainIcon = domain.icon;
                              const domainPermissionValues = domain.permissions.map(
                                (permission) => permission.value
                              );
                              const domainAccessLevel = getDomainAccessLevel(
                                editor.permissions,
                                domainPermissionValues
                              );
                              const supportsWrite = domainPermissionValues.length > 1;

                              return (
                                <div
                                  key={domain.id}
                                  className={index > 0 ? "border-t border-slate-200 dark:border-white/10" : ""}
                                >
                                  <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
                                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                                      <DomainIcon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                                            {domain.title}
                                          </p>
                                          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                                            {domain.description}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-4">
                                        <Tabs
                                          value={domainAccessLevel}
                                          onValueChange={(value) => {
                                            setEditor((current) => ({
                                              ...current,
                                              permissions: setDomainAccessLevel(
                                                current.permissions,
                                                domainPermissionValues,
                                                value as DomainAccessLevel
                                              ),
                                            }));
                                          }}
                                          className="gap-0"
                                        >
                                          <TabsList className="grid h-10 w-full grid-cols-3">
                                            <TabsTrigger value="none">None</TabsTrigger>
                                            <TabsTrigger value="read">Read</TabsTrigger>
                                            <TabsTrigger value="read-write" disabled={!supportsWrite}>
                                              Read+Write
                                            </TabsTrigger>
                                          </TabsList>
                                        </Tabs>
                                        <p className="mt-3 pl-1 text-xs text-slate-500 dark:text-zinc-400">
                                          {domainAccessLevel === "none"
                                            ? `No ${domain.title.toLowerCase()} access granted.`
                                            : domainAccessLevel === "read"
                                              ? domain.permissions[0]?.hint
                                              : domain.permissions[1]?.hint ?? domain.permissions[0]?.hint}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {editorStep === "review" ? (
                    <div className="grid gap-4">
                      <Card className="border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/3">
                        <CardContent>
                          <div className="space-y-4">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-zinc-100">
                                <KeyRound className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                  {editor.mode === "create" ? "Ready to issue" : "Ready to save"}
                                </p>
                                <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-zinc-50">
                                  {editor.label || "Untitled key"}
                                </p>
                                <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                                  Review the enabled API domains before continuing.
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {reviewDomains.length > 0 ? (
                                reviewDomains.map((domain) => {
                                  const DomainIcon = domain.icon;

                                  return (
                                    <div
                                      key={domain.id}
                                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-black/10"
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                                          <DomainIcon className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-900 dark:text-zinc-100">
                                            {domain.title}
                                          </p>
                                          <p className="text-xs text-slate-500 dark:text-zinc-400">
                                            {domain.description}
                                          </p>
                                        </div>
                                      </div>
                                      <Badge variant="secondary">{formatAccessLabel(domain.access)}</Badge>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
                                  No domains are enabled yet.
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ) : null}

                  {editorStep === "secret" ? (
                    <div className="mx-auto w-full">
                      <div className="rounded-[28px] border border-slate-200/80 bg-white/80 p-6  backdrop-blur dark:border-white/10 dark:bg-white/4.5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                              <CheckCircle2 className="h-5 w-5" />
                            </span>
                            <div className="space-y-1">
                              <h3 className="text-xl font-semibold text-slate-950 dark:text-zinc-50">
                                API key ready
                              </h3>
                              <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-zinc-300">
                                Store this secret in your app or password manager now. Once this drawer closes, Estudio will only retain the key prefix.
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded-full border-emerald-500/25 bg-emerald-500/8 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                          >
                            Created
                          </Badge>
                        </div>

                        {lastSecret ? (
                          <div className="mt-8 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <Label
                                htmlFor="created-api-key-secret"
                                className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500"
                              >
                                Secret key
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-full px-3 text-slate-600 hover:text-slate-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                                onClick={() => {
                                  navigator.clipboard?.writeText(lastSecret).then(
                                    () => {
                                      setSecretCopied(true);
                                      toast.success("Secret copied.");
                                    },
                                    () => {
                                      toast.error("Failed to copy secret.");
                                    }
                                  );
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {secretCopied ? "Copied" : "Copy"}
                              </Button>
                            </div>
                            <div
                              id="created-api-key-secret"
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-black/20"
                            >
                              <code className="block overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-slate-950 dark:text-zinc-100">
                                {lastSecret}
                              </code>
                            </div>
                            <Alert className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80" />
                              This is the only time the full secret will be visible.
                            </Alert>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </StepperMotion>
              )}
            </StepperContent>
          </StepperShell>
        </ResponsiveDrawerContent>
        <ResponsiveDrawerFooter className="sticky bottom-0 z-20 mt-0! shrink-0 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-background/90 sm:px-1">
          {editorStep !== "secret" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (editorStep === "details") {
                  setDrawerOpen(false);
                  setEditor(createDefaultEditorState());
                  setEditorStep("details");
                  setPermissionMode("restricted");
                  setLastSecret(null);
                  return;
                }
                setEditorStep(editorStep === "review" ? "permissions" : "details");
              }}
            >
              {editorStep === "details" ? "Cancel" : "Back"}
            </Button>
          ) : null}
          {editorStep === "secret" ? (
            <Button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                setEditor(createDefaultEditorState());
                setEditorStep("details");
                setPermissionMode("restricted");
                setLastSecret(null);
                setSecretCopied(false);
              }}
            >
              Done
            </Button>
          ) : editorStep !== "review" ? (
            <Button
              type="button"
              onClick={() => {
                if (editorStep === "details" && canContinueDetails) {
                  setEditorStep("permissions");
                }
                if (editorStep === "permissions" && canContinuePermissions) {
                  setEditorStep("review");
                }
              }}
              disabled={
                (editorStep === "details" && !canContinueDetails) ||
                (editorStep === "permissions" && !canContinuePermissions)
              }
            >
              {editorStep === "permissions" ? "Review access" : "Continue"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void submitEditor()}
              disabled={!canSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
              loadingText={editor.mode === "create" ? "Creating..." : "Saving..."}
            >
              {editor.mode === "create" ? "Create and reveal key" : "Save changes"}
            </Button>
          )}
        </ResponsiveDrawerFooter>
      </ResponsiveDrawer>
    </div>
  );
}

function ApiKeyCard({
  apiKey,
  onEdit,
  onToggleRevoked,
  onDelete,
}: {
  apiKey: ApiKeyRecord;
  onEdit: () => void;
  onToggleRevoked: (revoked: boolean) => void;
  onDelete: () => void;
}) {
  const isRevoked = Boolean(apiKey.revokedAt);

  const actionItems: ActionItem[] = [
    {
      label: "Edit key",
      icon: Pencil,
      onSelect: onEdit,
    },
    {
      label: apiKey.revokedAt ? "Restore key" : "Revoke key",
      icon: ShieldCheck,
      onSelect: () => onToggleRevoked(!apiKey.revokedAt),
    },
    {
      type: "confirm",
      label: "Delete key",
      description: "This permanently removes the key from the account.",
      icon: Trash2,
      destructive: true,
      onConfirm: () => onDelete(),
    },
  ];

  return (
    <Card className="group overflow-hidden border-slate-200 bg-white shadow-sm transition-[border-color,background-color,box-shadow] hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-[#121213] dark:hover:border-white/20">
      <CardContent className="p-0">
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full data-[state=active]:bg-emerald-400 data-[state=revoked]:bg-rose-400"
                data-state={isRevoked ? "revoked" : "active"}
              />
              <span className="truncate text-base font-semibold text-slate-900 dark:text-zinc-50">
                {apiKey.label}
              </span>
              <Badge variant={isRevoked ? "destructive" : "secondary"}>
                {isRevoked ? "Revoked" : "Active"}
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px]">
                {apiKey.tokenPrefix}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)]">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <Layers3 className="h-4 w-4 shrink-0" />
                <span>{apiKey.permissions.length} permissions</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <Clock3 className="h-4 w-4 shrink-0" />
                <span className="truncate">Last used: {apiKey.lastUsedAt ?? "Never"}</span>
              </div>

              <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  Created {new Date(apiKey.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center border-t border-slate-200 px-5 pt-4 dark:border-white/10 sm:border-t-0 sm:px-4 sm:pt-0">
            <ResponsiveActionMenu
              title={apiKey.label}
              items={actionItems}
              triggerClassName="h-9 w-full"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiAccessStatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "default" | "active" | "revoked";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-white/4 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 data-[tone=active]:text-emerald-600 data-[tone=revoked]:text-rose-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300 dark:data-[tone=active]:text-emerald-300 dark:data-[tone=revoked]:text-rose-300"
        data-tone={tone}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-slate-500 dark:text-zinc-400">{label}</div>
        <div className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-zinc-50">
          {value}
        </div>
      </div>
    </div>
  );
}

function ApiKeyCardSkeleton() {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#121213]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)]">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
