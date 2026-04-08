import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  Sparkles,
  SlidersHorizontal,
  Video,
  Monitor,
  Languages,
  Captions,
  MessageSquareText,
  Film,
  Zap,
  Minus,
  ChartNoAxesColumn,
  Spotlight,
  Timer,
  Atom,
  Blend,
  Subtitles,
  Pencil,
  ArrowUp,
  Circle,
  ArrowDown,
  Move,
} from "lucide-react";
import type { ComponentType } from "react";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import type { ContentLoopProps } from "@/types";

import { contentModeRegistry } from "./registry";

export type ContentModeFieldInput =
  | "number"
  | "slider"
  | "toggle"
  | "select"
  | "action"
  | "range";

export type ContentModeConditionRule = {
  key: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
};

export type ContentModeConditionSet = {
  all?: ContentModeConditionRule[];
  any?: ContentModeConditionRule[];
};

export type ContentModeField = {
  key: string;
  label: string;
  tooltip?: string;
  input: ContentModeFieldInput;
  defaultValue?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string; icon?: LucideIcon }>;
  suffix?: string;
  disableRoutes?: string[];
  disabledWhen?: ContentModeConditionSet;
  renderIf?: ContentModeConditionSet;
  resetsOnValue?: Array<{
    when: string | number | boolean;
    keys: string[];
  }>;
  deriveValuesOnValue?: Array<{
    when: string | number | boolean;
    mappings: Array<{
      fromKey: string;
      toKey: string;
    }>;
  }>;
  syncTargets?: Array<{
    key: string;
    when?: ContentModeConditionSet;
  }>;
  serialize?: (value: unknown) => number | string | boolean;
  deserialize?: (value: number | string | boolean) => unknown;
  action?: {
    id: string;
    label?: string;
    loadingLabel?: string;
    icon?: LucideIcon;
    variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
    size?: "default" | "sm" | "lg";
  };
};

export type ContentModeSection = {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  fields: ContentModeField[];
  layout?: "grid" | "list";
  disableRoutes?: string[];
  renderIf?: ContentModeConditionSet;
  groups?: Array<{
    id: string;
    title: string;
    description?: string;
    icon?: LucideIcon;
    fields: ContentModeField[];
    layout?: "grid" | "list";
    disableRoutes?: string[];
    renderIf?: ContentModeConditionSet;
  }>;
};

export type ContentModePreviewVariant = {
  id: "full" | "performance";
  label: string;
  icon?: LucideIcon;
  description?: string;
};

export type ContentModeUiDefinition = {
  icon: LucideIcon;
  previewComponent?: ComponentType<ContentLoopProps>;
  previewModes?: ContentModePreviewVariant[];
  sections: ContentModeSection[];
};

const videoLoopSections: ContentModeSection[] = [
  {
    id: "timing",
    title: "Timing",
    description: "Durations and playback timing.",
    icon: Timer,
    layout: "list",
    fields: [
      {
        key: "fadeDurationSeconds",
        label: "Crossfade (sec)",
        tooltip: "Crossfade duration between segments.",
        input: "number",
        min: 0,
        step: 0.1,
      },
      {
        key: "songPlaybackRange",
        label: "Song Playback Range",
        disableRoutes: ["/upload"],
        tooltip: "Pick the part of the song you want to use. The video will play over this selected section.",
        input: "range",
        min: 0,
        max: 600,
        step: 1,
        suffix: "s",
      },
      {
        key: "introFadeSeconds",
        label: "Intro Fade (sec)",
        tooltip: "Fade in at the start of the video.",
        input: "number",
        min: 0,
        step: 0.1,
        syncTargets: [
          {
            key: "audioFadeInSeconds",
            when: {
              all: [{ key: "syncAudioFadesWithVideo", equals: true }],
            },
          },
        ],
      },
      {
        key: "outroFadeSeconds",
        label: "Outro Fade (sec)",
        tooltip: "Fade out at the end of the video.",
        input: "number",
        min: 0,
        step: 0.1,
        syncTargets: [
          {
            key: "audioFadeOutSeconds",
            when: {
              all: [{ key: "syncAudioFadesWithVideo", equals: true }],
            },
          },
        ],
      },
    ],
  },
  {
    id: "audio",
    title: "Audio",
    description: "Audio fade controls.",
    icon: AudioLines,
    layout: "list",
    fields: [
      {
        key: "syncAudioFadesWithVideo",
        label: "Sync Audio Fades",
        tooltip:
          "Keep audio fade in and fade out aligned with the intro and outro fade values.",
        input: "toggle",
        defaultValue: true,
        deriveValuesOnValue: [
          {
            when: true,
            mappings: [
              { fromKey: "introFadeSeconds", toKey: "audioFadeInSeconds" },
              { fromKey: "outroFadeSeconds", toKey: "audioFadeOutSeconds" },
            ],
          },
        ],
      },
      {
        key: "audioFadeInSeconds",
        label: "Fade In (sec)",
        tooltip: "How long audio takes to reach full volume.",
        input: "number",
        min: 0,
        step: 0.1,
        disabledWhen: {
          all: [{ key: "syncAudioFadesWithVideo", equals: true }],
        },
      },
      {
        key: "audioFadeOutSeconds",
        label: "Fade Out (sec)",
        tooltip: "How long audio takes to fade to silence.",
        input: "number",
        min: 0,
        step: 0.1,
        disabledWhen: {
          all: [{ key: "syncAudioFadesWithVideo", equals: true }],
        },
      },
      {
        key: "audioFadeInOffsetSeconds",
        label: "Fade In Offset (sec)",
        tooltip: "Delay before audio fade-in starts.",
        input: "number",
        min: 0,
        step: 0.1,
      },
      {
        key: "audioFadeOutOffsetSeconds",
        label: "Fade Out Offset (sec)",
        tooltip: "Delay before audio fade-out starts.",
        input: "number",
        min: 0,
        step: 0.1,
      },
    ],
  },
  {
    id: "captions",
    disableRoutes: ["/upload"],
    title: "Captions",
    description: "Automatic subtitle generation and style.",
    icon: Subtitles,
    layout: "list",
    fields: [
      {
        key: "captionsEnabled",
        label: "Enable Captions",
        tooltip: "Generate and render captions for this mode.",
        input: "toggle",
      },
      {
        key: "captionsEdit",
        label: "Edit Captions",
        tooltip: "Open the interactive caption editor to tweak words and timing.",
        input: "action",
        action: {
          id: "captions.edit",
          label: "Add / Edit Caption Segments",
          icon: Pencil,
          variant: "outline",
          size: "sm",
        },
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsLanguage",
        label: "Language",
        tooltip: "ISO language hint for this mode (for example: en, es).",
        input: "select",
        defaultValue: "en",
        options: [
          { label: "English", value: "en", icon: Languages },
          { label: "Spanish", value: "es", icon: Languages },
          { label: "Portuguese", value: "pt", icon: Languages },
          { label: "French", value: "fr", icon: Languages },
          { label: "German", value: "de", icon: Languages },
        ],
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsStyle",
        label: "Caption Style",
        tooltip: "Choose visual treatment for captions.",
        input: "select",
        defaultValue: "subtitle",
        options: [
          { label: "Subtitle", value: "subtitle", icon: Captions },
          { label: "TikTok-style", value: "tiktok", icon: MessageSquareText },
        ],
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsPosition",
        label: "Position",
        tooltip: "Choose where captions appear on screen.",
        input: "select",
        defaultValue: "bottom",
        options: [
          { label: "Top", value: "top", icon: ArrowUp },
          { label: "Center", value: "center", icon: Circle },
          { label: "Bottom", value: "bottom", icon: ArrowDown },
          { label: "Custom", value: "custom", icon: Move },
        ],
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsOffsetX",
        label: "Caption X Offset",
        tooltip: "Move captions left or right when position is Custom.",
        input: "slider",
        min: -600,
        max: 600,
        step: 2,
        defaultValue: 0,
        suffix: "px",
        renderIf: {
          all: [{ key: "captionsPosition", equals: "custom" }],
        },
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsOffsetY",
        label: "Caption Y Offset",
        tooltip: "Move captions up or down when position is Custom.",
        input: "slider",
        min: -1200,
        max: 1200,
        step: 2,
        defaultValue: 0,
        suffix: "px",
        renderIf: {
          all: [{ key: "captionsPosition", equals: "custom" }],
        },
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsScalePercent",
        label: "Caption Scale",
        tooltip: "Scale caption size relative to the default style.",
        input: "slider",
        min: 50,
        max: 200,
        step: 5,
        defaultValue: 100,
        suffix: "%",
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsAnimationPreset",
        label: "Animation Preset",
        tooltip: "Choose how captions animate independently of caption style.",
        input: "select",
        defaultValue: "smooth",
        options: [
          { label: "Smooth", value: "smooth", icon: Sparkles },
          { label: "Cinematic", value: "cinematic", icon: Film },
          { label: "Punch", value: "punch", icon: Zap },
          { label: "Minimal", value: "minimal", icon: Minus },
        ],
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
      {
        key: "captionsWordsPerPage",
        label: "Words Per Page",
        tooltip:
          "How many words are shown together before advancing to the next caption page.",
        input: "slider",
        min: 1,
        max: 12,
        step: 1,
        defaultValue: 4,
        disabledWhen: {
          all: [{ key: "captionsEnabled", equals: false }],
        },
      },
    ],
  },
  {
    id: "visuals",
    title: "Visuals",
    description: "Visualization and glow options.",
    icon: Sparkles,
    layout: "list",
    fields: [],
    groups: [
      {
        id: "bars",
        title: "Bars",
        description: "Audio spectrum bars styling.",
        icon: ChartNoAxesColumn,
        layout: "list",
        fields: [
          {
            key: "visualizationEnabled",
            label: "Enable Bars",
            tooltip: "Toggle audio visualization bars.",
            input: "toggle",
          },
          {
            key: "visualizationBars",
            label: "Bars Count",
            tooltip: "How many spectrum bars to render.",
            input: "slider",
            disabledWhen: {
              all: [{ key: "visualizationEnabled", equals: false }],
            },
            min: 16,
            max: 128,
            step: 1,
          },
        ],
      },
      {
        id: "edge-rays",
        title: "Edge Rays",
        description: "Glow accent settings.",
        icon: Spotlight,
        layout: "list",
        fields: [
          {
            key: "edgeRaysEnabled",
            label: "Enable Glow",
            tooltip: "Toggle audio-reactive edge glow.",
            input: "toggle",
          },
          {
            key: "edgeRaysIntensity",
            label: "Glow Intensity",
            tooltip: "Overall glow intensity.",
            input: "slider",
            disabledWhen: {
              all: [{ key: "edgeRaysEnabled", equals: false }],
            },
            min: 0,
            max: 100,
            step: 1,
            suffix: "%",
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(1, Number(value) / 100)),
          },
          {
            key: "edgeRaysVocalBalance",
            label: "Vocal Balance",
            tooltip: "Blend between low and vocal bands.",
            input: "slider",
            disabledWhen: {
              all: [{ key: "edgeRaysEnabled", equals: false }],
            },
            min: 0,
            max: 100,
            step: 1,
            suffix: "%",
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(1, Number(value) / 100)),
          },
        ],
      },
      {
        id: "motion",
        title: "Motion",
        description: "Music-reactive envelope motion.",
        icon: Atom,
        layout: "list",
        fields: [
          {
            key: "motionEnabled",
            label: "Enable Motion",
            tooltip: "Apply music-reactive motion to the background.",
            input: "toggle",
            defaultValue: false,
          },
          {
            key: "motionAmountPx",
            label: "Motion Amount (px)",
            tooltip: "Maximum displacement in pixels.",
            input: "slider",
            defaultValue: 4,
            min: 0.5,
            max: 12,
            step: 0.1,
          },
          {
            key: "motionSpeed",
            label: "Motion Speed",
            tooltip: "Oscillation speed of the motion path.",
            input: "slider",
            defaultValue: 0.6,
            min: 0.1,
            max: 3,
            step: 0.05,
          },
          {
            key: "motionAttack",
            label: "Attack",
            tooltip: "How quickly motion reacts to rising energy.",
            input: "slider",
            min: 10,
            max: 99,
            step: 1,
            suffix: "%",
            serialize: (value) =>
              Math.round(Math.max(0.1, Math.min(0.99, Number(value) || 0.8)) * 100),
            deserialize: (value) =>
              Math.max(0.1, Math.min(0.99, Number(value) / 100)),
            defaultValue: 90,
          },
          {
            key: "motionRelease",
            label: "Release",
            tooltip: "How slowly motion decays after peaks.",
            input: "slider",
            min: 1,
            max: 90,
            step: 1,
            suffix: "%",
            serialize: (value) =>
              Math.round(Math.max(0.01, Math.min(0.9, Number(value) || 0.18)) * 100),
            deserialize: (value) =>
              Math.max(0.01, Math.min(0.9, Number(value) / 100)),
            defaultValue: 32,
          },
        ],
      },
      {
        id: "sharpen",
        title: "Sharpen",
        description: "Master and per-channel sharpening controls.",
        icon: Blend,
        layout: "list",
        fields: [
          {
            key: "sharpenEnabled",
            label: "Enable Sharpen",
            tooltip: "Apply sharpen filter to the video layer.",
            input: "toggle",
            defaultValue: false,
          },
          {
            key: "sharpenMaster",
            label: "Sharpen Master",
            tooltip: "Master intensity controlling all color tuning sliders.",
            input: "slider",
            disabledWhen: {
              any: [
                { key: "sharpenEnabled", equals: false },
                { key: "sharpenUseMaster", equals: false },
              ],
            },
            min: 0,
            max: 100,
            step: 1,
            suffix: "%",
            defaultValue: 40,
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(1, Number(value) / 100)),
          },
          {
            key: "sharpenUseMaster",
            label: "Use Master",
            tooltip: "When enabled, master drives all three channels.",
            input: "toggle",
            defaultValue: true,
            disabledWhen: {
              all: [{ key: "sharpenEnabled", equals: false }],
            },
            resetsOnValue: [
              {
                when: true,
                keys: [
                  "sharpenContrastWeight",
                  "sharpenSaturationWeight",
                  "sharpenBrightnessWeight",
                ],
              },
              {
                when: false,
                keys: ["sharpenMaster"],
              },
            ],
          },
          {
            key: "sharpenContrastWeight",
            label: "Contrast Weight",
            tooltip: "How much sharpen boosts contrast.",
            input: "slider",
            disabledWhen: {
              any: [
                { key: "sharpenEnabled", equals: false },
                { key: "sharpenUseMaster", equals: true },
              ],
            },
            min: 0,
            max: 100,
            step: 1,
            suffix: "%",
            defaultValue: 45,
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(1, Number(value) / 100)),
          },
          {
            key: "sharpenSaturationWeight",
            label: "Saturation Weight",
            tooltip: "How much sharpen boosts saturation.",
            input: "slider",
            disabledWhen: {
              any: [
                { key: "sharpenEnabled", equals: false },
                { key: "sharpenUseMaster", equals: true },
              ],
            },
            min: 0,
            max: 100,
            step: 1,
            suffix: "%",
            defaultValue: 20,
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(1, Number(value) / 100)),
          },
          {
            key: "sharpenBrightnessWeight",
            label: "Brightness Weight",
            tooltip: "How much sharpen boosts brightness.",
            input: "slider",
            disabledWhen: {
              any: [
                { key: "sharpenEnabled", equals: false },
                { key: "sharpenUseMaster", equals: true },
              ],
            },
            min: 0,
            max: 50,
            step: 1,
            suffix: "%",
            defaultValue: 3,
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(0.5, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(0.5, Number(value) / 100)),
          },
        ],
      },
    ],
  },
  {
    id: "playback",
    title: "Playback",
    description: "Playback speed and scaling.",
    icon: SlidersHorizontal,
    layout: "list",
    fields: [
      {
        key: "playbackRate",
        label: "Playback Rate",
        tooltip: "Sets video playback speed. Use 1.0 for normal speed.",
        input: "number",
        min: 0.25,
        max: 4,
        step: 0.05,
      },
      {
        key: "scalePercent",
        label: "Scale (%)",
        tooltip: "Scales the video layer. 100% keeps the original size.",
        input: "slider",
        min: 0,
        max: 200,
        step: 1,
        suffix: "%",
        serialize: (value) =>
          Math.round(Math.max(0, Math.min(200, Number(value) || 100))),
        deserialize: (value) =>
          Math.max(0, Math.min(200, Number(value))),
      },
    ],
  },
  {
    id: "output",
    title: "Output Preset",
    description: "Per-mode resolution and frame rate preset.",
    icon: Monitor,
    layout: "list",
    fields: [
      {
        key: "outputConfig.preset",
        label: "Preset",
        tooltip:
          "Select a predefined output profile. Each preset sets width, height, and default FPS.",
        input: "select",
        defaultValue: "landscape_fhd",
        options: [
          { label: "Landscape HD (1280x720 @60)", value: "landscape_hd" },
          { label: "Landscape FHD (1920x1080 @60)", value: "landscape_fhd" },
          { label: "Landscape QHD (2560x1440 @60)", value: "landscape_qhd" },
          { label: "Portrait HD (720x1280 @60)", value: "portrait_hd" },
          { label: "Portrait FHD (1080x1920 @60)", value: "portrait_fhd" },
          { label: "Portrait QHD (1440x2560 @60)", value: "portrait_qhd" },
          { label: "Custom", value: "custom" },
        ],
      },
      {
        key: "outputConfig.fps",
        label: "FPS",
        tooltip:
          "Frames per second. This field is used only when preset is set to Custom.",
        input: "number",
        min: 12,
        max: 120,
        step: 1,
        defaultValue: 60,
        renderIf: {
          all: [{ key: "outputConfig.preset", equals: "custom" }],
        },
      },
      {
        key: "outputConfig.width",
        label: "Width",
        tooltip:
          "Output width in pixels. This field is used only when preset is set to Custom.",
        input: "number",
        min: 16,
        max: 8192,
        step: 1,
        defaultValue: 1280,
        renderIf: {
          all: [{ key: "outputConfig.preset", equals: "custom" }],
        },
      },
      {
        key: "outputConfig.height",
        label: "Height",
        tooltip:
          "Output height in pixels. This field is used only when preset is set to Custom.",
        input: "number",
        min: 16,
        max: 8192,
        step: 1,
        defaultValue: 720,
        renderIf: {
          all: [{ key: "outputConfig.preset", equals: "custom" }],
        },
      },
    ],
  },
];

export const contentModeUiRegistry: Record<string, ContentModeUiDefinition> = {
  video_loop: {
    icon: Video,
    previewComponent: ContentLoopComposition,
    previewModes: [
      { id: "full", label: "Full Preview", icon: Monitor, description: "All effects and visuals." },
      { id: "performance", label: "Captions + Audio Only", icon: Captions, description: "Show only captions over a black background while keeping audio playback." },
    ],
    sections: videoLoopSections,
  },
  video_loop_short: {
    icon: Video,
    previewComponent: ContentLoopComposition,
    previewModes: [
      { id: "full", label: "Full Preview", icon: Monitor, description: "All effects and visuals." },
      { id: "performance", label: "Captions + Audio Only", icon: Captions, description: "Show only captions over a black background while keeping audio playback." },
    ],
    sections: videoLoopSections,
  },
};

const normalizeRoute = (route: string) => {
  const [pathname] = route.split(/[?#]/, 1);
  return pathname?.trim() || "/";
};

const matchesRouteRule = (rule: string, route: string) => {
  const normalizedRule = normalizeRoute(rule);
  const normalizedRoute = normalizeRoute(route);
  if (!normalizedRule) return false;
  if (normalizedRule.endsWith("*")) {
    const prefix = normalizedRule.slice(0, -1);
    return normalizedRoute.startsWith(prefix);
  }
  return normalizedRoute === normalizedRule;
};

const isDisabledOnRoute = (disableRoutes: string[] | undefined, route?: string) => {
  if (!route || !disableRoutes || disableRoutes.length === 0) return false;
  return disableRoutes.some((rule) => matchesRouteRule(rule, route));
};

const filterSectionsByRoute = (sections: ContentModeSection[], route?: string) => {
  if (!route) return sections;

  return sections
    .filter((section) => !isDisabledOnRoute(section.disableRoutes, route))
    .map((section) => {
      const filteredFields = section.fields.filter(
        (field) => !isDisabledOnRoute(field.disableRoutes, route)
      );

      const filteredGroups = section.groups
        ?.filter((group) => !isDisabledOnRoute(group.disableRoutes, route))
        .map((group) => ({
          ...group,
          fields: group.fields.filter(
            (field) => !isDisabledOnRoute(field.disableRoutes, route)
          ),
        }))
        .filter((group) => group.fields.length > 0);

      return {
        ...section,
        fields: filteredFields,
        groups: filteredGroups,
      };
    })
    .filter((section) => section.fields.length > 0 || (section.groups?.length ?? 0) > 0);
};

export const getContentModeUi = (mode?: string, route?: string) => {
  const base =
    contentModeUiRegistry[mode ?? "video_loop"] ?? contentModeUiRegistry.video_loop;

  if (!route) return base;

  return {
    ...base,
    sections: filterSectionsByRoute(base.sections, route),
  };
};

export const getContentModeDefinition = (mode?: string) => {
  if (mode && mode in contentModeRegistry) {
    return contentModeRegistry[mode as keyof typeof contentModeRegistry];
  }
  return contentModeRegistry.video_loop;
};
