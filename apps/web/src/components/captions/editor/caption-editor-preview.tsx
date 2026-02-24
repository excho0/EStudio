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
};

function CaptionEditorPreviewComponent({ preview, playerRef }: Props) {
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
        ref={playerRef}
        acknowledgeRemotionLicense
        component={preview.component}
        inputProps={preview.inputProps}
        durationInFrames={preview.durationInFrames}
        fps={preview.fps}
        compositionWidth={preview.compositionWidth}
        compositionHeight={preview.compositionHeight}
        controls={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export const CaptionEditorPreview = memo(
  CaptionEditorPreviewComponent,
  (prev, next) => prev.preview === next.preview && prev.playerRef === next.playerRef
);

CaptionEditorPreview.displayName = "CaptionEditorPreview";
