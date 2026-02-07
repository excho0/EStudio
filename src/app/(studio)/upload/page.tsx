"use client";

import { useMemo, useRef, useState } from "react";
import { defineStepper } from "@stepperize/react";
import {
  CheckCircle,
  FileVideo,
  Film,
  Image as ImageIcon,
  Music,
  Sparkles,
  Monitor,
  Repeat2,
  ZoomIn,
  SlidersHorizontal,
  Timer,
  Type,
  FastForward,
  Settings2,
  CircleAlert,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CardUpload, {
  type FileUploadItem,
} from "@/components/upload/card-upload";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { LabelWithTooltip } from "@/components/content-settings/label-with-tooltip";
import { IconSelect } from "@/components/ui/icon-select";
import { useContentList } from "@/components/studio/use-content-list";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isFieldInvalid } from "@/lib/validation";
import {
  StepperContent,
  StepperFooter,
  StepperHeader,
  StepperMotion,
  StepperShell,
} from "@/components/controls/animated-stepper";
import { motion } from "framer-motion";
import {
  getContentModeDefinition,
  getContentModeUi,
  contentModeUiRegistry,
} from "@/lib/content-modes/ui-registry";
import type { ContentModeField } from "@/lib/content-modes/ui-registry";
import { ModeSettingsRenderer } from "@/components/content-settings/mode-settings";
import { SettingSliderRow, SettingToggleRow } from "@/components/content-settings/fields";
import { normalizeSettingsMap, resolveContentSettings } from "@/lib/content-modes";
import {
  applyFieldValue,
  buildFieldMap,
  getFieldValue as getFieldValueFromSettings,
} from "@/lib/content-modes/ui-helpers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type UploadFormValues = {
  title: string;
  mode: string;
  settings: Record<string, Record<string, unknown>>;
  songDurationSeconds: string;
  fps: string;
  width: string;
  height: string;
};

const initialForm: UploadFormValues = {
  title: "",
  mode: "video_loop",
  settings: {
    video_loop: resolveContentSettings("video_loop", {}).settings as Record<string, unknown>,
  },
  songDurationSeconds: "",
  fps: "30",
  width: "1280",
  height: "720",
};

const stepper = defineStepper(
  {
    id: "details",
    label: "Details",
    description: "Title and render defaults",
    icon: Settings2,
  },
  {
    id: "media",
    label: "Media",
    description: "Upload required media",
    icon: FileVideo,
  },
  {
    id: "review",
    label: "Review",
    description: "Confirm details before upload",
    icon: ImageIcon,
  },
  {
    id: "success",
    label: "Success",
    description: "Upload completed",
    icon: CheckCircle,
  }
);

const getMediaDuration = (file: File, kind: "audio" | "video") =>
  new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(kind);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    element.src = url;
  });

export default function DashboardUploadPage() {
  const methods = stepper.useStepper();
  const { refresh } = useContentList();
  const [submitting, setSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<UploadFormValues>(initialForm);
  const [draftPaths, setDraftPaths] = useState<{
    thumbnailPath?: string;
    videoPath?: string;
    songPath?: string;
  }>({});
  const [mediaFiles, setMediaFiles] = useState<FileUploadItem[]>([]);
  const uploadedSignaturesRef = useRef(new Map<string, string>());
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>(
    {}
  );
  const [uploadKey, setUploadKey] = useState(0);
  const isComplete = methods.current.id === "success";
  const thumbnailPreview = mediaFiles.find((file) =>
    file.file.type?.startsWith("image/")
  )?.preview;
  const modeUi = getContentModeUi(formValues.mode || "video_loop");
  const modeDefinition = getContentModeDefinition(formValues.mode || "video_loop");
  const requiredAssets = modeDefinition.requiredAssets;
  const requiresThumbnail = requiredAssets.includes("thumbnail");
  const requiresVideo = requiredAssets.includes("video");
  const requiresSong = requiredAssets.includes("song");
  const fieldMap = useMemo(() => buildFieldMap(modeUi.sections), [modeUi.sections]);
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
      return resolveContentSettings(formValues.mode, formValues.settings)
        .settings as Record<string, unknown>;
    } catch {
      const fallback = getContentModeDefinition(formValues.mode).defaults;
      return fallback as Record<string, unknown>;
    }
  }, [formValues.mode, formValues.settings]);
  const settingsMap = useMemo(
    () => normalizeSettingsMap(formValues.mode, formValues.settings),
    [formValues.mode, formValues.settings]
  );
  const currentSettings = useMemo(
    () =>
      (settingsMap[formValues.mode ?? "video_loop"] ?? {}) as Record<string, unknown>,
    [settingsMap, formValues.mode]
  );
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
  const getSettingNumber = (key: string, fallback: number) => {
    const value = resolvedSettings[key];
    const parsed = typeof value === "string" ? Number(value) : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const isReadyToUpload =
    (!requiresThumbnail || !!draftPaths.thumbnailPath) &&
    (!requiresVideo || !!draftPaths.videoPath) &&
    (!requiresSong || !!draftPaths.songPath) &&
    (!requiresSong || Number(formValues.songDurationSeconds || 0) > 0) &&
    (!requiresVideo || getSettingNumber("segmentDurationSeconds", 0) > 0);
  const reviewWidth = Math.round(Number(formValues.width || 1280));
  const reviewHeight = Math.round(Number(formValues.height || 720));
  const reviewScale = Math.round(getSettingNumber("scalePercent", 100));
  const reviewFps = Math.round(Number(formValues.fps || 30));
  const reviewOverlap = Math.round(Number(getFieldValue("overlapRatio")));
  const reviewFade = getSettingNumber("fadeDurationSeconds", 0);
  const reviewIntroFade = getSettingNumber("introFadeSeconds", 0);
  const reviewOutroFade = getSettingNumber("outroFadeSeconds", 0);
  const reviewPlaybackRate = getSettingNumber("playbackRate", 1);
  const reviewAudioFadeIn = getSettingNumber("audioFadeInSeconds", 0);
  const reviewAudioFadeOut = getSettingNumber("audioFadeOutSeconds", 0);
  const reviewAudioFadeInOffset = getSettingNumber("audioFadeInOffsetSeconds", 0);
  const reviewAudioFadeOutOffset = getSettingNumber("audioFadeOutOffsetSeconds", 0);

  const renderModeField = (field: ContentModeField) => {
    const disabled =
      (field.key === "visualizationBars" &&
        !Boolean(resolvedSettings.visualizationEnabled)) ||
      ((field.key === "edgeRaysIntensity" ||
        field.key === "edgeRaysVocalBalance") &&
        !Boolean(resolvedSettings.edgeRaysEnabled));
    if (field.input === "toggle") {
      return (
        <SettingToggleRow
          key={field.key}
          icon={Eye}
          label={field.label}
          tip={field.tooltip ?? ""}
          checked={Boolean(resolvedSettings[field.key])}
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
            onChange={(event) => updateFormValue(field.key, event.target.value)}
          />
        </InputGroup>
      </div>
    );
  };


  const handleMediaFilesChange = (files: FileUploadItem[]) => {
    void (async () => {
      setMediaFiles(files);
      const realFiles = files.filter(
        (entry): entry is FileUploadItem & { file: File } =>
          entry.file instanceof File
      );
      const imageFile =
        realFiles.find((entry) => entry.file.type.startsWith("image/"))?.file ??
        null;
      const videoFile =
        realFiles.find((entry) => entry.file.type.startsWith("video/"))?.file ??
        null;
      const audioFile =
        realFiles.find((entry) => entry.file.type.startsWith("audio/"))?.file ??
        null;

      if (!imageFile && requiresThumbnail) {
        setDraftPaths((current) => ({ ...current, thumbnailPath: undefined }));
      }
      if (!videoFile && requiresVideo) {
        setDraftPaths((current) => ({ ...current, videoPath: undefined }));
      }
      if (!audioFile && requiresSong) {
        setDraftPaths((current) => ({ ...current, songPath: undefined }));
      }

      if (videoFile && requiresVideo) {
        const duration = await getMediaDuration(videoFile, "video");
        const segmentDurationSeconds = duration ? Number(duration.toFixed(2)) : 0;
        setFormValues((current) => {
          const settingsMap = normalizeSettingsMap(current.mode, current.settings);
          const currentSettings =
            (settingsMap[current.mode] as Record<string, unknown>) ?? {};
          return {
            ...current,
            settings: {
              ...settingsMap,
              [current.mode]: {
                ...currentSettings,
                segmentDurationSeconds: segmentDurationSeconds || undefined,
                videoDurationSeconds: segmentDurationSeconds || undefined,
              },
            },
          };
        });
      } else if (requiresVideo) {
        setFormValues((current) => {
          const settingsMap = normalizeSettingsMap(current.mode, current.settings);
          const currentSettings =
            (settingsMap[current.mode] as Record<string, unknown>) ?? {};
          return {
            ...current,
            settings: {
              ...settingsMap,
              [current.mode]: {
                ...currentSettings,
                segmentDurationSeconds: undefined,
                videoDurationSeconds: undefined,
              },
            },
          };
        });
      }

      if (audioFile && requiresSong) {
        const duration = await getMediaDuration(audioFile, "audio");
        const songDurationSeconds = duration ? Number(duration.toFixed(2)) : 0;
        setFormValues((current) => {
          const next = {
            ...current,
            songDurationSeconds: String(songDurationSeconds),
          };
          return next;
        });
      } else if (requiresSong) {
        setFormValues((current) => {
          const next = {
            ...current,
          songDurationSeconds: "",
        };
          return next;
        });
      }

    })();
  };

  const uploadDraftFile = (
    file: File,
    kind: "thumbnail" | "video" | "song",
    onProgress: (progress: number) => void
  ) =>
    new Promise<{ path: string }>((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText) as { path: string };
          resolve(response);
        } else {
          reject(new Error("Upload failed."));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed."));
      xhr.send(formData);
    });

  const handleUploadFile = async (
    file: File,
    onProgress: (progress: number) => void
  ) => {
    const kind =
      file.type.startsWith("image/")
        ? "thumbnail"
        : file.type.startsWith("video/")
          ? "video"
          : "song";
    const signature = `${file.name}-${file.size}-${file.type}`;
    const existingPath = uploadedSignaturesRef.current.get(signature);
    if (existingPath) {
      setDraftPaths((current) => ({
        ...current,
        ...(kind === "thumbnail" ? { thumbnailPath: existingPath } : {}),
        ...(kind === "video" ? { videoPath: existingPath } : {}),
        ...(kind === "song" ? { songPath: existingPath } : {}),
      }));
      return {};
    }
    try {
      const { path } = await uploadDraftFile(file, kind, onProgress);
      uploadedSignaturesRef.current.set(signature, path);
      setDraftPaths((current) => ({
        ...current,
        ...(kind === "thumbnail" ? { thumbnailPath: path } : {}),
        ...(kind === "video" ? { videoPath: path } : {}),
        ...(kind === "song" ? { songPath: path } : {}),
      }));
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Upload failed." };
    }
  };

  const handleRemoveUploaded = async (fileItem: { file: File | { type?: string } }) => {
    if (!(fileItem.file instanceof File)) return;
    const kind =
      fileItem.file.type.startsWith("image/")
        ? "thumbnail"
        : fileItem.file.type.startsWith("video/")
          ? "video"
          : "song";
    const signature = `${fileItem.file.name}-${fileItem.file.size}-${fileItem.file.type}`;
    uploadedSignaturesRef.current.delete(signature);
    const path =
      kind === "thumbnail"
        ? draftPaths.thumbnailPath
        : kind === "video"
          ? draftPaths.videoPath
          : draftPaths.songPath;
    if (!path) return;
    await fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    setDraftPaths((current) => ({
      ...current,
      ...(kind === "thumbnail" ? { thumbnailPath: undefined } : {}),
      ...(kind === "video" ? { videoPath: undefined } : {}),
      ...(kind === "song" ? { songPath: undefined } : {}),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (methods.current.id !== "review") {
      const currentIndex = methods.all.findIndex(
        (step) => step.id === methods.current.id
      );
      const nextStep = methods.all[currentIndex + 1];
      if (nextStep && !allowStepNavigation(nextStep.id)) {
        return;
      }
      methods.next();
      return;
    }

    if (
      (requiresThumbnail && !draftPaths.thumbnailPath) ||
      (requiresVideo && !draftPaths.videoPath) ||
      (requiresSong && !draftPaths.songPath)
    ) {
      const missing = [
        requiresThumbnail ? "thumbnail" : null,
        requiresVideo ? "video" : null,
        requiresSong ? "song" : null,
      ]
        .filter(Boolean)
        .join(", ");
      setError(`Please select ${missing}.`);
      toast.error(`Please select ${missing}.`);
      return;
    }
    if (
      (requiresSong && Number(formValues.songDurationSeconds || 0) <= 0) ||
      (requiresVideo && getSettingNumber("segmentDurationSeconds", 0) <= 0)
    ) {
      setError("Unable to detect media durations. Please reselect the files.");
      toast.error("Unable to detect media durations. Please reselect the files.");
      return;
    }

    const resolved = resolveContentSettings(formValues.mode, formValues.settings);
    const settingsMap = normalizeSettingsMap(formValues.mode, formValues.settings);
    settingsMap[resolved.mode] = resolved.settings as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      title: formValues.title || "Untitled",
      thumbnailPath: draftPaths.thumbnailPath,
      videoPath: draftPaths.videoPath,
      songPath: draftPaths.songPath,
      mode: resolved.mode,
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

    setSubmitting(true);
    const response = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError("Upload failed. Please check the files and try again.");
      toast.error("Upload failed. Please check the files and try again.");
    } else {
      setFormValues(initialForm);
      setDraftPaths({});
      setMediaFiles([]);
      setUploadKey((current) => current + 1);
      await refresh();
      toast.success("Upload saved.");
      methods.goTo("success");
    }

    setSubmitting(false);
  };

  const allowStepNavigation = (id: string) => {
    let errorMessage: string | null = null;
    const nextErrors: Record<string, string> = {};
    if (methods.current.id === "details" && id !== "details") {
      if (!formValues.title.trim()) {
        errorMessage = "Please add a title before continuing.";
        nextErrors.title = errorMessage;
      }
    }
    if (methods.current.id === "media" && id === "review") {
      const hasImage = mediaFiles.some((file) =>
        file.file.type?.startsWith("image/")
      );
    const hasVideo = mediaFiles.some((file) =>
      file.file.type?.startsWith("video/")
    );
    const hasAudio = mediaFiles.some((file) =>
      file.file.type?.startsWith("audio/")
    );

      if (
        (requiresThumbnail && !hasImage) ||
        (requiresVideo && !hasVideo) ||
        (requiresSong && !hasAudio)
      ) {
        const missing = [
          requiresThumbnail && !hasImage ? "image" : null,
          requiresVideo && !hasVideo ? "video" : null,
          requiresSong && !hasAudio ? "song" : null,
        ].filter(Boolean);
        errorMessage = `Missing ${missing.join(", ")}. Please add ${missing.join(
          " and "
        )}.`;
        nextErrors.media = errorMessage;
      } else if (
        (requiresSong && Number(formValues.songDurationSeconds || 0) <= 0) ||
        (requiresVideo && getSettingNumber("segmentDurationSeconds", 0) <= 0)
      ) {
        errorMessage = "We couldn't detect durations. Please reselect your media.";
        nextErrors.media = errorMessage;
      }
    }

    if (errorMessage) {
      setError(errorMessage);
      setValidationErrors(nextErrors);
      toast.error(errorMessage);
      return false;
    }

    if (error) {
      setError(null);
    }
    if (Object.keys(validationErrors).length > 0) {
      setValidationErrors({});
    }

    return true;
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Film className="h-6 w-6 flex shrink-0" />
              <h2 className="text-lg font-semibold">New Project</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Upload media and define how the loop should behave.
            </p>
          </div>
        </div>

        <StepperShell
          steps={methods.all}
          currentId={methods.current.id}
          isComplete={isComplete}
          onStepClick={(id) => methods.goTo(id as typeof methods.current.id)}
          validate={allowStepNavigation}
        >
          <StepperHeader />

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <StepperContent>
              {({ direction }) => (
                <>
                  {methods.when("details", () => (
                    <StepperMotion stepKey="details" direction={direction}>
                <div className="grid gap-2">
                  <LabelWithTooltip
                    htmlFor="title"
                    text="Title"
                    tip="Name of this project as it appears in your library."
                    invalid={isFieldInvalid(validationErrors, "title")}
                  />
                  <InputGroup className="bg-white dark:bg-white/5">
                    <InputGroupInput
                      id="title"
                      aria-invalid={isFieldInvalid(validationErrors, "title")}
                      className={cn(
                        isFieldInvalid(validationErrors, "title") &&
                          "border-rose-300 text-rose-700 focus-visible:border-rose-400 focus-visible:ring-rose-400/40 dark:border-rose-500/60 dark:text-rose-200"
                      )}
                      value={formValues.title}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Midnight audio loop"
                    />
                    <InputGroupAddon>
                      <Type />
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                <div className="grid gap-2 mt-4">
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
                <div className="my-4 space-y-3">
                  <ModeSettingsRenderer
                    sections={modeUi.sections}
                    renderField={renderModeField}
                  />
                </div>

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
                    </StepperMotion>
                  ))}
                  {methods.when("media", () => (
                    <StepperMotion stepKey="media" direction={direction}>
                {/* {durationNote && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                    {durationNote}
                  </div>
                )} */}

                <div className="mt-4 grid gap-3">
                  <Label className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                    Media Upload
                  </Label>
                  <CardUpload
                    key={`media-${uploadKey}`}
                    maxFiles={requiredAssets.length}
                    maxSize={10 * 1024 * 1024 * 1024} // 10GB
                    accept={[
                      requiresThumbnail ? "image/*" : null,
                      requiresVideo ? "video/*" : null,
                      requiresSong ? "audio/*" : null,
                    ]
                      .filter(Boolean)
                      .join(",")}
                    multiple
                    simulateUpload={false}
                    typeLimits={{
                      ...(requiresThumbnail ? { "image/": 1 } : {}),
                      ...(requiresVideo ? { "video/": 1 } : {}),
                      ...(requiresSong ? { "audio/": 1 } : {}),
                    }}
                    initialFiles={mediaFiles}
                    onFilesChange={handleMediaFilesChange}
                    uploadHandler={handleUploadFile}
                    onRemoveUploaded={handleRemoveUploaded}
                  />
                </div>
                    </StepperMotion>
                  ))}
                  {methods.when("review", () => (
                    <StepperMotion stepKey="review" direction={direction}>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                  <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                        Preview
                      </div>
                      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/5">
                        {thumbnailPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbnailPreview}
                            alt="Thumbnail preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-zinc-500">
                            <ImageIcon className="h-6 w-6" />
                            <span className="text-xs uppercase tracking-[0.2em]">
                              No thumbnail
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          Title
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-zinc-50">
                          {formValues.title || "Untitled"}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                            <Monitor className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Resolution
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewWidth} x {reviewHeight}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                            <ZoomIn className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Scale
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewScale}%
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                            <Timer className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              FPS
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewFps}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                            <Repeat2 className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Overlap
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewOverlap}%
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                            <SlidersHorizontal className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Fade
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewFade || "--"}s
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                            <FastForward className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Playback
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewPlaybackRate || "--"}x
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Intro Fade
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewIntroFade || "--"}s
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Outro Fade
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewOutroFade || "--"}s
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Music className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Audio Fade In
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewAudioFadeIn || "--"}s
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Music className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Audio Fade Out
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewAudioFadeOut || "--"}s
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                            <Timer className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Audio In Offset
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewAudioFadeInOffset || "--"}s
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                            <Timer className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                              Audio Out Offset
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-zinc-50">
                              {reviewAudioFadeOutOffset || "--"}s
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                    </StepperMotion>
                  ))}
                  {methods.when("success", () => (
                    <StepperMotion stepKey="success" direction={direction}>
                        <motion.div
                          className="text-center py-10"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
                        >
                          <motion.div
                            className="relative mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-linear-to-br from-[#f8f7f4] via-40% to-[#a8a7a4] shadow-[0_0_0_2px_rgba(255,255,255,0.7),0_18px_40px_-20px_rgba(15,15,15,0.6)] after:absolute after:inset-1.5 after:rounded-full after:bg-linear-to-br after:from-white/80 after:to-white/10 after:content-[''] dark:from-[#7b7a78] dark:via-35% dark:to-[#1a1a1a] dark:shadow-[0_0_0_2px_rgba(255,255,255,0.08),0_18px_40px_-20px_rgba(0,0,0,0.7)] dark:after:bg-linear-to-br dark:after:from-white/10 dark:after:to-black/10"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.2 }}
                          >
                            <CheckCircle className="relative z-10 size-9 text-emerald-700 dark:text-emerald-300" />
                          </motion.div>
                          <motion.h3
                            className="text-2xl font-bold text-gray-12 mb-2"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                          >
                            Uploaded!
                          </motion.h3>
                          <motion.p
                            className="text-gray-12 mb-6"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                          >
                            Your files are saved and ready for render.
                          </motion.p>
                          <motion.button
                            type="button"
                            onClick={() => methods.reset()}

                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors hover:cursor-pointer"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            whileHover={{ scale: 1.05, transition: { delay: 0, duration: 0.12 } }}
                            whileTap={{ scale: 0.95, transition: { delay: 0, duration: 0.06 } }}
                          >
                            Upload another
                          </motion.button>
                        </motion.div>
                    </StepperMotion>
                  ))}
                </>
              )}
            </StepperContent>

            <StepperFooter>
              {error && (
                <motion.div
                  className="rounded-md border shadow bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, type: "spring", stiffness: 100, ease: "easeOut" }}
                >
                  <div className="flex flex-row items-center justify-center align-middle gap-2">
                    <CircleAlert className="flex shrink-0 " />
                    <span className="font-bold">{error}</span>
                  </div>
                </motion.div>
              )}

              {!isComplete && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                    onClick={() => methods.prev()}
                    disabled={methods.isFirst}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    loading={submitting && methods.current.id === "review"}
                    disabled={
                      submitting ||
                      (methods.current.id === "review" && !isReadyToUpload)
                    }
                  >
                    {methods.current.id === "review"
                      ? "Save"
                      : "Next"}
                  </Button>
                </div>
              )}
            </StepperFooter>
          </form>
        </StepperShell>
      </Card>
    </div>
  );
}
