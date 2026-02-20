"use client";

import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { ComponentType, RefObject } from "react";

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

export function CaptionEditorPreview({ preview, playerRef }: Props) {
  if (!preview) return null;
  return (
    <div className="mx-auto aspect-video w-full max-w-3xl max-h-60 lg:max-h-100">
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
        style={{ width: "100%", height: "100%", maxHeight: "280px" }}
      />
    </div>
  );
}
