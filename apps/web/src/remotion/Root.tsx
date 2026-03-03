import React from "react";
import { Composition } from "remotion";
import { SampleVideo } from "./Video";
import { ContentLoopComposition } from "./ContentLoopComposition";
import {
  buildContentLoopProps,
  resolveContentLoopMetadata,
} from "./content-loop-props";
import { AudioOnlyComposition } from "./AudioOnlyComposition";
import type { AudioOnlyProps } from "../types";
import { TemplateVideo } from "./TemplateVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SampleVideo"
        component={SampleVideo}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ title: "Remotion + Next.js" }}
      />
      <Composition
        id="TemplatePreview"
        component={TemplateVideo}
        durationInFrames={240}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          title: "Momentum for your content",
          subtitle: "Loop-ready visuals synced to your audio track.",
          badge: "ESTUDIO",
          accentColor: "#10b981",
          backgroundColor: "#030712",
        }}
      />
      <Composition
        id="ContentLoop"
        component={ContentLoopComposition}
        defaultProps={buildContentLoopProps({})}
        calculateMetadata={({ props }) => resolveContentLoopMetadata(props)}
      />
      <Composition
        id="ContentLoopAudio"
        component={AudioOnlyComposition}
        defaultProps={{
          audioSrc: "",
          audioFadeInSeconds: 0,
          audioFadeOutSeconds: 0,
          audioFadeInOffsetSeconds: 0,
          audioFadeOutOffsetSeconds: 0,
          songDurationSeconds: 30,
          fps: 30,
        }}
        calculateMetadata={({ props }: { props: AudioOnlyProps }) => {
          const fps = Number.isFinite(props.fps ?? NaN) ? props.fps ?? 30 : 30;
          const songDurationSeconds = Number.isFinite(props.songDurationSeconds ?? NaN)
            ? props.songDurationSeconds ?? 1
            : 1;
          const durationInFrames = Math.max(
            1,
            Math.round(songDurationSeconds * fps)
          );

          return {
            fps,
            width: 2,
            height: 2,
            durationInFrames,
            props,
          };
        }}
      />
    </>
  );
};
