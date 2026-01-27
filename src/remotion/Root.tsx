import React from "react";
import { Composition } from "remotion";
import { SampleVideo } from "./Video";
import {
  ContentLoopComposition,
  ContentLoopProps,
} from "./ContentLoopComposition";
import { AudioOnlyComposition, AudioOnlyProps } from "./AudioOnlyComposition";
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
          badge: "EXCHO",
          accentColor: "#10b981",
          backgroundColor: "#030712",
        }}
      />
      <Composition
        id="ContentLoop"
        component={ContentLoopComposition}
        defaultProps={{
          title: "Content Loop",
          thumbnailSrc: "",
          videoSrc: "",
          audioSrc: "",
          segmentDurationSeconds: 4,
          fadeDurationSeconds: 1,
          introFadeSeconds: 0,
          outroFadeSeconds: 0,
          audioFadeInSeconds: 0,
          audioFadeOutSeconds: 0,
          audioFadeInOffsetSeconds: 0,
          audioFadeOutOffsetSeconds: 0,
          videoDurationSeconds: 4,
          playbackRate: 1,
          overlapRatio: 0.25,
          scalePercent: 100,
          songDurationSeconds: 30,
          fps: 30,
          width: 1280,
          height: 720,
        }}
        calculateMetadata={({ props }: { props: ContentLoopProps }) => {
          const fps = Number.isFinite(props.fps ?? NaN) ? props.fps ?? 30 : 30;
          const width = Number.isFinite(props.width ?? NaN) ? props.width ?? 1280 : 1280;
          const height = Number.isFinite(props.height ?? NaN) ? props.height ?? 720 : 720;
          const songDurationSeconds = Number.isFinite(props.songDurationSeconds ?? NaN)
            ? props.songDurationSeconds ?? 1
            : 1;
          const durationInFrames = Math.max(
            1,
            Math.round(songDurationSeconds * fps)
          );

          return {
            fps,
            width,
            height,
            durationInFrames,
            props,
          };
        }}
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
