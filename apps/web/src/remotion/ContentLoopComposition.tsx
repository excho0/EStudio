import React, { useMemo, useState } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Html5Video,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { useAudioData } from "@remotion/media-utils";
import type { ContentLoopProps } from "../types";
import { CaptionsLayer } from "./layers/CaptionsLayer";
import { DebugOverlayLayer } from "./layers/DebugOverlayLayer";
import { EdgeRaysShaderLayer } from "./layers/EdgeRaysShaderLayer";
import { ThumbnailRevealLayer } from "./layers/ThumbnailRevealLayer";
import { VisualizationBarsLayer } from "./layers/VisualizationBarsLayer";
import { clamp } from "@estudio/utils";
import { buildVideoSlices, resolveCaptionRuntime } from "./utils";
import { useAudioBandMetrics } from "./hooks/useAudioBandMetrics";
import { useAudioReactiveMetrics } from "./hooks/useAudioReactiveMetrics";
import { useEdgeRaysMetrics } from "./hooks/useEdgeRaysMetrics";
import { useCompositionPalette } from "./hooks/useCompositionPalette";
import { useCompositionTiming } from "./hooks/useCompositionTiming";
import { useMotionTransform } from "./hooks/useMotionTransform";

type LoopVideoProps = {
  src: string;
  startFrom?: number;
  endAt?: number;
  muted?: boolean;
  playbackRate?: number;
  style?: React.CSSProperties;
};


const LoopVideo: React.FC<LoopVideoProps> = (props) => {
  const { isRendering } = useRemotionEnvironment();

  if (isRendering) {
    return <OffthreadVideo {...props} />;
  }

  return <Html5Video {...props} />;
};

const SegmentLayer: React.FC<{
  duration: number;
  videoSrc: string;
  playableVideoFrames: number;
  windowStartFrame: number;
  startFrom: number;
  playbackRate?: number;
  sharpenEnabled?: boolean;
  sharpenAmount?: number;
  sharpenUseMaster?: boolean;
  sharpenMaster?: number;
  sharpenContrastWeight?: number;
  sharpenSaturationWeight?: number;
  sharpenBrightnessWeight?: number;
  glowEnabled?: boolean;
  glowIntensity?: number;
  glowColor?: string;
  scale: number;
}> = ({
  duration,
  videoSrc,
  playableVideoFrames,
  windowStartFrame,
  startFrom,
  playbackRate,
  sharpenEnabled = false,
  sharpenAmount = 0.4,
  sharpenUseMaster = true,
  sharpenMaster = 0.4,
  sharpenContrastWeight = 0.45,
  sharpenSaturationWeight = 0.2,
  sharpenBrightnessWeight = 0.03,
  glowEnabled = false,
  glowIntensity = 0,
  glowColor,
  scale,
}) => {
  const { width, height, fps } = useVideoConfig();
  const slices = buildVideoSlices(startFrom, duration, playableVideoFrames);
  const masterStrength = Math.max(
    0,
    Math.min(1, Number.isFinite(sharpenMaster) ? sharpenMaster : sharpenAmount)
  );
  const contrastWeight = Math.max(0, Math.min(1, sharpenContrastWeight));
  const saturationWeight = Math.max(0, Math.min(1, sharpenSaturationWeight));
  const brightnessWeight = Math.max(0, Math.min(0.5, sharpenBrightnessWeight));
  const contrastBoost = sharpenUseMaster
    ? masterStrength * contrastWeight
    : contrastWeight;
  const saturationBoost = sharpenUseMaster
    ? masterStrength * saturationWeight
    : saturationWeight;
  const brightnessBoost = sharpenUseMaster
    ? masterStrength * brightnessWeight
    : brightnessWeight;
  const baseVideoFilter = sharpenEnabled
    ? `contrast(${(1 + contrastBoost).toFixed(3)}) saturate(${(
        1 + saturationBoost
      ).toFixed(3)}) brightness(${(1 + brightnessBoost).toFixed(3)})`
    : undefined;

  return (
    <AbsoluteFill
      style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
    >
      {slices.map((slice) => (
        <Sequence
          key={`${slice.from}-${slice.startFrom}`}
          from={slice.from}
          durationInFrames={slice.duration}
        >
          <LoopVideo
            src={videoSrc}
            startFrom={windowStartFrame + slice.startFrom}
            endAt={slice.startFrom + slice.duration}
            muted
            playbackRate={playbackRate}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: baseVideoFilter,
            }}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const ContentLoopComposition: React.FC<ContentLoopProps> = ({
  thumbnailSrc,
  videoSrc,
  audioSrc,
  previewMode = "full",
  visualizationEnabled = true,
  visualizationBars = 128,
  edgeRaysEnabled = true,
  edgeRaysIntensity = 0.3,
  edgeRaysVocalBalance = 0.6,
  motionEnabled = false,
  motionAmountPx = 4,
  motionSpeed = 0.6,
  motionAttack = 0.9,
  motionRelease = 0.32,
  sharpenEnabled = false,
  sharpenAmount = 0.4,
  sharpenUseMaster = true,
  sharpenMaster = 0.4,
  sharpenContrastWeight = 0.45,
  sharpenSaturationWeight = 0.2,
  sharpenBrightnessWeight = 0.03,
  colorPalette,
  scalePercent = 100,
  segmentDurationSeconds,
  fadeDurationSeconds,
  introFadeSeconds = 0,
  outroFadeSeconds = 0,
  audioFadeInSeconds = 0,
  audioFadeOutSeconds = 0,
  audioFadeInOffsetSeconds = 0,
  audioFadeOutOffsetSeconds = 0,
  videoDurationSeconds,
  songDurationSeconds,
  songRangeStartSeconds = 0,
  songRangeEndSeconds = null,
  playbackRate = 1,
  overlapRatio = null,
  captionsEnabled = false,
  captionsStyle = "subtitle",
  captionsPosition = "bottom",
  captionsOffsetX = 0,
  captionsOffsetY = 0,
  captionsScalePercent = 100,
  captionsAnimationPreset = "smooth",
  captionsWordsPerPage = 4,
  captionsData = null,
  debugOverlayEnabled = false,
}) => {
  const frame = useCurrentFrame();
  const { isRendering } = useRemotionEnvironment();
  const { durationInFrames, fps, width, height } = useVideoConfig();
  const effectivePreviewMode = isRendering ? "full" : previewMode;
  const effectiveDebugOverlayEnabled =
    debugOverlayEnabled ||
    process.env.NEXT_PUBLIC_REMOTION_DEBUG_OVERLAY === "true" ||
    process.env.REMOTION_DEBUG_OVERLAY === "true";
  const [thumbnailRevealOpacity, setThumbnailRevealOpacity] = useState(1);
  const [videoVisibilityMultiplier, setVideoVisibilityMultiplier] = useState(1);
  const {
    videoOpacity,
    contentLayerOpacity,
    outroOverlayOpacity,
    resolvedPlaybackRate,
    scaleFactor,
    segmentFrames,
    transitionFrames,
    audioVolume,
    rangeStartFrames,
    rangeEndFrames,
    playableVideoFrames,
    segmentStepFrames,
    maxSegmentStartFrame,
    timelineMs,
  } = useCompositionTiming({
    frame,
    fps,
    durationInFrames,
    introFadeSeconds,
    outroFadeSeconds,
    audioFadeInSeconds,
    audioFadeOutSeconds,
    audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds,
    playbackRate,
    scalePercent,
    segmentDurationSeconds,
    fadeDurationSeconds,
    overlapRatio,
    videoDurationSeconds,
    songDurationSeconds,
    songRangeStartSeconds,
    songRangeEndSeconds,
    thumbnailRevealOpacity,
    videoVisibilityMultiplier,
  });

  const audioData = useAudioData(audioSrc ?? "");
  const resolvedVisualizationBars = Math.min(
    256,
    Math.max(16, Math.round(Number(visualizationBars) || 128))
  );

  const {
    paletteColors,
    accentColor,
    barPaletteColors,
    glowColor,
    captionHighlightColor,
  } = useCompositionPalette(colorPalette);


  // FIX 2: Added `noiseFloor` parameter and made the `curve` slightly higher 
  // for a sharper AE look.
  const audioBandMetrics = useAudioBandMetrics({
    audioData,
    frame,
    fps,
    rangeStartFrames,
    rangeEndFrames,
    resolvedBandCount: resolvedVisualizationBars,
    enabled: visualizationEnabled || edgeRaysEnabled,
  });

  const { bassMotionEnergy } = useAudioReactiveMetrics({
    currentBands: audioBandMetrics?.currentBands ?? null,
  });

  const { edgeEnergy, glowIntensity } = useEdgeRaysMetrics({
    smoothedBands: audioBandMetrics?.smoothedBands ?? null,
    currentBands: audioBandMetrics?.currentBands ?? null,
    edgeRaysVocalBalance,
    edgeRaysIntensity,
    frame,
  });

  const {
    motionEnergy,
    motionBase,
    motionAmp,
    motionX,
    motionY,
    motionTransform,
  } = useMotionTransform({
    frame,
    fps,
    motionEnabled,
    motionAmountPx,
    motionSpeed,
    motionAttack,
    motionRelease,
    bassMotionEnergy,
  });

  const edgeRayVisibility = Math.min(
    1,
    Math.max(0, glowIntensity * 1.2 + edgeEnergy * 0.35)
  );
  const edgeRayLayerOpacity = Math.max(
    0,
    Math.min(1, contentLayerOpacity * (0.88 + edgeRayVisibility * 0.2))
  );

  const {
    effectiveCaptionsStyle,
    captionSegments,
    captionPages,
    hasActiveCaption,
    captionOpacity,
    captionTransform,
    captionBlur,
  } = useMemo(
    () =>
      resolveCaptionRuntime({
        captionsEnabled,
        captionsStyle,
        captionsAnimationPreset,
        captionsWordsPerPage,
        captionsSegments: captionsData?.segments ?? [],
        captionsGlobalOffsetMs: captionsData?.globalOffsetMs ?? 0,
        timelineMs,
        rangeStartMs: (rangeStartFrames / fps) * 1000,
        rangeEndMs: (rangeEndFrames / fps) * 1000,
      }),
    [
      captionsAnimationPreset,
      captionsData?.segments,
      captionsData?.globalOffsetMs,
      captionsEnabled,
      captionsWordsPerPage,
      captionsStyle,
      timelineMs,
    ]
  );
  const segmentCount = useMemo(() => {
    if (segmentFrames <= transitionFrames) {
      return 1;
    }
    const target = Math.max(1, durationInFrames - transitionFrames);
    return Math.max(1, Math.ceil(target / segmentStepFrames));
  }, [durationInFrames, segmentFrames, segmentStepFrames, transitionFrames]);
  const segments = useMemo(
    () => Array.from({ length: segmentCount }, (_, index) => index),
    [segmentCount]
  );
  const segmentTransitionSeries = useMemo(
    () =>
      segments.flatMap((index) => {
        const items = [
          <TransitionSeries.Sequence
            key={`segment-${index}`}
            durationInFrames={segmentFrames}
          >
            <SegmentLayer
              duration={segmentFrames}
              videoSrc={videoSrc}
              playableVideoFrames={playableVideoFrames}
              windowStartFrame={0}
              startFrom={
                maxSegmentStartFrame === 0
                  ? 0
                  : (index * segmentStepFrames) % (maxSegmentStartFrame + 1)
              }
              playbackRate={resolvedPlaybackRate}
              sharpenEnabled={sharpenEnabled}
              sharpenAmount={sharpenAmount}
              sharpenUseMaster={sharpenUseMaster}
              sharpenMaster={sharpenMaster}
              sharpenContrastWeight={sharpenContrastWeight}
              sharpenSaturationWeight={sharpenSaturationWeight}
              sharpenBrightnessWeight={sharpenBrightnessWeight}
              glowEnabled={edgeRaysEnabled}
              glowIntensity={glowIntensity * contentLayerOpacity}
              glowColor={glowColor}
              scale={scaleFactor}
            />
          </TransitionSeries.Sequence>,
        ];

        if (index < segments.length - 1 && transitionFrames > 0) {
          items.push(
            <TransitionSeries.Transition
              key={`transition-${index}`}
              presentation={fade({
                shouldFadeOutExitingScene: false,
              })}
              timing={linearTiming({ durationInFrames: transitionFrames })}
            />
          );
        }

        return items;
      }),
    [
      segmentFrames,
      segments,
      segmentStepFrames,
      transitionFrames,
      playableVideoFrames,
      videoSrc,
      maxSegmentStartFrame,
      resolvedPlaybackRate,
      glowIntensity,
      sharpenAmount,
      sharpenUseMaster,
      sharpenMaster,
      sharpenContrastWeight,
      sharpenSaturationWeight,
      sharpenBrightnessWeight,
      sharpenEnabled,
      contentLayerOpacity,
      edgeRaysEnabled,
      glowColor,
      scaleFactor,
    ]
  );
  const captionsLayerProps = {
    captionsEnabled,
    captionsStyle,
    captionsPosition,
    captionsOffsetX,
    captionsOffsetY,
    captionsScalePercent,
    effectiveCaptionsStyle,
    captionSegments,
    captionPages,
    hasActiveCaption,
    fps,
    timelineMs,
    captionOpacity,
    captionTransform,
    captionBlur,
    captionHighlightColor,
    layerOpacity: contentLayerOpacity,
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: effectivePreviewMode === "performance" ? "#000000" : "#050505",
        color: "white",
      }}
    >
      {effectivePreviewMode !== "performance" && videoSrc ? (
        <>
          <AbsoluteFill
            style={{
              opacity: videoOpacity,
              transform: motionTransform,
            }}
          >
            <TransitionSeries>{segmentTransitionSeries}</TransitionSeries>
          </AbsoluteFill>
          <ThumbnailRevealLayer
            thumbnailSrc={thumbnailSrc}
            frame={frame}
            fps={fps}
            isRendering={isRendering}
            motionTransform={motionTransform}
            onRevealOpacityChange={setThumbnailRevealOpacity}
            onVideoOpacityChange={setVideoVisibilityMultiplier}
          />
        </>
      ) : effectivePreviewMode !== "performance" ? (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
            padding: 48,
          }}
        >
          Upload a video to preview the looped sequence.
        </AbsoluteFill>
      ) : null}
      {effectivePreviewMode !== "performance" && edgeRaysEnabled && glowIntensity > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <EdgeRaysShaderLayer
            width={width}
            height={height}
            frame={frame}
            fps={fps}
            glowIntensity={glowIntensity}
            edgeEnergy={edgeEnergy}
            motionEnergy={motionEnergy}
            opacity={edgeRayLayerOpacity}
            color={glowColor}
          />
        </AbsoluteFill>
      ) : null}
      {audioSrc ? (
        <Html5Audio
          src={audioSrc}
          volume={audioVolume}
          trimBefore={rangeStartFrames}
          trimAfter={rangeEndFrames}
        />
      ) : null}
      <CaptionsLayer {...captionsLayerProps} />
      {effectiveDebugOverlayEnabled ? (
        <DebugOverlayLayer
          title="ContentLoop Debug"
          metrics={[
            { label: "isRendering", value: isRendering },
            { label: "previewMode", value: effectivePreviewMode },
            { label: "motionEnabled", value: motionEnabled },
            { label: "motionX", value: motionX },
            { label: "motionY", value: motionY },
            { label: "motionAmp", value: motionAmp },
            { label: "motionBase", value: motionBase },
            { label: "edgeRaysEnabled", value: edgeRaysEnabled },
            { label: "edgeEnergy", value: edgeEnergy },
            { label: "glowIntensity", value: glowIntensity },
            { label: "visualizationEnabled", value: visualizationEnabled },
            { label: "audioDataLoaded", value: Boolean(audioData) },
          ]}
        />
      ) : null}
      {effectivePreviewMode !== "performance" && visualizationEnabled && audioBandMetrics?.smoothedBands ? (
        <VisualizationBarsLayer
          bars={audioBandMetrics?.smoothedBands ?? []}
          paletteColors={paletteColors}
          barPaletteColors={barPaletteColors}
          accentColor={accentColor}
          opacity={contentLayerOpacity}
        />
      ) : null}
      {outroOverlayOpacity > 0 ? (
        <AbsoluteFill
          style={{ backgroundColor: "black", opacity: outroOverlayOpacity }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
