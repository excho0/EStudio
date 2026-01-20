"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  MoveHorizontal,
  MoveVertical,
  Timer,
  Type,
  FastForward,
  Info,
  Goal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Player } from "@remotion/player";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";

type ContentItem = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  videoDurationSeconds?: number | null;
  playbackRate: number;
  overlapRatio?: number | null;
  songDurationSeconds: number;
  fps: number;
  width: number;
  height: number;
  thumbnailPath: string;
  videoPath: string;
  songPath: string;
  renderPath?: string | null;
};

const LabelWithTooltip = ({
  htmlFor,
  text,
  tip,
}: {
  htmlFor: string;
  text: string;
  tip: string;
}) => (
  <div className="flex items-center gap-2">
    <Label htmlFor={htmlFor}>{text}</Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-slate-400 transition hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label={`${text} info`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {tip}
      </TooltipContent>
    </Tooltip>
  </div>
);

export default function EditContentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ContentItem | null>(null);
  const [formValues, setFormValues] = useState({
    title: "",
    status: "",
    fadeDurationSeconds: "",
    playbackRate: "",
    overlapPercent: 25,
    fps: "",
    width: "",
    height: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const videoUrl = item ? `/api/content/${item.id}/asset?type=video` : null;
  const audioUrl = item ? `/api/content/${item.id}/asset?type=song` : null;
  const { blobUrl: videoBlobUrl, loading: videoLoading } =
    useMediaBlobUrl(videoUrl);
  const { blobUrl: audioBlobUrl, loading: audioLoading } =
    useMediaBlobUrl(audioUrl);
  const getNumber = (value: number | string | undefined | null, fallback: number) => {
    const parsed = typeof value === "string" ? Number(value) : value;
    return Number.isFinite(parsed) ? (parsed as number) : fallback;
  };
  const getDimension = (value: number | string | undefined | null, fallback: number) =>
    Math.max(1, Math.round(getNumber(value, fallback)));
  const safeSegmentDuration = item
    ? getNumber(item.segmentDurationSeconds, 4)
    : 4;
  const safeFadeDuration = item ? getNumber(item.fadeDurationSeconds, 1) : 1;
  const safePlaybackRate = item ? getNumber(item.playbackRate, 1) : 1;
  const safeOverlapPercent = item
    ? Math.round(getNumber(item.overlapRatio, 0) * 100)
    : 25;
  const safeVideoDuration = item
    ? getNumber(
        item.videoDurationSeconds ?? item.segmentDurationSeconds,
        safeSegmentDuration
      )
    : safeSegmentDuration;
  const safeFps = item ? getNumber(item.fps, 30) : 30;
  const safeWidth = item ? getDimension(item.width, 1280) : 1280;
  const safeHeight = item ? getDimension(item.height, 720) : 720;
  const resolvedFps =
    Number.isFinite(safeFps) && safeFps > 0 ? safeFps : 30;
  const resolvedWidth =
    Number.isFinite(safeWidth) && safeWidth > 0 ? safeWidth : 1280;
  const resolvedHeight =
    Number.isFinite(safeHeight) && safeHeight > 0 ? safeHeight : 720;
  const songDurationSeconds = getNumber(item?.songDurationSeconds, 0);
  const previewDurationSeconds =
    songDurationSeconds > 0 ? songDurationSeconds : safeSegmentDuration;
  const safeDurationInFrames = Math.max(
    1,
    Math.round(previewDurationSeconds * resolvedFps)
  );
  const canRenderPreview =
    !!item &&
    Number.isFinite(safeDurationInFrames) &&
    Number.isFinite(resolvedFps) &&
    Number.isFinite(resolvedWidth) &&
    Number.isFinite(resolvedHeight);

  useEffect(() => {
    let active = true;
    const fetchItem = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/content/${params.id}`);
        if (!response.ok) {
          throw new Error("Failed to load content item.");
        }
        const data = (await response.json()) as ContentItem;
        if (active) {
          setItem(data);
          const overlapPercent = Number.isFinite(data.overlapRatio)
            ? Math.round(Number(data.overlapRatio) * 100)
            : 25;
          setFormValues({
            title: data.title,
            status: data.status,
            fadeDurationSeconds: String(data.fadeDurationSeconds ?? ""),
            playbackRate: String(data.playbackRate ?? ""),
            overlapPercent,
            fps: String(data.fps ?? ""),
            width: String(data.width ?? ""),
            height: String(data.height ?? ""),
          });
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load item.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchItem();
    return () => {
      active = false;
    };
  }, [params.id]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const toOptionalNumber = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      const payload: Record<string, unknown> = {
        title: formValues.title.trim(),
      };
      if (formValues.status.trim()) {
        payload.status = formValues.status.trim();
      }
      const fadeDurationSeconds = toOptionalNumber(
        formValues.fadeDurationSeconds
      );
      if (fadeDurationSeconds !== undefined) {
        payload.fadeDurationSeconds = fadeDurationSeconds;
      }
      const playbackRate = toOptionalNumber(formValues.playbackRate);
      if (playbackRate !== undefined) {
        payload.playbackRate = playbackRate;
      }
      const overlapRatio = Number.isFinite(formValues.overlapPercent)
        ? Math.min(0.9, Math.max(0, formValues.overlapPercent / 100))
        : undefined;
      if (overlapRatio !== undefined) {
        payload.overlapRatio = overlapRatio;
      }
      const fps = toOptionalNumber(formValues.fps);
      if (fps !== undefined) {
        payload.fps = fps;
      }
      const width = toOptionalNumber(formValues.width);
      if (width !== undefined) {
        payload.width = width;
      }
      const height = toOptionalNumber(formValues.height);
      if (height !== undefined) {
        payload.height = height;
      }
      const response = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to save changes.");
      }
      const updated = (await response.json()) as ContentItem;
      setItem(updated);
      toast.success("Content updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Content Details</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Review metadata and render settings for this item.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
          onClick={() => router.push("/library")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Library
        </Button>
      </div>

      <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-200">
              {error}
            </div>
          ) : item ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <LabelWithTooltip
                    htmlFor="title"
                    text="Title"
                    tip="Name of this project as it appears in your library."
                  />
                  <InputGroup className="bg-white dark:bg-white/5">
                    <InputGroupInput
                      id="title"
                      value={formValues.title}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                    <InputGroupAddon>
                      <Type />
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                <div className="grid gap-2">
                  <LabelWithTooltip
                    htmlFor="status"
                    text="Status"
                    tip="Current render state (uploaded, rendering, rendered, failed)."
                  />
                  <InputGroup className="bg-white dark:bg-white/5">
                    <InputGroupInput
                      id="status"
                      value={formValues.status}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    />
                    <InputGroupAddon>
                      <Goal />
                    </InputGroupAddon>
                  </InputGroup>
                </div>

                <Collapsible
                  defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-white/5">
                    <div className="flex flex-col items-start text-left">
                      <span>Loop</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">
                        Fade + overlap
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 grid gap-3 overflow-hidden px-3 pb-2 sm:grid-cols-2 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="fadeDurationSeconds"
                        text="Fade (sec)"
                        tip="How long the crossfade lasts when switching clips."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="fadeDurationSeconds"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formValues.fadeDurationSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              fadeDurationSeconds: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                        <LabelWithTooltip
                          htmlFor="overlapPercent"
                          text="Overlap"
                          tip="How much the next clip starts before the current ends."
                        />
                        <span>{formValues.overlapPercent}%</span>
                      </div>
                      <Slider
                        id="overlapPercent"
                        min={0}
                        max={90}
                        step={1}
                        value={[formValues.overlapPercent]}
                        onValueChange={(value) =>
                          setFormValues((current) => ({
                            ...current,
                            overlapPercent: value[0] ?? 0,
                          }))
                        }
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-white/5">
                    <div className="flex flex-col items-start text-left">
                      <span>Playback</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">
                        Speed
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 grid gap-3 overflow-hidden px-3 pb-2 sm:grid-cols-2 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="playbackRate"
                        text="Playback rate"
                        tip="Speed of the video. 1 = normal, 0.5 = slow, 2 = fast."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="playbackRate"
                          type="number"
                          min="0.1"
                          step="0.05"
                          value={formValues.playbackRate}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              playbackRate: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <FastForward />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="fps"
                        text="FPS"
                        tip="Frames per second. Higher is smoother but heavier."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="fps"
                          type="number"
                          min="1"
                          value={formValues.fps}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              fps: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-white/5">
                    <div className="flex flex-col items-start text-left">
                      <span>Output</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">
                        Resolution
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 grid gap-3 overflow-hidden px-3 pb-2 sm:grid-cols-2 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="width"
                        text="Width"
                        tip="Final video width (pixels)."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="width"
                          type="number"
                          min="1"
                          value={formValues.width}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              width: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <MoveHorizontal />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="height"
                        text="Height"
                        tip="Final video height (pixels)."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="height"
                          type="number"
                          min="1"
                          value={formValues.height}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              height: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <MoveVertical />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                  onClick={() => router.push("/library")}
                >
                  Cancel
                </Button>
              </div>
            </div>
        ) : (
          <div className="text-sm text-slate-500 dark:text-zinc-400">
            Content item not found.
            <Link href="/library" className="ml-2 text-emerald-500">
              Go back
            </Link>
          </div>
        )}
        <div>
          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 lg:border-0 lg:bg-transparent lg:mt-0">
            {loading || videoLoading || audioLoading || !videoBlobUrl || !canRenderPreview ? (
              <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
            ) : item ? (
              <Player
                acknowledgeRemotionLicense
                component={ContentLoopComposition}
                inputProps={{
                  title: item.title,
                  videoSrc: videoBlobUrl,
                  audioSrc: audioBlobUrl ?? "",
                  segmentDurationSeconds: safeSegmentDuration,
                  fadeDurationSeconds: safeFadeDuration,
                  videoDurationSeconds: safeVideoDuration,
                  playbackRate: safePlaybackRate,
                  overlapRatio: Number.isFinite(formValues.overlapPercent)
                    ? Math.min(0.9, Math.max(0, formValues.overlapPercent / 100))
                    : null,
                }}
                durationInFrames={safeDurationInFrames}
                fps={resolvedFps}
                compositionWidth={resolvedWidth}
                compositionHeight={resolvedHeight}
                controls
                style={{ width: "100%" }}
              />
            ) : (
              <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
            )}
          </div>
          <div className="p-2 py-4">
            {loading ? (
              <>
                <Skeleton className="h-7 w-72" />
                <Skeleton className="mt-2 h-3 w-40" />
              </>
            ) : item ? (
              <>
                <div className="text-2xl font-semibold">{item.title}</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  {new Date(item.createdAt).toLocaleString()}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
