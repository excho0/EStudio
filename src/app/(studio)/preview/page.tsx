"use client";

import { Player } from "@remotion/player";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import { useContentList } from "../_components/use-content-list";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";

export default function DashboardPreviewPage() {
  const { items, loading } = useContentList();
  const item = items[0];
  const videoUrl = item ? `/api/content/${item.id}/asset?type=video` : null;
  const audioUrl = item ? `/api/content/${item.id}/asset?type=song` : null;
  const { blobUrl: videoBlobUrl, loading: videoLoading } =
    useMediaBlobUrl(videoUrl);
  const { blobUrl: audioBlobUrl, loading: audioLoading } =
    useMediaBlobUrl(audioUrl);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-lg font-semibold">Content Loop Preview</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
          Preview the ContentLoop composition using your latest upload.
        </p>

        {loading ? (
          <div className="mt-6 text-sm text-slate-500 dark:text-zinc-400">
            Loading preview...
          </div>
        ) : item ? (
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-white/10">
            {videoLoading || audioLoading || !videoBlobUrl ? (
              <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
            ) : (
              <Player
                acknowledgeRemotionLicense
                component={ContentLoopComposition}
                inputProps={{
                  title: item.title,
                  thumbnailSrc: `/api/content/${item.id}/asset?type=thumbnail`,
                  videoSrc: videoBlobUrl,
                  audioSrc: audioBlobUrl ?? "",
                  segmentDurationSeconds: item.segmentDurationSeconds,
                  fadeDurationSeconds: item.fadeDurationSeconds,
                  videoDurationSeconds:
                    item.videoDurationSeconds ?? item.segmentDurationSeconds,
                  playbackRate: item.playbackRate ?? 1,
                  colorPalette: item.colorPalette ?? undefined,
                  scalePercent: item.scalePercent ?? 100,
                  overlapRatio: item.overlapRatio ?? null,
                }}
                durationInFrames={Math.max(
                  1,
                  Math.round(item.songDurationSeconds * item.fps)
                )}
                fps={item.fps}
                compositionWidth={item.width}
                compositionHeight={item.height}
                controls
                style={{ width: "100%" }}
              />
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
            Upload a project first to preview the ContentLoop composition.
          </div>
        )}
      </Card>
    </div>
  );
}
