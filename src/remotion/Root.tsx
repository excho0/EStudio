import React from "react";
import { Composition } from "remotion";
import { SampleVideo } from "./Video";
import {
  ContentLoopComposition,
  ContentLoopProps,
} from "./ContentLoopComposition";
import { TemplateVideo, TemplateVideoProps } from "./TemplateVideo";

type ContentLoopInput = ContentLoopProps & {
  songDurationSeconds: number;
  fps: number;
  width: number;
  height: number;
};

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
      <Composition<never, TemplateVideoProps>
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
      <Composition<ContentLoopInput>
        id="ContentLoop"
        component={ContentLoopComposition}
        defaultProps={{
          title: "Content Loop",
          videoSrc: "",
          audioSrc: "",
          segmentDurationSeconds: 4,
          fadeDurationSeconds: 1,
          videoDurationSeconds: 4,
          songDurationSeconds: 30,
          fps: 30,
          width: 1280,
          height: 720,
        }}
        calculateMetadata={({ props }) => {
          const fps = Number.isFinite(props.fps) ? props.fps : 30;
          const width = Number.isFinite(props.width) ? props.width : 1280;
          const height = Number.isFinite(props.height) ? props.height : 720;
          const durationInFrames = Math.max(
            1,
            Math.round((props.songDurationSeconds || 1) * fps)
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
    </>
  );
};
