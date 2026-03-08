"use client";

import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { memo, type ComponentType, type RefObject } from "react";

export type CaptionEditorPreviewProps = {
  component: ComponentType<Record<string, unknown>>;
  inputProps: Record<string, unknown>;
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
};

type Props = {
  preview: CaptionEditorPreviewProps | null;
  playerRef: RefObject<PlayerRef | null>;
  playerKey?: string | number;
  initialFrame?: number;
};

function CaptionEditorPreviewComponent({
  preview,
  playerRef,
  playerKey,
  initialFrame = 0,
}: Props) {
  if (!preview) return null;
  const aspectRatio = `${preview.compositionWidth} / ${preview.compositionHeight}`;
  return (
    <div
      className="mx-auto w-full max-w-5xl overflow-hidden"
      style={{
        aspectRatio,
        height: "clamp(180px, 34vh, 460px)",
        maxHeight: "55svh",
      }}
    >
      <Player
        key={playerKey}
        ref={playerRef}
        acknowledgeRemotionLicense
        component={preview.component}
        inputProps={preview.inputProps}
        durationInFrames={preview.durationInFrames}
        fps={preview.fps}
        compositionWidth={preview.compositionWidth}
        compositionHeight={preview.compositionHeight}
        initialFrame={initialFrame}
        controls={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export const CaptionEditorPreview = memo(
  CaptionEditorPreviewComponent,
  (prev, next) =>
    prev.preview === next.preview &&
    prev.playerRef === next.playerRef &&
    prev.playerKey === next.playerKey &&
    prev.initialFrame === next.initialFrame
);

CaptionEditorPreview.displayName = "CaptionEditorPreview";
