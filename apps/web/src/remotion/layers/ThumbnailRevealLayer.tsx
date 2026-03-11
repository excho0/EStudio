import React, { useEffect, useRef, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, interpolate } from "remotion";

type ThumbnailRevealLayerProps = {
  thumbnailSrc: string | null | undefined;
  frame: number;
  fps: number;
  isRendering: boolean;
  motionTransform?: string;
  onRevealOpacityChange?: (value: number) => void;
  onVideoOpacityChange?: (value: number) => void;
};

export const ThumbnailRevealLayer: React.FC<ThumbnailRevealLayerProps> = ({
  thumbnailSrc,
  frame,
  fps,
  isRendering,
  motionTransform,
  onRevealOpacityChange,
  onVideoOpacityChange,
}) => {
  const [loadedThumbnailSrc, setLoadedThumbnailSrc] = useState<string | null>(null);
  const [fadeStartState, setFadeStartState] = useState<{ src: string | null; frame: number | null }>({
    src: null,
    frame: null,
  });
  const renderHandleRef = useRef<number | null>(null);

  const thumbnailFadeFrames = Math.min(12, Math.max(2, Math.round(fps * 0.2)));
  const thumbnailLoaded = Boolean(thumbnailSrc && loadedThumbnailSrc === thumbnailSrc);
  const fadeStartFrame =
    thumbnailSrc && fadeStartState.src === thumbnailSrc ? fadeStartState.frame : null;
  const shouldShowThumbnailLayer = Boolean(thumbnailSrc) && frame <= thumbnailFadeFrames;
  const shouldFade = Boolean(thumbnailSrc && thumbnailLoaded && fadeStartFrame !== null);
  const thumbnailOpacity =
    !shouldShowThumbnailLayer
      ? 0
      : shouldFade && thumbnailSrc
        ? interpolate(frame, [0, thumbnailFadeFrames], [1, 0], {
            extrapolateRight: "clamp",
          })
        : thumbnailSrc
          ? 1
          : 0;
  const revealOpacity =
    thumbnailSrc && !isRendering && shouldShowThumbnailLayer
      ? Math.max(0, Math.min(1, 1 - thumbnailOpacity))
      : 1;
  const videoVisibilityMultiplier =
    shouldShowThumbnailLayer && thumbnailSrc && !thumbnailLoaded && !isRendering ? 0 : 1;

  useEffect(() => {
    onRevealOpacityChange?.(revealOpacity);
  }, [onRevealOpacityChange, revealOpacity]);

  useEffect(() => {
    onVideoOpacityChange?.(videoVisibilityMultiplier);
  }, [onVideoOpacityChange, videoVisibilityMultiplier]);

  useEffect(() => {
    if (!thumbnailSrc || isRendering) {
      onRevealOpacityChange?.(1);
      onVideoOpacityChange?.(1);
      return;
    }
    if (renderHandleRef.current !== null) {
      continueRender(renderHandleRef.current);
    }
    renderHandleRef.current = delayRender("Loading thumbnail");
    return () => {
      if (renderHandleRef.current !== null) {
        continueRender(renderHandleRef.current);
        renderHandleRef.current = null;
      }
    };
  }, [isRendering, onRevealOpacityChange, onVideoOpacityChange, thumbnailSrc]);

  if (!thumbnailSrc || isRendering || !shouldShowThumbnailLayer) {
    return null;
  }

  return (
    <AbsoluteFill
      style={{
        opacity: thumbnailOpacity,
        transform: motionTransform,
      }}
    >
      <Img
        src={thumbnailSrc}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onLoad={() => {
          setLoadedThumbnailSrc(thumbnailSrc);
          setFadeStartState({ src: thumbnailSrc, frame: 0 });
          if (renderHandleRef.current !== null) {
            continueRender(renderHandleRef.current);
            renderHandleRef.current = null;
          }
        }}
        onError={() => {
          if (renderHandleRef.current !== null) {
            continueRender(renderHandleRef.current);
            renderHandleRef.current = null;
          }
        }}
      />
    </AbsoluteFill>
  );
};
