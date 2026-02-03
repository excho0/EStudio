"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/components/navigation/route-transition";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  MoveHorizontal,
  MoveVertical,
  Monitor,
  Palette,
  Repeat2,
  SlidersHorizontal,
  Timer,
  Type,
  FastForward,
  Info,
  Clapperboard,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Pipette,
  Copy,
  AudioLines,
  Eye,
  Sparkles,
  ChartNoAxesColumn,
  Spotlight,
  RotateCw,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { toast } from "sonner";
import { Player } from "@remotion/player";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";
import { useMediaQuery } from "@/hooks/use-media-query";
import { HexPicker } from "@/components/ui/hex-color-picker";
import { Switch } from "@/components/ui/switch";
import { ContentItem } from "@/components/studio/use-content-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchJson } from "@/lib/fetch-json";

const STATUS_OPTIONS = [
  { value: "uploaded", label: "Uploaded", icon: Upload },
  { value: "rendering", label: "Rendering", icon: Loader2 },
  { value: "rendered", label: "Rendered", icon: CheckCircle2 },
  { value: "failed", label: "Failed", icon: XCircle },
] as const;

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

const SettingToggleRow = ({
  icon: Icon,
  label,
  tip,
  checked,
  onCheckedChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tip: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-slate-400 transition hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            aria-label={`${label} info`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

const SettingSliderRow = ({
  id,
  label,
  tip,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onValueChange,
}: {
  id: string;
  label: string;
  tip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onValueChange: (value: number) => void;
}) => (
  <div className="flex flex-col gap-2 px-2">
    <div className="flex items-center justify-between">
      <LabelWithTooltip htmlFor={id} text={label} tip={tip} />
      <span>
        {value}
        {suffix ?? ""}
      </span>
    </div>
    <Slider
      id={id}
      min={min}
      max={max}
      step={step}
      value={[value]}
      disabled={disabled}
      onValueChange={(value) => onValueChange(value[0] ?? min)}
    />
  </div>
);

const defaultFormValues = {
  title: "",
  status: "",
  segmentDurationSeconds: "",
  fadeDurationSeconds: "",
  introFadeSeconds: "",
  outroFadeSeconds: "",
  audioFadeInSeconds: "",
  audioFadeOutSeconds: "",
  audioFadeInOffsetSeconds: "",
  audioFadeOutOffsetSeconds: "",
  visualizationEnabled: true,
  visualizationBars: "128",
  edgeRaysEnabled: true,
  edgeRaysIntensity: "85",
  edgeRaysVocalBalance: "60",
  videoDurationSeconds: "",
  playbackRate: "",
  overlapPercent: 25,
  fps: "",
  width: "",
  height: "",
  scalePercent: "100",
};

type FormValues = typeof defaultFormValues;

const buildFormValuesFromItem = (item: ContentItem): FormValues => {
  const overlapPercent = Number.isFinite(item.overlapRatio)
    ? Math.round(Number(item.overlapRatio) * 100)
    : 25;
  return {
    title: item.title,
    status: item.status,
    segmentDurationSeconds: String(item.segmentDurationSeconds ?? ""),
    fadeDurationSeconds: String(item.fadeDurationSeconds ?? ""),
    introFadeSeconds: String(item.introFadeSeconds ?? ""),
    outroFadeSeconds: String(item.outroFadeSeconds ?? ""),
    audioFadeInSeconds: String(item.audioFadeInSeconds ?? ""),
    audioFadeOutSeconds: String(item.audioFadeOutSeconds ?? ""),
    audioFadeInOffsetSeconds: String(item.audioFadeInOffsetSeconds ?? ""),
    audioFadeOutOffsetSeconds: String(item.audioFadeOutOffsetSeconds ?? ""),
    visualizationEnabled: item.visualizationEnabled ?? true,
    visualizationBars: String(item.visualizationBars ?? 128),
    edgeRaysEnabled: item.edgeRaysEnabled ?? true,
    edgeRaysIntensity: String(Math.round((item.edgeRaysIntensity ?? 0.85) * 100)),
    edgeRaysVocalBalance: String(
      Math.round((item.edgeRaysVocalBalance ?? 0.6) * 100)
    ),
    videoDurationSeconds: String(item.videoDurationSeconds ?? ""),
    playbackRate: String(item.playbackRate ?? ""),
    overlapPercent,
    fps: String(item.fps ?? ""),
    width: String(item.width ?? ""),
    height: String(item.height ?? ""),
    scalePercent: String(item.scalePercent ?? 100),
  };
};

type PaletteMode = "auto" | "manual";

const buildSnapshotFromItem = (item: ContentItem) => ({
  formValues: buildFormValuesFromItem(item),
  paletteMode: (item.paletteMode === "manual" ? "manual" : "auto") as PaletteMode,
  paletteState: Array.isArray(item.colorPalette) ? item.colorPalette : [],
});

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildPayloadFromForm = (
  formValues: FormValues,
  paletteMode: PaletteMode,
  paletteState: string[]
) => {
  const payload: Record<string, unknown> = {
    title: (formValues.title ?? "").trim(),
    paletteMode,
    visualizationEnabled: Boolean(formValues.visualizationEnabled),
    edgeRaysEnabled: Boolean(formValues.edgeRaysEnabled),
  };
  if ((formValues.status ?? "").trim()) {
    payload.status = (formValues.status ?? "").trim();
  }
  if (paletteMode === "manual" && paletteState.length > 0) {
    payload.colorPalette = paletteState;
  }

  const fadeDurationSeconds = toOptionalNumber(formValues.fadeDurationSeconds);
  if (fadeDurationSeconds !== undefined) payload.fadeDurationSeconds = fadeDurationSeconds;
  const segmentDurationSeconds = toOptionalNumber(formValues.segmentDurationSeconds);
  if (segmentDurationSeconds !== undefined) {
    payload.segmentDurationSeconds = segmentDurationSeconds;
  }
  const introFadeSeconds = toOptionalNumber(formValues.introFadeSeconds);
  if (introFadeSeconds !== undefined) payload.introFadeSeconds = introFadeSeconds;
  const outroFadeSeconds = toOptionalNumber(formValues.outroFadeSeconds);
  if (outroFadeSeconds !== undefined) payload.outroFadeSeconds = outroFadeSeconds;
  const audioFadeInSeconds = toOptionalNumber(formValues.audioFadeInSeconds);
  if (audioFadeInSeconds !== undefined) payload.audioFadeInSeconds = audioFadeInSeconds;
  const audioFadeOutSeconds = toOptionalNumber(formValues.audioFadeOutSeconds);
  if (audioFadeOutSeconds !== undefined) payload.audioFadeOutSeconds = audioFadeOutSeconds;
  const audioFadeInOffsetSeconds = toOptionalNumber(formValues.audioFadeInOffsetSeconds);
  if (audioFadeInOffsetSeconds !== undefined) {
    payload.audioFadeInOffsetSeconds = audioFadeInOffsetSeconds;
  }
  const audioFadeOutOffsetSeconds = toOptionalNumber(formValues.audioFadeOutOffsetSeconds);
  if (audioFadeOutOffsetSeconds !== undefined) {
    payload.audioFadeOutOffsetSeconds = audioFadeOutOffsetSeconds;
  }
  const playbackRate = toOptionalNumber(formValues.playbackRate);
  if (playbackRate !== undefined) payload.playbackRate = playbackRate;
  const overlapRatio = Number.isFinite(formValues.overlapPercent)
    ? Math.min(0.9, Math.max(0, formValues.overlapPercent / 100))
    : undefined;
  if (overlapRatio !== undefined) payload.overlapRatio = overlapRatio;
  const fps = toOptionalNumber(formValues.fps);
  if (fps !== undefined) payload.fps = fps;
  const width = toOptionalNumber(formValues.width);
  if (width !== undefined) payload.width = width;
  const height = toOptionalNumber(formValues.height);
  if (height !== undefined) payload.height = height;
  const scalePercent = toOptionalNumber(formValues.scalePercent);
  if (scalePercent !== undefined) payload.scalePercent = scalePercent;
  const visualizationBars = toOptionalNumber(formValues.visualizationBars);
  if (visualizationBars !== undefined) {
    payload.visualizationBars = Math.min(256, Math.max(16, Math.round(visualizationBars)));
  }
  const edgeRaysIntensity = toOptionalNumber(formValues.edgeRaysIntensity);
  if (edgeRaysIntensity !== undefined) {
    payload.edgeRaysIntensity = Math.min(1, Math.max(0, Math.round(edgeRaysIntensity) / 100));
  }
  const edgeRaysVocalBalance = toOptionalNumber(formValues.edgeRaysVocalBalance);
  if (edgeRaysVocalBalance !== undefined) {
    payload.edgeRaysVocalBalance = Math.min(
      1,
      Math.max(0, Math.round(edgeRaysVocalBalance) / 100)
    );
  }
  const videoDurationSeconds = toOptionalNumber(formValues.videoDurationSeconds);
  if (videoDurationSeconds !== undefined) {
    payload.videoDurationSeconds = videoDurationSeconds;
  }
  return payload;
};

const appendPayloadToFormData = (payload: Record<string, unknown>, formData: FormData) => {
  formData.append("title", String(payload.title ?? ""));
  if (payload.status) formData.append("status", String(payload.status));
  if (payload.fadeDurationSeconds !== undefined) {
    formData.append("fadeDurationSeconds", String(payload.fadeDurationSeconds));
  }
  if (payload.introFadeSeconds !== undefined) {
    formData.append("introFadeSeconds", String(payload.introFadeSeconds));
  }
  if (payload.outroFadeSeconds !== undefined) {
    formData.append("outroFadeSeconds", String(payload.outroFadeSeconds));
  }
  if (payload.audioFadeInSeconds !== undefined) {
    formData.append("audioFadeInSeconds", String(payload.audioFadeInSeconds));
  }
  if (payload.audioFadeOutSeconds !== undefined) {
    formData.append("audioFadeOutSeconds", String(payload.audioFadeOutSeconds));
  }
  if (payload.audioFadeInOffsetSeconds !== undefined) {
    formData.append("audioFadeInOffsetSeconds", String(payload.audioFadeInOffsetSeconds));
  }
  if (payload.audioFadeOutOffsetSeconds !== undefined) {
    formData.append("audioFadeOutOffsetSeconds", String(payload.audioFadeOutOffsetSeconds));
  }
  if (payload.playbackRate !== undefined) {
    formData.append("playbackRate", String(payload.playbackRate));
  }
  if (payload.overlapRatio !== undefined) {
    formData.append("overlapRatio", String(payload.overlapRatio));
  }
  if (payload.fps !== undefined) {
    formData.append("fps", String(payload.fps));
  }
  if (payload.width !== undefined) {
    formData.append("width", String(payload.width));
  }
  if (payload.height !== undefined) {
    formData.append("height", String(payload.height));
  }
  if (payload.scalePercent !== undefined) {
    formData.append("scalePercent", String(payload.scalePercent));
  }
  formData.append("visualizationEnabled", String(payload.visualizationEnabled ?? true));
  if (payload.visualizationBars !== undefined) {
    formData.append("visualizationBars", String(payload.visualizationBars));
  }
  formData.append("edgeRaysEnabled", String(payload.edgeRaysEnabled ?? true));
  if (payload.edgeRaysIntensity !== undefined) {
    formData.append("edgeRaysIntensity", String(payload.edgeRaysIntensity));
  }
  if (payload.edgeRaysVocalBalance !== undefined) {
    formData.append("edgeRaysVocalBalance", String(payload.edgeRaysVocalBalance));
  }
  formData.append("paletteMode", String(payload.paletteMode ?? "auto"));
  if (payload.colorPalette) {
    formData.append("colorPalette", JSON.stringify(payload.colorPalette));
  }
};

const ColorCopyButton = ({
  value,
  onCopy,
}: {
  value: string;
  onCopy: () => void;
}) => (
  <button
    type="button"
    className="flex w-full items-center justify-between rounded-md border border-transparent px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 dark:text-zinc-400 dark:hover:border-white/10 dark:hover:bg-white/5"
    onClick={onCopy}
    aria-label={`Copy ${value}`}
  >
    <span>{value}</span>
    <Copy className="h-3.5 w-3.5" />
  </button>
);

export default function EditContentPage() {
  const params = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [item, setItem] = useState<ContentItem | null>(null);
  const [paletteMode, setPaletteMode] = useState<"auto" | "manual">("auto");
  const [paletteState, setPaletteState] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<FormValues>(defaultFormValues);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailVersion, setThumbnailVersion] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<{
    formValues: FormValues;
    paletteMode: PaletteMode;
    paletteState: string[];
  } | null>(null);
  const queryClient = useQueryClient();
  const contentQuery = useQuery<ContentItem>({
    queryKey: queryKeys.contentItem(params.id),
    enabled: Boolean(params.id),
    queryFn: async () => {
      return fetchJson<ContentItem>(
        `/api/content/${params.id}`,
        undefined,
        "Failed to load content item."
      );
    },
  });
  const loading = contentQuery.isLoading || contentQuery.isFetching;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!contentQuery.data) return;
    const data = contentQuery.data;
    setItem(data);
    setError(null);
    setThumbnailVersion(Date.now());
    const nextFormValues = buildFormValuesFromItem(data);
    setFormValues(nextFormValues);
    setPaletteMode(data.paletteMode === "manual" ? "manual" : "auto");
    setPaletteState(Array.isArray(data.colorPalette) ? data.colorPalette : []);
    setInitialSnapshot(buildSnapshotFromItem(data));
  }, [contentQuery.data]);

  useEffect(() => {
    if (!contentQuery.error) return;
    setError(
      contentQuery.error instanceof Error
        ? contentQuery.error.message
        : "Failed to load item."
    );
  }, [contentQuery.error]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item) {
        throw new Error("No content item loaded.");
      }
      const payload = buildPayloadFromForm(formValues, paletteMode, paletteState);
      const response = await (thumbnailFile
        ? (() => {
            const formData = new FormData();
            appendPayloadToFormData(payload, formData);
            formData.append("thumbnail", thumbnailFile);
            return fetch(`/api/content/${item.id}`, {
              method: "PATCH",
              body: formData,
            });
          })()
        : fetch(`/api/content/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }));
      if (!response.ok) {
        throw new Error("Failed to save changes.");
      }
      return (await response.json()) as ContentItem;
    },
    onSuccess: (updated) => {
      setItem(updated);
      setThumbnailFile(null);
      setThumbnailPreview(null);
      setThumbnailVersion(Date.now());
      setInitialSnapshot(buildSnapshotFromItem(updated));
      queryClient.setQueryData(queryKeys.contentItem(params.id), updated);
      toast.success("Content updated.");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to save.";
      toast.error(message);
    },
  });
  const saving = saveMutation.isPending;
  const isTablet = useMediaQuery("(max-width: 1024px)");
  const videoUrl = item ? `/api/content/${item.id}/asset?type=video` : null;
  const audioUrl = item ? `/api/content/${item.id}/asset?type=song` : null;
  const thumbnailUrl = item
    ? `/api/content/${item.id}/asset?type=thumbnail&v=${thumbnailVersion}`
    : null;
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
  const safeSegmentDuration = getNumber(
    formValues.segmentDurationSeconds,
    item ? getNumber(item.segmentDurationSeconds, 4) : 4
  );
  const safeFadeDuration = getNumber(
    formValues.fadeDurationSeconds,
    item ? getNumber(item.fadeDurationSeconds, 1) : 1
  );
  const safeIntroFadeDuration = getNumber(
    formValues.introFadeSeconds,
    item ? getNumber(item.introFadeSeconds, 0) : 0
  );
  const safeOutroFadeDuration = getNumber(
    formValues.outroFadeSeconds,
    item ? getNumber(item.outroFadeSeconds, 0) : 0
  );
  const safeAudioFadeInDuration = getNumber(
    formValues.audioFadeInSeconds,
    item ? getNumber(item.audioFadeInSeconds, 0) : 0
  );
  const safeAudioFadeOutDuration = getNumber(
    formValues.audioFadeOutSeconds,
    item ? getNumber(item.audioFadeOutSeconds, 0) : 0
  );
  const safeAudioFadeInOffset = getNumber(
    formValues.audioFadeInOffsetSeconds,
    item ? getNumber(item.audioFadeInOffsetSeconds, 0) : 0
  );
  const safeAudioFadeOutOffset = getNumber(
    formValues.audioFadeOutOffsetSeconds,
    item ? getNumber(item.audioFadeOutOffsetSeconds, 0) : 0
  );
  const safePlaybackRate = getNumber(
    formValues.playbackRate,
    item ? getNumber(item.playbackRate, 1) : 1
  );
  const safeVideoDuration = getNumber(
    formValues.videoDurationSeconds,
    item
      ? getNumber(
          item.videoDurationSeconds ?? item.segmentDurationSeconds,
          safeSegmentDuration
        )
      : safeSegmentDuration
  );
  const safeFps = getNumber(formValues.fps, item ? getNumber(item.fps, 30) : 30);
  const safeWidth = getDimension(
    formValues.width,
    item ? getDimension(item.width, 1280) : 1280
  );
  const safeHeight = getDimension(
    formValues.height,
    item ? getDimension(item.height, 720) : 720
  );
  const safeScalePercent = getNumber(
    formValues.scalePercent,
    item ? getNumber(item.scalePercent, 100) : 100
  );
  const safeVisualizationEnabled =
    typeof formValues.visualizationEnabled === "boolean"
      ? formValues.visualizationEnabled
      : item?.visualizationEnabled ?? true;
  const safeVisualizationBars = Math.min(
    256,
    Math.max(
      16,
      Math.round(
        getNumber(
          formValues.visualizationBars,
          item ? getNumber(item.visualizationBars, 128) : 128
        )
      )
    )
  );
  const safeEdgeRaysEnabled =
    typeof formValues.edgeRaysEnabled === "boolean"
      ? formValues.edgeRaysEnabled
      : item?.edgeRaysEnabled ?? true;
  const safeEdgeRaysIntensity = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        getNumber(
          formValues.edgeRaysIntensity,
          item ? getNumber(item.edgeRaysIntensity, 0.85) * 100 : 85
        )
      )
    )
  );
  const safeEdgeRaysVocalBalance = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        getNumber(
          formValues.edgeRaysVocalBalance,
          item ? getNumber(item.edgeRaysVocalBalance, 0.6) * 100 : 60
        )
      )
    )
  );
  const resolvedFps =
    Number.isFinite(safeFps) && safeFps > 0 ? safeFps : 30;
  const resolvedWidth =
    Number.isFinite(safeWidth) && safeWidth > 0 ? safeWidth : 1280;
  const resolvedHeight =
    Number.isFinite(safeHeight) && safeHeight > 0 ? safeHeight : 720;
  const resolvedScalePercent =
    Number.isFinite(safeScalePercent) && safeScalePercent >= 0
      ? safeScalePercent
      : 100;
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  useEffect(() => {
    if (paletteMode === "auto") {
      setPaletteState(item?.colorPalette ?? []);
    }
  }, [item, paletteMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleThumbnailChange = (file: File | null) => {
    setThumbnailFile(file);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync();
  };

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    const current = {
      formValues,
      paletteMode,
      paletteState,
      hasThumbnail: Boolean(thumbnailFile),
    };
    const baseline = {
      formValues: initialSnapshot.formValues,
      paletteMode: initialSnapshot.paletteMode,
      paletteState: initialSnapshot.paletteState,
      hasThumbnail: false,
    };
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }, [formValues, paletteMode, paletteState, thumbnailFile, initialSnapshot]);

  const handleRevert = () => {
    if (!initialSnapshot) return;
    setFormValues(initialSnapshot.formValues);
    setPaletteMode(initialSnapshot.paletteMode);
    setPaletteState(initialSnapshot.paletteState);
    setThumbnailFile(null);
    setThumbnailPreview(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
        <Button
          asChild
          variant="ghost"
        >
          <Link href="/library">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Content Details</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Review metadata and render settings for this item.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty || saving}
          className="gap-2"
        >
          <Save className="size-5" />
          <span className="hidden sm:inline">Save</span>
        </Button>
        <Button
          variant="outline"
          className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
          onClick={handleRevert}
          disabled={!isDirty}
        >
          <RotateCw className="size-5" />
          <span className="hidden sm:inline">Revert changes</span>
        </Button>
      </div>
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
              <div className="grid gap-6">
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
                  <Select
                    value={formValues.status}
                    onValueChange={(value) =>
                      setFormValues((current) => ({
                        ...current,
                        status: value,
                      }))
                    }
                  >
                    {(() => {
                      const selected = STATUS_OPTIONS.find(
                        (option) => option.value === formValues.status
                      );
                      const Icon = selected?.icon;
                      return (
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue placeholder="Select status">
                        {selected ? (
                          <span className="inline-flex items-center gap-2">
                            {Icon ? <Icon className="h-4 w-4" /> : null}
                            {selected.label}
                          </span>
                        ) : null}
                      </SelectValue>
                    </SelectTrigger>
                      );
                    })()}
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            icon={<Icon className="h-4 w-4" />}
                          >
                            {option.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {!isTablet && (
                  <div className="grid gap-2">
                    <LabelWithTooltip
                      htmlFor="thumbnail"
                      text="Thumbnail"
                      tip="Image shown in the library and preview."
                    />
                    <div className="flex items-center gap-4 p-3">
                      <div className="h-20 w-28 overflow-hidden rounded-md ">
                        {thumbnailPreview || item ? (
                          <ImageWithSkeleton
                            src={thumbnailPreview ?? thumbnailUrl ?? ""}
                            alt="Thumbnail preview"
                            className="h-full w-full object-cover"
                            wrapperClassName="h-full w-full"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 dark:text-zinc-500">
                            No thumbnail
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Pencil className="h-4 w-4" />
                          Change thumbnail
                        </button>
                        {thumbnailFile ? (
                          <div className="text-xs text-slate-500 dark:text-zinc-400">
                            Selected: {thumbnailFile.name}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                <Collapsible
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Palette"
                    description="Dominant colors"
                    icon={Palette}
                    rightSlot={
                      <div className="flex items-center -space-x-1">
                        {paletteState.slice(0, 5).map((color) => (
                          <span
                            key={color}
                            className="h-4 w-4 rounded-full border border-white shadow-sm dark:border-zinc-950"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                        {paletteState.length === 0 ? (
                          <span className="text-xs text-slate-400 dark:text-zinc-500">
                            No palette yet
                          </span>
                        ) : null}
                      </div>
                    }
                  />
                  <CollapsibleContent>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                      <div className="flex items-center text-center justify-center gap-2">
                        <Pipette className="flex size-5 shrink-0 " />
                        <span>
                          {/* {paletteMode === "auto"
                            ? "Auto palette from thumbnail."
                            : "Manual palette edits enabled."
                          } */}
                          Auto palette from thumbnail.
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 transition hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                              aria-label="Auto palette info"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            Auto picks colors from the thumbnail on save. Turn it off to edit
                            colors manually.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={paletteMode === "auto"}
                          onCheckedChange={(checked) =>
                            setPaletteMode(checked ? "auto" : "manual")
                          }
                        />
                      </div>
                    </div>
                    {paletteState.length > 0 ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-5">
                          {paletteState.map((color, index) => (
                            <div
                              key={index}
                              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/70 p-2 text-xs text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                            >
                              <HexPicker
                                color={color}
                                showLabel={false}
                                disabled={paletteMode === "auto"}
                                onChange={(value) => {
                                  if (paletteMode !== "manual") return;
                                  setPaletteState((current) => {
                                    const next = [...current];
                                    next[index] = value;
                                    return next;
                                  });
                                }}
                              />
                              <ColorCopyButton
                                value={color}
                                onCopy={() => {
                                  navigator.clipboard?.writeText(color).catch(() => undefined);
                                  toast.message(`Copied ${color}`);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500 dark:border-white/10 dark:text-zinc-400">
                        Save the content to generate a palette from the thumbnail.
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Visualization"
                    description="Bars + edge rays"
                    icon={AudioLines}
                  />
                  <CollapsibleContent>
                    <Collapsible defaultOpen className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                      <CollapsibleTrigger
                        title="Bars"
                        icon={ChartNoAxesColumn}
                        className="px-2 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200"
                      />
                      <CollapsibleContent className="p-2">
                        <SettingToggleRow
                          icon={Eye}
                          label="Bars visibility"
                          tip="Toggle audio visualization bars in the video."
                          checked={formValues.visualizationEnabled}
                          onCheckedChange={(checked) =>
                            setFormValues((current) => ({
                              ...current,
                              visualizationEnabled: checked,
                            }))
                          }
                        />
                        <SettingSliderRow
                          id="visualizationBars"
                          label="Bar count"
                          tip="Lower values feel chunkier and smoother; higher values are more detailed."
                          value={safeVisualizationBars}
                          min={16}
                          max={128}
                          step={1}
                          disabled={!formValues.visualizationEnabled}
                          onValueChange={(value) =>
                            setFormValues((current) => ({
                              ...current,
                              visualizationBars: String(value),
                            }))
                          }
                        />
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible defaultOpen className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                      <CollapsibleTrigger
                        title="Edge rays"
                        icon={Spotlight}
                        className="px-2 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200"
                      />
                      <CollapsibleContent className="p-2">
                        <SettingToggleRow
                          icon={Sparkles}
                          label="Edge rays visibility"
                          tip="Toggle the audio-reactive corner glow."
                          checked={formValues.edgeRaysEnabled}
                          onCheckedChange={(checked) =>
                            setFormValues((current) => ({
                              ...current,
                              edgeRaysEnabled: checked,
                            }))
                          }
                        />
                        <SettingSliderRow
                          id="edgeRaysIntensity"
                          label="Intensity"
                          tip="Higher values make the glow punchier and brighter."
                          value={safeEdgeRaysIntensity}
                          min={30}
                          max={100}
                          step={1}
                          suffix="%"
                          disabled={!formValues.edgeRaysEnabled}
                          onValueChange={(value) =>
                            setFormValues((current) => ({
                              ...current,
                              edgeRaysIntensity: String(value),
                            }))
                          }
                        />
                        <SettingSliderRow
                          id="edgeRaysVocalBalance"
                          label="Vocal balance"
                          tip="Bias the glow toward vocals (higher) or bass hits (lower)."
                          value={safeEdgeRaysVocalBalance}
                          min={0}
                          max={100}
                          step={1}
                          suffix="%"
                          disabled={!formValues.edgeRaysEnabled}
                          onValueChange={(value) =>
                            setFormValues((current) => ({
                              ...current,
                              edgeRaysVocalBalance: String(value),
                            }))
                          }
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Intro + Outro"
                    description="Fade timing"
                    icon={Clapperboard}
                  />
                  <CollapsibleContent className="sm:grid-cols-2">
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="introFadeSeconds"
                        text="Intro fade (sec)"
                        tip="Video fade in at the start of the sequence."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="introFadeSeconds"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formValues.introFadeSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              introFadeSeconds: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="outroFadeSeconds"
                        text="Outro fade (sec)"
                        tip="Video fade out at the end of the sequence."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="outroFadeSeconds"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formValues.outroFadeSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              outroFadeSeconds: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="audioFadeInSeconds"
                        text="Audio fade in (sec)"
                        tip="How long the audio takes to reach full volume."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="audioFadeInSeconds"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formValues.audioFadeInSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              audioFadeInSeconds: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="audioFadeOutSeconds"
                        text="Audio fade out (sec)"
                        tip="How long the audio takes to fade to silence."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="audioFadeOutSeconds"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formValues.audioFadeOutSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              audioFadeOutSeconds: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="audioFadeInOffsetSeconds"
                        text="Audio fade-in offset (sec)"
                        tip="Delay the fade-in start by this many seconds."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="audioFadeInOffsetSeconds"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formValues.audioFadeInOffsetSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              audioFadeInOffsetSeconds: event.target.value,
                            }))
                          }
                        />
                        <InputGroupAddon>
                          <Timer />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                    <div className="grid gap-2">
                      <LabelWithTooltip
                        htmlFor="audioFadeOutOffsetSeconds"
                        text="Audio fade-out offset (sec)"
                        tip="Start the fade-out this many seconds before the end."
                      />
                      <InputGroup className="bg-white dark:bg-white/5">
                        <InputGroupInput
                          id="audioFadeOutOffsetSeconds"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formValues.audioFadeOutOffsetSeconds}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              audioFadeOutOffsetSeconds: event.target.value,
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
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Loop"
                    description="Fade + overlap"
                    icon={Repeat2}
                  />
                  <CollapsibleContent className="sm:grid-cols-2">
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
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Playback"
                    description="Speed"
                    icon={SlidersHorizontal}
                  />
                  <CollapsibleContent className="sm:grid-cols-2">
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
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Output"
                    description="Resolution"
                    icon={Monitor}
                  />
                  <CollapsibleContent className="sm:grid-cols-2">
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
                    <div className="grid gap-2 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <LabelWithTooltip
                          htmlFor="scalePercent"
                          text="Scale (%)"
                          tip="Zoom the video in or out. 100% keeps the original size."
                        />
                        <span className="text-xs text-slate-500 dark:text-zinc-400">
                          {formValues.scalePercent || "100"}%
                        </span>
                      </div>
                      <Slider
                        id="scalePercent"
                        min={0}
                        max={200}
                        step={1}
                        value={[Number(formValues.scalePercent) || 100]}
                        onValueChange={(value) =>
                          setFormValues((current) => ({
                            ...current,
                            scalePercent: String(value[0]),
                          }))
                        }
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                <input
                  ref={fileInputRef}
                  id="thumbnail"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) =>
                    handleThumbnailChange(event.target.files?.[0] ?? null)
                  }
                />
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
          <div className="mt-2 relative overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 lg:border-0 lg:bg-transparent lg:mt-0">
            {loading || videoLoading || audioLoading || !videoBlobUrl || !canRenderPreview ? (
              <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
            ) : item ? (
              <Player
                acknowledgeRemotionLicense
                component={ContentLoopComposition}
                inputProps={{
                  title: item.title,
                  thumbnailSrc: thumbnailPreview ?? thumbnailUrl ?? "",
                  videoSrc: videoBlobUrl,
                  audioSrc: audioBlobUrl ?? "",
                  segmentDurationSeconds: safeSegmentDuration,
                  fadeDurationSeconds: safeFadeDuration,
                  introFadeSeconds: safeIntroFadeDuration,
                  outroFadeSeconds: safeOutroFadeDuration,
                  audioFadeInSeconds: safeAudioFadeInDuration,
                  audioFadeOutSeconds: safeAudioFadeOutDuration,
                  audioFadeInOffsetSeconds: safeAudioFadeInOffset,
                  audioFadeOutOffsetSeconds: safeAudioFadeOutOffset,
                  visualizationEnabled: safeVisualizationEnabled,
                  visualizationBars: safeVisualizationBars,
                  edgeRaysEnabled: safeEdgeRaysEnabled,
                  edgeRaysIntensity: safeEdgeRaysIntensity / 100,
                  edgeRaysVocalBalance: safeEdgeRaysVocalBalance / 100,
                  videoDurationSeconds: safeVideoDuration,
                  playbackRate: safePlaybackRate,
                  scalePercent: resolvedScalePercent,
                  colorPalette: paletteState,
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
            {isTablet ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/60 text-white shadow-lg transition hover:bg-black/80"
                aria-label="Edit thumbnail"
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
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
