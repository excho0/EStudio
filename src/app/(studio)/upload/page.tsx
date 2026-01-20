"use client";

import { useState } from "react";
import { defineStepper } from "@stepperize/react";
import {
  CheckCircle,
  ChevronDown,
  FileVideo,
  Film,
  Image,
  Music,
  MoveHorizontal,
  MoveVertical,
  Timer,
  Type,
  FastForward,
  Info,
  Settings2,
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
import { useContentList } from "../_components/use-content-list";
import { toast } from "sonner";
import {
  StepperContent,
  StepperFooter,
  StepperHeader,
  StepperMotion,
  StepperShell,
} from "@/components/animated-stepper";

const initialForm = {
  title: "",
  songDurationSeconds: "",
  segmentDurationSeconds: "",
  videoDurationSeconds: "",
  fadeDurationSeconds: "1",
  playbackRate: "1",
  overlapPercent: 25,
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
    description: "Upload thumbnail, video, and song",
    icon: FileVideo,
  },
  {
    id: "review",
    label: "Review",
    description: "Confirm details before upload",
    icon: Image,
  },
  {
    id: "success",
    label: "Success",
    description: "Upload completed",
    icon: CheckCircle,
  }
);

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
  const [formValues, setFormValues] = useState(initialForm);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [songFile, setSongFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationNote, setDurationNote] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const isReadyToUpload =
    !!thumbnailFile &&
    !!videoFile &&
    !!songFile &&
    !!formValues.songDurationSeconds &&
    !!formValues.segmentDurationSeconds;
  const isComplete = methods.current.id === "success";

  const updateDurationNote = (
    songDurationSeconds: string,
    segmentDurationSeconds: string
  ) => {
    if (!songDurationSeconds && !segmentDurationSeconds) {
      setDurationNote(null);
      return;
    }

    const songValue = songDurationSeconds || "0";
    const segmentValue = segmentDurationSeconds || "0";
    setDurationNote(
      `Detected song length: ${songValue}s. Segment length: ${segmentValue}s.`
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (methods.current.id !== "review") {
      methods.next();
      return;
    }

    if (!thumbnailFile || !videoFile || !songFile) {
      setError("Please select a thumbnail, video, and song file.");
      toast.error("Please select a thumbnail, video, and song file.");
      return;
    }
    if (!formValues.songDurationSeconds || !formValues.segmentDurationSeconds) {
      setError("Unable to detect media durations. Please reselect the files.");
      toast.error("Unable to detect media durations. Please reselect the files.");
      return;
    }

    const payload = new FormData();
    payload.append("title", formValues.title || "Untitled");
    payload.append("thumbnail", thumbnailFile);
    payload.append("video", videoFile);
    payload.append("song", songFile);
    payload.append("songDurationSeconds", formValues.songDurationSeconds);
    payload.append("segmentDurationSeconds", formValues.segmentDurationSeconds);
    payload.append("videoDurationSeconds", formValues.videoDurationSeconds);
    payload.append("fadeDurationSeconds", formValues.fadeDurationSeconds);
    payload.append("playbackRate", formValues.playbackRate);
    payload.append("overlapRatio", String(formValues.overlapPercent / 100));
    payload.append("fps", formValues.fps);
    payload.append("width", formValues.width);
    payload.append("height", formValues.height);

    setSubmitting(true);
    const response = await fetch("/api/content", {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      setError("Upload failed. Please check the files and try again.");
      toast.error("Upload failed. Please check the files and try again.");
    } else {
      setFormValues(initialForm);
      setThumbnailFile(null);
      setVideoFile(null);
      setSongFile(null);
      setDurationNote(null);
      setUploadKey((current) => current + 1);
      await refresh();
      toast.success("Upload saved.");
      methods.goTo("success");
    }

    setSubmitting(false);
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
                      placeholder="Midnight audio loop"
                    />
                    <InputGroupAddon>
                      <Type />
                    </InputGroupAddon>
                  </InputGroup>
                </div>

                <div className="mt-4 space-y-3">
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
                            step="0.1"
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
                    </StepperMotion>
                  ))}
                  {methods.when("media", () => (
                    <StepperMotion stepKey="media" direction={direction}>
                {durationNote && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                    {durationNote}
                  </div>
                )}

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-2">
                    <LabelWithTooltip
                      htmlFor="thumbnail"
                      text="Thumbnail"
                      tip="Cover image shown in the library."
                    />
                    <Input
                      id="thumbnail"
                      key={`thumbnail-${uploadKey}`}
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setThumbnailFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <LabelWithTooltip
                      htmlFor="video"
                      text="Video"
                      tip="Main clip used for the loop."
                    />
                    <Input
                      id="video"
                      key={`video-${uploadKey}`}
                      type="file"
                      accept="video/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0] ?? null;
                        setVideoFile(file);
                        if (file) {
                          const duration = await getMediaDuration(file, "video");
                          const segmentDurationSeconds = duration
                            ? duration.toFixed(2)
                            : "";
                          setFormValues((current) => {
                            const next = {
                              ...current,
                              segmentDurationSeconds,
                              videoDurationSeconds: segmentDurationSeconds,
                            };
                            updateDurationNote(
                              next.songDurationSeconds,
                              next.segmentDurationSeconds
                            );
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <LabelWithTooltip
                      htmlFor="song"
                      text="Song"
                      tip="Audio track that sets the total duration."
                    />
                    <Input
                      id="song"
                      key={`song-${uploadKey}`}
                      type="file"
                      accept="audio/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0] ?? null;
                        setSongFile(file);
                        if (file) {
                          const duration = await getMediaDuration(file, "audio");
                          const songDurationSeconds = duration
                            ? duration.toFixed(2)
                            : "";
                          setFormValues((current) => {
                            const next = { ...current, songDurationSeconds };
                            updateDurationNote(
                              next.songDurationSeconds,
                              next.segmentDurationSeconds
                            );
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                </div>
                    </StepperMotion>
                  ))}
                  {methods.when("review", () => (
                    <StepperMotion stepKey="review" direction={direction}>
                <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-white/10 dark:text-zinc-300">
                  <div className="flex flex-col gap-3">
                    <div>
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                        Title
                      </span>
                      <div className="font-semibold text-slate-900 dark:text-zinc-50">
                        {formValues.title || "Untitled"}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          Song Length
                        </span>
                        <div>{formValues.songDurationSeconds || "--"}s</div>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          Segment Length
                        </span>
                        <div>{formValues.segmentDurationSeconds || "--"}s</div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          Resolution
                        </span>
                        <div>
                          {formValues.width} x {formValues.height}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          FPS
                        </span>
                        <div>{formValues.fps}</div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          Fade
                        </span>
                        <div>{formValues.fadeDurationSeconds || "--"}s</div>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                          Playback rate
                        </span>
                        <div>{formValues.playbackRate || "--"}x</div>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                        Overlap
                      </span>
                      <div>{formValues.overlapPercent}%</div>
                    </div>
                  </div>
                </div>
                    </StepperMotion>
                  ))}
                  {methods.when("success", () => (
                    <StepperMotion stepKey="success" direction={direction}>
                <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Music className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold">Upload complete</div>
                    <p className="text-sm">
                      Your files are saved and ready for render.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    onClick={() => methods.reset()}
                  >
                    Upload another
                  </Button>
                </div>
                    </StepperMotion>
                  ))}
                </>
              )}
            </StepperContent>

            <StepperFooter>
              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-200">
                  {error}
                </div>
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
                    disabled={
                      submitting ||
                      (methods.current.id === "review" && !isReadyToUpload)
                    }
                  >
                    {methods.current.id === "review"
                      ? submitting
                        ? "Uploading..."
                        : "Upload & Save"
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
