import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  Sparkles,
  SlidersHorizontal,
  Video,
  ChartNoAxesColumn,
  Spotlight,
  Timer,
  Atom,
  Blend,
} from "lucide-react";
import type { ComponentType } from "react";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import type { ContentLoopProps } from "@/types";

import { contentModeRegistry } from "./registry";

export type ContentModeFieldInput =
  | "number"
  | "slider"
  | "toggle"
  | "select";

export type ContentModeField = {
  key: string;
  label: string;
  tooltip?: string;
  input: ContentModeFieldInput;
  defaultValue?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  suffix?: string;
  disabledWhen?: {
    all?: Array<{
      key: string;
      equals?: string | number | boolean;
      notEquals?: string | number | boolean;
    }>;
    any?: Array<{
      key: string;
      equals?: string | number | boolean;
      notEquals?: string | number | boolean;
    }>;
  };
  resetsOnValue?: Array<{
    when: string | number | boolean;
    keys: string[];
  }>;
  serialize?: (value: unknown) => number | string | boolean;
  deserialize?: (value: number | string | boolean) => unknown;
};

export type ContentModeSection = {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  fields: ContentModeField[];
  layout?: "grid" | "list";
  groups?: Array<{
    id: string;
    title: string;
    description?: string;
    icon?: LucideIcon;
    fields: ContentModeField[];
    layout?: "grid" | "list";
  }>;
};

export type ContentModeUiDefinition = {
  icon: LucideIcon;
  previewComponent?: ComponentType<ContentLoopProps>;
  sections: ContentModeSection[];
};

export const contentModeUiRegistry: Record<string, ContentModeUiDefinition> = {
  video_loop: {
    icon: Video,
    previewComponent: ContentLoopComposition,
    sections: [
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
            key: "introFadeSeconds",
            label: "Intro Fade (sec)",
            tooltip: "Fade in at the start of the video.",
            input: "number",
            min: 0,
            step: 0.1,
          },
          {
            key: "outroFadeSeconds",
            label: "Outro Fade (sec)",
            tooltip: "Fade out at the end of the video.",
            input: "number",
            min: 0,
            step: 0.1,
          },
          {
            key: "overlapRatio",
            label: "Overlap (%)",
            tooltip: "Portion of the segment used for overlap.",
            input: "slider",
            min: 0,
            max: 90,
            step: 1,
            suffix: "%",
            serialize: (value) =>
              Math.round(Math.max(0, Math.min(0.9, Number(value) || 0)) * 100),
            deserialize: (value) =>
              Math.max(0, Math.min(0.9, Number(value) / 100)),
          },
        ],
      },
      {
        id: "audio",
        title: "Audio",
        description: "Audio fade controls.",
        icon: AudioLines,
        layout: "grid",
        fields: [
          {
            key: "audioFadeInSeconds",
            label: "Fade In (sec)",
            tooltip: "How long audio takes to reach full volume.",
            input: "number",
            min: 0,
            step: 0.1,
          },
          {
            key: "audioFadeOutSeconds",
            label: "Fade Out (sec)",
            tooltip: "How long audio takes to fade to silence.",
            input: "number",
            min: 0,
            step: 0.1,
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
            tooltip: "Speed of the video playback.",
            input: "number",
            min: 0.25,
            max: 4,
            step: 0.05,
          },
          {
            key: "scalePercent",
            label: "Scale (%)",
            tooltip: "Zoom the video in or out.",
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
    ],
  },
};

export const getContentModeUi = (mode?: string) =>
  contentModeUiRegistry[mode ?? "video_loop"] ?? contentModeUiRegistry.video_loop;

export const getContentModeDefinition = (mode?: string) => {
  if (mode && mode in contentModeRegistry) {
    return contentModeRegistry[mode as keyof typeof contentModeRegistry];
  }
  return contentModeRegistry.video_loop;
};
