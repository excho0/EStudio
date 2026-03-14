"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { captionDocumentSchema, type CaptionDocument, type ContentItem } from "@/types";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import {
  DEFAULT_CONTENT_MODE,
  getOutputDefaultsForMode,
  normalizeSettingsMap,
  resolveContentSettings,
} from "@/lib/content/modes";
import { getContentModeDefinition, getContentModeUi } from "@/lib/content/modes/ui-registry";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import { CaptionEditor } from "@/components/captions/caption-editor-drawer";
import type { CaptionEditorPreviewProps } from "@/components/captions/editor/caption-editor-preview";

const buildSettingsWithSharedCaptions = (
  mode: string,
  settings: Record<string, unknown> | null | undefined,
  captionsData: CaptionDocument
) => {
  const settingsMap = normalizeSettingsMap(mode, settings ?? {});
  const shared =
    settingsMap.__shared &&
    typeof settingsMap.__shared === "object" &&
    !Array.isArray(settingsMap.__shared)
      ? (settingsMap.__shared as Record<string, unknown>)
      : {};
  return {
    ...settingsMap,
    __shared: {
      ...shared,
      captionsData,
    },
  };
};

const parseSharedCaptionsData = (settings: unknown): CaptionDocument | null => {
  const settingsMap = normalizeSettingsMap(undefined, settings ?? {});
  const shared = settingsMap.__shared;
  if (!shared || typeof shared !== "object" || Array.isArray(shared)) {
    return null;
  }
  const parsed = captionDocumentSchema
    .nullable()
    .safeParse((shared as Record<string, unknown>).captionsData ?? null);
  return parsed.success ? parsed.data : null;
};

export default function EditCaptionsPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { socket, connected } = useSocketIO();
  const hasRedirectedRef = useRef(false);
  const [generationWatch, setGenerationWatch] = useState<{
    contentId: string;
  } | null>(null);

  const contentQuery = useQuery<ContentItem>({
    queryKey: queryKeys.contentItem(params.id),
    enabled: Boolean(params.id),
    refetchOnMount: "always",
    queryFn: async () => sdk.content.get(params.id),
  });

  const item = contentQuery.data ?? null;
  const mode = item?.mode ?? DEFAULT_CONTENT_MODE;
  const settingsMap = useMemo(
    () => normalizeSettingsMap(mode, item?.settings ?? {}),
    [item?.settings, mode]
  );
  const modeDefinition = useMemo(() => getContentModeDefinition(mode), [mode]);
  const resolvedSettings = useMemo<typeof modeDefinition.defaults>(() => {
    try {
      return resolveContentSettings(mode, settingsMap)
        .settings as typeof modeDefinition.defaults;
    } catch {
      return modeDefinition.defaults;
    }
  }, [mode, modeDefinition, settingsMap]);

  const captionsLanguage = useMemo(() => {
    return typeof resolvedSettings.captionsLanguage === "string"
      ? resolvedSettings.captionsLanguage.trim()
      : "";
  }, [resolvedSettings.captionsLanguage]);

  const canEditCaptions =
    resolvedSettings.captionsEnabled === true && captionsLanguage.length > 0;

  const sharedCaptionsData = useMemo(() => {
    return parseSharedCaptionsData(settingsMap);
  }, [settingsMap]);

  const previewOutput = getOutputDefaultsForMode(mode, resolvedSettings);
  const modeUi = useMemo(() => getContentModeUi(mode, pathname), [mode, pathname]);
  const previewComponent = modeUi.previewComponent ?? ContentLoopComposition;

  const videoUrl = item ? `/api/content/${item.id}/asset?type=video` : null;
  const audioUrl = item ? `/api/content/${item.id}/asset?type=song` : null;
  const thumbnailUrl = item ? `/api/content/${item.id}/asset?type=thumbnail` : null;
  const { blobUrl: videoBlobUrl } = useMediaBlobUrl(videoUrl);
  const { blobUrl: audioBlobUrl } = useMediaBlobUrl(audioUrl);

  const previewProps = item
    ? modeDefinition.buildProps({
        item,
        settings: resolvedSettings,
        assets: {
          thumbnailSrc: thumbnailUrl ?? "",
          videoSrc: videoBlobUrl ?? videoUrl ?? "",
          audioSrc: audioBlobUrl ?? audioUrl ?? "",
        },
      })
    : null;

  const segmentDurationSeconds = Number(resolvedSettings.segmentDurationSeconds ?? 4);
  const songDurationSeconds = Math.max(0, Number(item?.songDurationSeconds ?? 0));
  const previewDurationSeconds = songDurationSeconds > 0 ? songDurationSeconds : segmentDurationSeconds;
  const safeDurationInFrames = Math.max(1, Math.round(previewDurationSeconds * previewOutput.fps));

  const captionsEditorPreview = useMemo<CaptionEditorPreviewProps | null>(
    () =>
      previewProps
        ? {
            component: previewComponent as ComponentType<Record<string, unknown>>,
            inputProps: {
              ...(previewProps as Record<string, unknown>),
              songRangeStartSeconds: 0,
              songRangeEndSeconds: null,
            },
            durationInFrames: safeDurationInFrames,
            fps: previewOutput.fps,
            compositionWidth: previewOutput.width,
            compositionHeight: previewOutput.height,
          }
        : null,
    [previewComponent, previewOutput.fps, previewOutput.height, previewOutput.width, previewProps, safeDurationInFrames]
  );

  const saveMutation = useMutation({
    mutationFn: async ({
      next,
      source = "manual",
    }: {
      next: CaptionDocument;
      source?: "manual" | "autosave";
    }) => {
      if (!item) throw new Error("Content item not found.");
      const updated = await sdk.content.update(item.id, {
        settings: buildSettingsWithSharedCaptions(mode, item.settings ?? {}, next),
      });
      return { updated, source };
    },
    onSuccess: ({ updated, source }) => {
      queryClient.setQueryData(queryKeys.contentItem(updated.id), updated);
      if (source === "manual") {
        toast.success("Captions saved.");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save captions.");
    },
  });

  const generateCaptionsMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Content item not found.");
      return sdk.content.triggerCaptions(item.id, {
        mode,
        language: captionsLanguage,
      });
    },
    onSuccess: async (response) => {
      if (!item) return;
      if (response.status === "done") {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.contentItem(item.id),
          exact: true,
        });
        await contentQuery.refetch();
        setGenerationWatch(null);
        return;
      }
      setGenerationWatch({
        contentId: item.id,
      });
    },
    onError: (error) => {
      setGenerationWatch(null);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate captions."
      );
    },
  });

  useEffect(() => {
    if (!generationWatch || !socket || !connected) return;

    const handleCaptionUpdate = (payload: {
      id: string;
      status: "queued" | "processing" | "completed" | "failed";
      error?: string;
    }) => {
      if (payload.id !== generationWatch.contentId) return;
      if (payload.status === "completed") {
        void (async () => {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.contentItem(generationWatch.contentId),
            exact: true,
          });
          await contentQuery.refetch();
          setGenerationWatch(null);
        })();
        return;
      }
      if (payload.status === "failed") {
        setGenerationWatch(null);
        toast.error(payload.error?.trim() || "Caption generation failed.");
      }
    };

    return attachSocketSubscriptions(socket, [
      { event: SocketEvents.caption.update, handler: handleCaptionUpdate },
    ] as const);
  }, [connected, contentQuery, generationWatch, queryClient, socket]);

  useEffect(() => {
    if (!item || canEditCaptions || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    toast.error("Enable captions and set a captions language first.");
    router.replace(`/edit/${params.id}`);
  }, [canEditCaptions, item, params.id, router]);

  if (contentQuery.isLoading || !contentQuery.isFetchedAfterMount) {
    return null;
  }

  if (contentQuery.isError || !item) {
    toast.error("Failed to load content item.");
    router.replace(`/edit/${params.id}`);
    return null;
  }

  if (!canEditCaptions) {
    return null;
  }

  return (
      <CaptionEditor
        value={sharedCaptionsData}
        mode={mode}
        language={captionsLanguage}
        isGeneratingSegments={
          generateCaptionsMutation.isPending || generationWatch?.contentId === item.id
        }
        onGenerateSegments={async () => {
          setGenerationWatch({ contentId: item.id });
          await generateCaptionsMutation.mutateAsync();
        }}
        onSave={async (next, options) => {
          await saveMutation.mutateAsync({
            next,
            source: options?.source ?? "manual",
          });
        }}
        closeHref={`/edit/${params.id}`}
        preview={captionsEditorPreview}
        previewModes={modeUi.previewModes}
      />
  );
}
