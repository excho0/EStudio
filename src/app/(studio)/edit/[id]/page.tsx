"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/components/navigation/route-transition";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Palette,
  SlidersHorizontal,
  Type,
  Info,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Pipette,
  Copy,
  Eye,
  RotateCw,
  Save,
  Monitor,
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
import type { EditFormValues, PaletteMode } from "@/types";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import { ContentItem } from "@/types";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import {
  DEFAULT_CONTENT_MODE,
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
} from "@/lib/content/modes/ui-helpers";
import { ModeSettingsRenderer } from "@/components/content-settings/mode-settings";
import {
  LabelWithTooltip,
} from "@/components/content-settings/label-with-tooltip";
import {
  SettingSliderRow,
  SettingToggleRow,
} from "@/components/content-settings/fields";
import StickyBox from "@/components/ui/sticky-box";
import { useIsMobile } from "@/hooks/use-mobile";
import { is } from "drizzle-orm";
import { cn } from "@/lib/shared/utils";

const STATUS_OPTIONS = [
  { value: "uploaded", label: "Uploaded", icon: Upload },
  { value: "rendering", label: "Rendering", icon: Loader2 },
  { value: "rendered", label: "Rendered", icon: CheckCircle2 },
  { value: "failed", label: "Failed", icon: XCircle },
] as const;

const defaultFormValues = {
  title: "",
  status: "",
  mode: DEFAULT_CONTENT_MODE,
  songDurationSeconds: "",
  fps: "",
  width: "",
  height: "",
  settings: {},
};

type FormValues = EditFormValues;

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
    fps: String(item.fps ?? ""),
    width: String(item.width ?? ""),
    height: String(item.height ?? ""),
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
  const fps = toOptionalNumber(formValues.fps);
  if (fps !== undefined) payload.fps = fps;
  const width = toOptionalNumber(formValues.width);
  if (width !== undefined) payload.width = width;
  const height = toOptionalNumber(formValues.height);
  if (height !== undefined) payload.height = height;
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
  if (payload.fps !== undefined) {
    formData.append("fps", String(payload.fps));
  }
  if (payload.width !== undefined) {
    formData.append("width", String(payload.width));
  }
  if (payload.height !== undefined) {
    formData.append("height", String(payload.height));
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

export default function EditContentPage() {
  const params = useParams<{ id: string }>();
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
  /* eslint-disable react-hooks/set-state-in-effect */
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
  const videoUrl = item ? `/api/content/${item.id}/asset?type=video` : null;
  const audioUrl = item ? `/api/content/${item.id}/asset?type=song` : null;
  const thumbnailUrl = item
    ? `/api/content/${item.id}/asset?type=thumbnail&v=${thumbnailVersion}`
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
  const resolvedFps = Math.max(1, Math.round(Number(formValues.fps || 30)));
  const resolvedWidth = Math.max(1, Math.round(Number(formValues.width || 1280)));
  const resolvedHeight = Math.max(1, Math.round(Number(formValues.height || 720)));
  const getSettingNumber = (key: string, fallback: number) => {
    const value = resolvedSettings[key];
    const parsed = typeof value === "string" ? Number(value) : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  // Resolved FPS/width/height now come from base form values.
  const segmentDurationSeconds = getSettingNumber("segmentDurationSeconds", 4);
  const songDurationSeconds = Math.max(
    0,
    Number(formValues.songDurationSeconds || 0) ||
      (typeof item?.songDurationSeconds === "number" ? item.songDurationSeconds : 0)
  );
  const previewDurationSeconds =
    songDurationSeconds > 0 ? songDurationSeconds : segmentDurationSeconds;
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

  const modeUi = useMemo(
    () => getContentModeUi(formValues.mode || item?.mode),
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
          fps: resolvedFps,
          width: resolvedWidth,
          height: resolvedHeight,
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

  const renderModeField = (field: ContentModeField) => {
    const disabled = isFieldDisabled(fieldMap, currentSettings, field);
    if (field.input === "toggle") {
      return (
        <SettingToggleRow
          key={field.key}
          icon={Eye}
          label={field.label}
          tip={field.tooltip ?? ""}
          checked={Boolean(resolvedSettings[field.key])}
          disabled={disabled}
          onCheckedChange={(checked) => updateFormValue(field.key, checked)}
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
          />
        </InputGroup>
      </div>
    );
  };


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
          <p className="text-sm text-slate-500 dark:text-zinc-400">
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
        )}
      </StickyBox>
    </div>

      <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
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
                        return { ...current, mode: value, settings: settingsMap };
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

                <ModeSettingsRenderer
                  sections={modeUi.sections}
                  renderField={renderModeField}
                />

                <Collapsible
                  // defaultOpen
                  className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title="Output"
                    description="Frames per second and render size."
                    icon={Monitor}
                  />
                  <CollapsibleContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <LabelWithTooltip
                          htmlFor="fps"
                          text="FPS"
                          tip="Frames per second."
                        />
                        <InputGroup className="bg-white dark:bg-white/5">
                          <InputGroupInput
                            id="fps"
                            type="number"
                            min={12}
                            max={120}
                            step={1}
                            value={formValues.fps}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                fps: event.target.value,
                              }))
                            }
                          />
                        </InputGroup>
                      </div>
                      <div className="grid gap-2">
                        <LabelWithTooltip
                          htmlFor="width"
                          text="Width"
                          tip="Output width in pixels."
                        />
                        <InputGroup className="bg-white dark:bg-white/5">
                          <InputGroupInput
                            id="width"
                            type="number"
                            min={320}
                            step={1}
                            value={formValues.width}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                width: event.target.value,
                              }))
                            }
                          />
                        </InputGroup>
                      </div>
                      <div className="grid gap-2">
                        <LabelWithTooltip
                          htmlFor="height"
                          text="Height"
                          tip="Output height in pixels."
                        />
                        <InputGroup className="bg-white dark:bg-white/5">
                          <InputGroupInput
                            id="height"
                            type="number"
                            min={240}
                            step={1}
                            value={formValues.height}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                height: event.target.value,
                              }))
                            }
                          />
                        </InputGroup>
                      </div>
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
        ) : contentQuery.isFetched ? (
          <div className="text-sm text-slate-500 dark:text-zinc-400">
            Content item not found.
            <Link href="/library" className="ml-2 text-emerald-500">
              Go back
            </Link>
          </div>
        ) : null}
        <div>
          <StickyBox
            top={isMobile || isTablet ? 120 : 140}
            fullWidth={isMobile || isTablet}
            className="self-start"
          >
            <div className="mt-2 relative overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 lg:border-0 lg:bg-transparent lg:mt-0">
              {loading || videoLoading || audioLoading || !previewProps || !canRenderPreview ? (
                <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
              ) : item ? (
                <Player
                  acknowledgeRemotionLicense
                  component={previewComponent}
                  inputProps={previewProps ?? {}}
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
          </StickyBox>
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
