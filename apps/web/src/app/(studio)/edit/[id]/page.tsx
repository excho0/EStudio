"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link } from "@/components/navigation/route-transition";
import { useRouteTransition } from "@/components/navigation/route-transition";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Palette,
  SlidersHorizontal,
  Type,
  Info,
  Upload,
  CheckCircle2,
  Pipette,
  Copy,
  Eye,
  RotateCw,
  Save,
  AlertCircle,
  Subtitles,
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
import { IconSelect } from "@/components/ui/icon-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { toast } from "sonner";
import { Player } from "@remotion/player";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";
import { useMediaQuery } from "@/hooks/use-media-query";
import { HexPicker } from "@/components/ui/hex-color-picker";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  captionDocumentSchema,
  type ContentItem,
  type EditFormValues,
  type PaletteMode,
} from "@/types";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import {
  DEFAULT_CONTENT_MODE,
  getOutputDefaultsForMode,
  resolveContentSettings,
  normalizeSettingsMap,
} from "@/lib/content/modes";
import {
  getContentModeDefinition,
  getContentModeUi,
  contentModeUiRegistry,
  type ContentModeField,
} from "@/lib/content/modes/ui-registry";
import {
  applyFieldValue,
  buildFieldMap,
  getFieldValue as getFieldValueFromSettings,
  isFieldDisabled,
  shouldRenderField,
  shouldRenderGroup,
  shouldRenderSection,
  resolveFieldActionState,
  type FieldActionHandler,
} from "@/lib/content/modes/ui-helpers";
import { ModeSettingsRenderer } from "@/components/content-settings/mode-settings";
import {
  LabelWithTooltip,
} from "@/components/content-settings/label-with-tooltip";
import {
  SettingSliderRow,
  SettingRangeSliderRow,
  SettingToggleRow,
} from "@/components/content-settings/fields";
import StickyBox from "@/components/ui/sticky-box";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/shared/utils";
import { Alert, AlertContent, AlertIcon, AlertTitle } from "@/components/ui/alert";

const STATUS_OPTIONS = [
  { value: "uploaded", label: "Uploaded", icon: Upload },
  // { value: "rendering", label: "Rendering", icon: Loader2 },
  { value: "rendered", label: "Rendered", icon: CheckCircle2 },
  // { value: "failed", label: "Failed", icon: XCircle },
] as const;

const defaultFormValues = {
  title: "",
  status: "",
  mode: DEFAULT_CONTENT_MODE,
  songDurationSeconds: "",
  settings: {},
};

type FormValues = EditFormValues;

const formatSecondsToMinutes = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const buildFormValuesFromItem = (item: ContentItem): FormValues => {
  const settingsMap = normalizeSettingsMap(
    item.mode ?? DEFAULT_CONTENT_MODE,
    item.settings ?? {}
  );
  const resolved = resolveContentSettings(item.mode ?? DEFAULT_CONTENT_MODE, settingsMap);
  return {
    title: item.title,
    status: item.status,
    mode: resolved.mode,
    songDurationSeconds: String(item.songDurationSeconds ?? ""),
    settings: settingsMap as Record<string, unknown>,
  };
};

const buildSnapshotFromItem = (item: ContentItem) => ({
  formValues: buildFormValuesFromItem(item),
  paletteMode: (item.paletteMode === "manual" ? "manual" : "auto") as PaletteMode,
  paletteState: Array.isArray(item.colorPalette) ? item.colorPalette : [],
});

  const buildPayloadFromForm = (
    formValues: FormValues,
    paletteMode: PaletteMode,
    paletteState: string[]
  ) => {
  const resolved = resolveContentSettings(formValues.mode, formValues.settings);
  const settingsMap = normalizeSettingsMap(formValues.mode, formValues.settings);
  settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    title: (formValues.title ?? "").trim(),
    paletteMode,
    mode: resolved.mode ?? DEFAULT_CONTENT_MODE,
    settings: settingsMap,
  };
  const toOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const songDurationSeconds = toOptionalNumber(formValues.songDurationSeconds);
  if (songDurationSeconds !== undefined) {
    payload.songDurationSeconds = songDurationSeconds;
  }
  if ((formValues.status ?? "").trim()) {
    payload.status = (formValues.status ?? "").trim();
  }
  if (paletteMode === "manual" && paletteState.length > 0) {
    payload.colorPalette = paletteState;
  }
  return payload;
};

const appendPayloadToFormData = (payload: Record<string, unknown>, formData: FormData) => {
  formData.append("title", String(payload.title ?? ""));
  if (payload.status) formData.append("status", String(payload.status));
  formData.append("paletteMode", String(payload.paletteMode ?? "auto"));
  if (payload.songDurationSeconds !== undefined) {
    formData.append("songDurationSeconds", String(payload.songDurationSeconds));
  }
  if (payload.colorPalette) {
    formData.append("colorPalette", JSON.stringify(payload.colorPalette));
  }
  if (payload.mode) {
    formData.append("mode", String(payload.mode));
  }
  if (payload.settings) {
    formData.append("settings", JSON.stringify(payload.settings));
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

const stateTransition = {
  initial: { opacity: 0, y: 12, filter: "blur(3px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, filter: "blur(2px)" },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

const PREVIEW_CANVAS_WIDTH = 1920;
const PREVIEW_CANVAS_HEIGHT = 1080;
const PREVIEW_CANVAS_ASPECT = PREVIEW_CANVAS_WIDTH / PREVIEW_CANVAS_HEIGHT;

export default function EditContentPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const routeTransition = useRouteTransition();
  const isMobile = useIsMobile();
  const isTablet = useMediaQuery("(max-width: 1024px)");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [item, setItem] = useState<ContentItem | null>(null);
  const [paletteMode, setPaletteMode] = useState<"auto" | "manual">("auto");
  const [paletteState, setPaletteState] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<FormValues>(defaultFormValues);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailVersion, setThumbnailVersion] = useState<number>(0);
  const [fieldActionLoading, setFieldActionLoading] = useState<
    Record<string, boolean>
  >({});
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
      return sdk.content.get(params.id);
    },
  });
  const loading = contentQuery.isLoading || contentQuery.isFetching;
  const resolvedItem = item ?? contentQuery.data ?? null;
  const pageState: "loading" | "error" | "notFound" | "ready" = loading
    ? "loading"
    : error
      ? "error"
      : resolvedItem
        ? "ready"
        : "notFound";
  const isReady = pageState === "ready";
  useEffect(() => {
    if (!contentQuery.data) return;
    const data = contentQuery.data;
    if (item?.id === data.id && initialSnapshot) {
      return;
    }
    setItem(data);
    setError(null);
    setThumbnailVersion(Date.now());
    const nextFormValues = buildFormValuesFromItem(data);
    setFormValues(nextFormValues);
    setPaletteMode(data.paletteMode === "manual" ? "manual" : "auto");
    setPaletteState(Array.isArray(data.colorPalette) ? data.colorPalette : []);
    setInitialSnapshot(buildSnapshotFromItem(data));
  }, [contentQuery.data, initialSnapshot, item?.id]);

  useEffect(() => {
    if (!contentQuery.error) return;
    setError(
      contentQuery.error instanceof Error
        ? contentQuery.error.message
        : "Failed to load item."
    );
  }, [contentQuery.error]);
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
      const didUploadThumbnail = Boolean(thumbnailFile);
      const nextFormValues = buildFormValuesFromItem(updated);
      const nextPaletteMode = updated.paletteMode === "manual" ? "manual" : "auto";
      const nextPaletteState = Array.isArray(updated.colorPalette)
        ? updated.colorPalette
        : [];

      setItem(updated);
      setFormValues(nextFormValues);
      setPaletteMode(nextPaletteMode);
      setPaletteState(nextPaletteState);
      setThumbnailFile(null);
      setThumbnailPreview(null);
      if (didUploadThumbnail) {
        setThumbnailVersion(Date.now());
      }
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
  const videoUrl = resolvedItem ? `/api/content/${resolvedItem.id}/asset?type=video` : null;
  const audioUrl = resolvedItem ? `/api/content/${resolvedItem.id}/asset?type=song` : null;
  const thumbnailUrl = resolvedItem
    ? `/api/content/${resolvedItem.id}/asset?type=thumbnail&v=${thumbnailVersion}`
    : null;
  const { blobUrl: videoBlobUrl, loading: videoLoading } =
    useMediaBlobUrl(videoUrl);
  const { blobUrl: audioBlobUrl, loading: audioLoading } =
    useMediaBlobUrl(audioUrl);
  const modeOptions = useMemo(() => {
    return Object.keys(contentModeUiRegistry).map((id) => {
      const def = getContentModeDefinition(id);
      const ui = contentModeUiRegistry[id];
      return {
        value: id,
        label: def.label,
        icon: ui?.icon ?? SlidersHorizontal,
      };
    });
  }, []);
  const resolvedSettings = useMemo(() => {
    try {
      return resolveContentSettings(formValues.mode || item?.mode, formValues.settings)
        .settings as Record<string, unknown>;
    } catch {
      const fallback = getContentModeDefinition(formValues.mode || item?.mode).defaults;
      return fallback as Record<string, unknown>;
    }
  }, [formValues.mode, formValues.settings, item]);
  const settingsMap = useMemo(
    () => normalizeSettingsMap(formValues.mode || item?.mode, formValues.settings),
    [formValues.mode, formValues.settings, item]
  );
  const currentSettings = useMemo(
    () =>
      (settingsMap[
        (formValues.mode || item?.mode || DEFAULT_CONTENT_MODE) as string
      ] ?? {}) as Record<string, unknown>,
    [settingsMap, formValues.mode, item]
  );
  const sharedCaptionsData = useMemo(() => {
    const shared = settingsMap.__shared;
    if (!shared || typeof shared !== "object" || Array.isArray(shared)) {
      return null;
    }
    const raw = (shared as Record<string, unknown>).captionsData ?? null;
    const parsed = captionDocumentSchema.nullable().safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [settingsMap]);
  const previewOutput = getOutputDefaultsForMode(formValues.mode || item?.mode, resolvedSettings);
  const resolvedFps = previewOutput.fps;
  const resolvedWidth = previewOutput.width;
  const resolvedHeight = previewOutput.height;
  const getSettingNumber = (key: string, fallback: number) => {
    const value = resolvedSettings[key];
    const parsed = typeof value === "string" ? Number(value) : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const segmentDurationSeconds = getSettingNumber("segmentDurationSeconds", 4);
  const songDurationSeconds = Math.max(
    0,
    Number(formValues.songDurationSeconds || 0) || Number(item?.songDurationSeconds ?? 0)
  );
  const rangeStartSeconds = Math.max(0, Number(resolvedSettings.songRangeStartSeconds ?? 0));
  const rangeEndRaw = Number(
    resolvedSettings.songRangeEndSeconds ?? (songDurationSeconds > 0 ? songDurationSeconds : 0)
  );
  const rangeEndSeconds =
    songDurationSeconds > 0
      ? Math.min(songDurationSeconds, Math.max(rangeStartSeconds, rangeEndRaw))
      : Math.max(rangeStartSeconds, rangeEndRaw);
  const rangedDurationSeconds = Math.max(0, rangeEndSeconds - rangeStartSeconds);
  const previewDurationSeconds =
    rangedDurationSeconds > 0
      ? rangedDurationSeconds
      : songDurationSeconds > 0
        ? songDurationSeconds
        : segmentDurationSeconds;
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
  const previewAspect = resolvedWidth / resolvedHeight;
  const previewScale =
    previewAspect >= PREVIEW_CANVAS_ASPECT
      ? PREVIEW_CANVAS_ASPECT / previewAspect
      : previewAspect / PREVIEW_CANVAS_ASPECT;
  const previewWidthPercent =
    previewAspect >= PREVIEW_CANVAS_ASPECT ? 100 : Math.max(1, previewScale * 100);
  const previewHeightPercent =
    previewAspect >= PREVIEW_CANVAS_ASPECT ? Math.max(1, previewScale * 100) : 100;

  const modeUi = useMemo(
    () => getContentModeUi(formValues.mode || item?.mode, pathname),
    [formValues.mode, item?.mode]
  );
  const previewComponent = modeUi.previewComponent ?? ContentLoopComposition;
  const modeDefinition = useMemo(
    () => getContentModeDefinition(formValues.mode || item?.mode),
    [formValues.mode, item?.mode]
  );
  const previewProps = item
    ? modeDefinition.buildProps({
        item: {
          ...item,
          settings: formValues.settings as Record<string, unknown>,
        },
        settings: {
          ...resolvedSettings,
          paletteOverride: paletteMode === "manual" ? paletteState : undefined,
          paletteModeOverride: paletteMode,
        },
        assets: {
          thumbnailSrc: thumbnailPreview ?? thumbnailUrl ?? "",
          videoSrc: videoBlobUrl ?? videoUrl ?? "",
          audioSrc: audioBlobUrl ?? audioUrl ?? "",
        },
      })
    : null;
  const captionsEditorPreview = useMemo(
    () =>
      previewProps && canRenderPreview
        ? {
            component: previewComponent as ComponentType<Record<string, unknown>>,
            inputProps: previewProps as Record<string, unknown>,
            durationInFrames: safeDurationInFrames,
            fps: resolvedFps,
            compositionWidth: resolvedWidth,
            compositionHeight: resolvedHeight,
          }
        : null,
    [
      canRenderPreview,
      previewComponent,
      previewProps,
      resolvedFps,
      resolvedHeight,
      resolvedWidth,
      safeDurationInFrames,
    ]
  );

  const fieldMap = useMemo(() => buildFieldMap(modeUi.sections), [modeUi.sections]);

  const getFieldValue = (key: string) =>
    getFieldValueFromSettings(fieldMap, currentSettings, key);

  const updateFormValue = (key: string, value: string | number | boolean) => {
    setFormValues((current) => {
      const settingsMap = normalizeSettingsMap(current.mode, current.settings);
      const currentSettings =
        (settingsMap[current.mode] as Record<string, unknown>) ?? {};
      const nextSettings = applyFieldValue(fieldMap, currentSettings, key, value);
      return {
        ...current,
        settings: {
          ...settingsMap,
          [current.mode]: nextSettings,
        },
      };
    });
  };

  const setModeActionLoading = (actionId: string, loading: boolean) => {
    setFieldActionLoading((current) => ({
      ...current,
      [actionId]: loading,
    }));
  };


  const handleOpenCaptionsEditor: FieldActionHandler = async () => {
    if (!params.id) return;
    const href = `/edit/${params.id}/captions`;
    if (routeTransition) {
      routeTransition.startTransition(href);
      return;
    }
    router.push(href);
  };

  const fieldActionHandlers: Record<string, FieldActionHandler> = {
    "captions.edit": handleOpenCaptionsEditor,
  };

  const renderModeField = (field: ContentModeField) => {
    if (!shouldRenderField(fieldMap, currentSettings, field)) {
      return null;
    }
    const disabled = isFieldDisabled(fieldMap, currentSettings, field);
    if (field.input === "action") {
      const actionState = resolveFieldActionState({
        field,
        disabled: disabled || !item,
        loadingMap: fieldActionLoading,
        handlers: fieldActionHandlers,
      });
      if (!actionState) return null;
      const { action, loading, handler } = actionState;
      const ActionIcon = action.icon ?? Subtitles;
      return (
        <div key={field.key} className="grid gap-2">
          <LabelWithTooltip
            htmlFor={field.key}
            text={field.label}
            tip={field.tooltip ?? ""}
          />
          <Button
            type="button"
            id={field.key}
            variant={action.variant ?? "outline"}
            size={action.size ?? "sm"}
            loading={loading}
            loadingText={action.loadingLabel}
            disabled={actionState.disabled || actionState.loading}
            className="justify-start"
            onClick={() => {
              if (!handler) return;
              void handler(field);
            }}
          >
            <ActionIcon className="h-4 w-4" />
            {action.label ?? field.label}
          </Button>
        </div>
      );
    }
    if (field.input === "toggle") {
      return (
        <SettingToggleRow
          key={field.key}
          icon={Eye}
          label={field.label}
          tip={field.tooltip ?? ""}
          checked={Boolean(getFieldValue(field.key))}
          disabled={disabled}
          onCheckedChange={(checked) => updateFormValue(field.key, checked)}
        />
      );
    }
    if (field.input === "select") {
      const normalizedMode = (formValues.mode || item?.mode || "").toLowerCase();
      const isShortMode =
        normalizedMode.includes("short") || normalizedMode.includes("portrait");
      const selectOptions =
        field.key === "outputConfig.preset"
          ? (field.options ?? []).filter((option) => {
              if (option.value === "custom") return true;
              if (isShortMode) return option.value.startsWith("portrait_");
              return option.value.startsWith("landscape_");
            })
          : (field.options ?? []);
      return (
        <div key={field.key} className="grid gap-2">
          <LabelWithTooltip
            htmlFor={field.key}
            text={field.label}
            tip={field.tooltip ?? ""}
          />
          <IconSelect
            id={field.key}
            value={String(getFieldValue(field.key) ?? "")}
            onValueChange={(value) => updateFormValue(field.key, value)}
            triggerClassName={cn("w-full", disabled && "opacity-60")}
            options={selectOptions.map((option) => ({
              value: option.value,
              label: option.label,
              icon: option.icon ?? SlidersHorizontal,
              disabled,
            }))}
          />
        </div>
      );
    }
        if (field.input === "range" && field.key === "songPlaybackRange") {
      const maxSongDuration = songDurationSeconds > 0 ? songDurationSeconds : field.max ?? 600;
      const rawStart = getFieldValue("songRangeStartSeconds");
      const rawEnd = getFieldValue("songRangeEndSeconds");
      const start = Math.max(0, Number(rawStart ?? 0));
      const parsedEnd = Number(rawEnd);
      const endSource =
        rawEnd === null ||
        rawEnd === undefined ||
        rawEnd === "" ||
        !Number.isFinite(parsedEnd) ||
        parsedEnd <= 0
          ? maxSongDuration
          : parsedEnd;
      const end = Math.max(start, endSource);
      return (
        <SettingRangeSliderRow
          key={field.key}
          id={field.key}
          label={field.label}
          tip={field.tooltip ?? ""}
          value={[Math.min(start, maxSongDuration), Math.min(end, maxSongDuration)]}
          min={0}
          max={Math.max(1, maxSongDuration)}
          step={field.step ?? 1}
          suffix={field.suffix}
          formatValue={formatSecondsToMinutes}
          disabled={disabled}
          onValueChange={([nextStart, nextEnd]) => {
            updateFormValue("songRangeStartSeconds", nextStart);
            updateFormValue("songRangeEndSeconds", nextEnd);
          }}
        />
      );
    }
    if (field.input === "slider") {
      return (
        <SettingSliderRow
          key={field.key}
          id={field.key}
          label={field.label}
          tip={field.tooltip ?? ""}
          value={Number(getFieldValue(field.key))}
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          suffix={field.suffix}
          disabled={disabled}
          onValueChange={(value) => updateFormValue(field.key, value)}
        />
      );
    }
    return (
      <div key={field.key} className="grid gap-2">
        <LabelWithTooltip
          htmlFor={field.key}
          text={field.label}
          tip={field.tooltip ?? ""}
        />
        <InputGroup className="bg-white dark:bg-white/5">
          <InputGroupInput
            id={field.key}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={String(getFieldValue(field.key) ?? "")}
            onChange={(event) =>
              updateFormValue(field.key, event.target.value)
            }
            disabled={disabled}
          />
        </InputGroup>
      </div>
    );
  };


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
    if (!item || paletteMode !== "auto") return;
    setPaletteState(item.colorPalette ?? []);
  }, [item, paletteMode]);

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
          <p className="text-sm text-slate-500 dark:text-zinc-400 hidden md:block">
            Review metadata and render settings for this item.
          </p>
        </div>
      </div>
      <StickyBox top={isMobile || isTablet ? 80 : 80} fullWidth={isMobile || isTablet}>
        {(isSticky) => (
          <div
            className={cn(
              "flex items-center gap-3",
              isSticky && isMobile || isTablet ? "justify-center" : "justify-end"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {pageState === "loading" ? (
                <motion.div
                  key="sticky-actions-loading"
                  {...stateTransition}
                  className="flex items-center gap-3"
                >
                  <Skeleton className="h-10 w-28 rounded-xl" />
                  <Skeleton className="h-10 w-36 rounded-xl" />
                </motion.div>
              ) : (
                <motion.div
                  key="sticky-actions-ready"
                  {...stateTransition}
                  className="flex items-center gap-3"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </StickyBox>
    </div>

      <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
          <AnimatePresence mode="wait" initial={false}>
          {pageState === "loading" ? (
            <motion.div key="loading" {...stateTransition} className="space-y-5">
              <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 dark:border-white/10 dark:from-white/5 dark:to-white/[0.03]">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="mt-3 h-3 w-64" />
              </div>
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`edit-skeleton-${index}`}
                    className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-3 h-10 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </motion.div>
          ) : pageState === "error" ? (
            <motion.div
              key="error"
              {...stateTransition}
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-200"
            >
              {error}
            </motion.div>
          ) : isReady && resolvedItem ? (
            <motion.div key="ready" {...stateTransition} className="flex flex-col gap-6">
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
                  <IconSelect
                    value={formValues.status}
                    onValueChange={(value) =>
                      setFormValues((current) => ({
                        ...current,
                        status: value,
                      }))
                    }
                    id="status"
                    placeholder="Select status"
                    triggerClassName="w-full"
                    options={STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      icon: option.icon,
                    }))}
                  />
                </div>
                <div className="grid gap-2">
                  <LabelWithTooltip
                    htmlFor="mode"
                    text="Mode"
                    tip="Select which settings profile this content uses."
                  />
                  <IconSelect
                    value={formValues.mode}
                    onValueChange={(value) =>
                      setFormValues((current) => {
                        const settingsMap = normalizeSettingsMap(
                          current.mode,
                          current.settings
                        );
                        if (!settingsMap[value]) {
                          const defaults = resolveContentSettings(value, {}).settings;
                          return {
                            ...current,
                            mode: value,
                            settings: {
                              ...settingsMap,
                              [value]: defaults,
                            },
                          };
                        }
                        return {
                          ...current,
                          mode: value,
                          settings: settingsMap,
                        };
                      })
                    }
                    id="mode"
                    placeholder="Select mode"
                    triggerClassName="w-full"
                    options={modeOptions}
                  />
                </div>

                {!isTablet && (
                  <div className="grid gap-2">
                    <LabelWithTooltip
                      htmlFor="thumbnail"
                      text="Thumbnail"
                      tip="Image shown in the library and preview."
                    />
                    <div className="flex items-center gap-4 py-2">
                      <div className="h-20 w-28 overflow-hidden rounded-md ">
                        {thumbnailPreview || resolvedItem ? (
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
                        {paletteState.slice(0, 5).map((color, index) => (
                          <span
                            key={`${color}-${index}`}
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

                <ModeSettingsRenderer
                  sections={modeUi.sections}
                  renderField={renderModeField}
                  shouldRenderField={(field) =>
                    shouldRenderField(fieldMap, currentSettings, field)
                  }
                  shouldRenderGroup={(group) =>
                    shouldRenderGroup(fieldMap, currentSettings, group)
                  }
                  shouldRenderSection={(section) =>
                    shouldRenderSection(fieldMap, currentSettings, section)
                  }
                />

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
            </motion.div>
        ) : pageState === "notFound" ? (
          <motion.div key="empty" {...stateTransition}>
          <Alert variant={"secondary"} >
            <AlertIcon>
              <AlertCircle className="size-5" />
            </AlertIcon>
            <AlertTitle>Content not found</AlertTitle>
            <AlertContent>
              <Link href="/library" className="ml-2 text-emerald-500">
                Go back
              </Link>
            </AlertContent>
          </Alert>
          </motion.div>
        ) : null}
          </AnimatePresence>
        <div>
          <StickyBox
            top={isMobile || isTablet ? 120 : 140}
            fullWidth={isMobile || isTablet}
            className="self-start"
          >
            <div className="mt-2 relative overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 lg:border-0 lg:bg-transparent lg:mt-0">
              <AnimatePresence mode="wait" initial={false}>
                {pageState === "loading" ||
                videoLoading ||
                audioLoading ||
                !previewProps ||
                !canRenderPreview ? (
                  <motion.div key="preview-loading" {...stateTransition}>
                    <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
                  </motion.div>
                ) : isReady && resolvedItem ? (
                  <motion.div key="preview-ready" {...stateTransition}>
                    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                      <div className="flex h-full w-full items-center justify-center">
                        <Player
                          acknowledgeRemotionLicense
                          component={previewComponent}
                          inputProps={previewProps ?? {}}
                          durationInFrames={safeDurationInFrames}
                          fps={resolvedFps}
                          compositionWidth={resolvedWidth}
                          compositionHeight={resolvedHeight}
                          controls
                          style={{
                            width: `${previewWidthPercent}%`,
                            height: `${previewHeightPercent}%`,
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="preview-empty" {...stateTransition}>
                    <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
                  </motion.div>
                )}
              </AnimatePresence>
              
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
          </StickyBox>
          <div className="p-2 py-4">
            <AnimatePresence mode="wait" initial={false}>
              {pageState === "loading" ? (
                <motion.div key="meta-loading" {...stateTransition}>
                  <Skeleton className="h-7 w-72" />
                  <Skeleton className="mt-2 h-3 w-40" />
                </motion.div>
              ) : isReady && resolvedItem ? (
                <motion.div key="meta-ready" {...stateTransition}>
                  <div className="text-2xl font-semibold">{resolvedItem.title}</div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">
                    {new Date(resolvedItem.createdAt).toLocaleString()}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
