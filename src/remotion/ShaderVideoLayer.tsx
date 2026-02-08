"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { continueRender, delayRender, useRemotionEnvironment } from "remotion";
import { Html5Video, OffthreadVideo } from "remotion";

type ShaderVideoLayerProps = {
  src: string;
  width: number;
  height: number;
  frame: number;
  fps: number;
  videoFrameCount?: number;
  startFrom?: number;
  playbackRate?: number;
  sharpenAmount?: number;
  glowEnabled?: boolean;
  glowIntensity?: number;
  glowColor?: string;
  sampleVideo?: boolean;
  debugMode?: "none" | "passthrough" | "uv" | "solid";
  style?: React.CSSProperties;
};

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = (position + 1.0) * 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D uTexture;
uniform vec2 uTexelSize;        // 1.0 / texture size
uniform float uAmount;          // 0.0..2.0
uniform float uRadius;          // 0.5..2.5 (in pixels)
uniform float uThreshold;       // 0.0..0.2 (luma threshold)
uniform float uLumaBias;        // 0.0..1.0, protect skin/mids
uniform float uGlowIntensity;   // 0.0..1.0
uniform vec3 uGlowColor;        // rgb 0..1
uniform float uDebugMode;       // 0 none, 1 passthrough, 2 uv, 3 solid
uniform float uSampleVideo;     // 1 sample texture, 0 overlay-only

varying vec2 vUv;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 r = uTexelSize * uRadius;

  vec3 c  = texture2D(uTexture, vUv).rgb;
  vec3 n  = texture2D(uTexture, vUv + vec2(0.0, -r.y)).rgb;
  vec3 s  = texture2D(uTexture, vUv + vec2(0.0,  r.y)).rgb;
  vec3 e  = texture2D(uTexture, vUv + vec2( r.x, 0.0)).rgb;
  vec3 w  = texture2D(uTexture, vUv + vec2(-r.x, 0.0)).rgb;
  vec3 ne = texture2D(uTexture, vUv + vec2( r.x, -r.y)).rgb;
  vec3 nw = texture2D(uTexture, vUv + vec2(-r.x, -r.y)).rgb;
  vec3 se = texture2D(uTexture, vUv + vec2( r.x,  r.y)).rgb;
  vec3 sw = texture2D(uTexture, vUv + vec2(-r.x,  r.y)).rgb;

  // 9-tap gaussian-ish blur
  vec3 blur = (c * 4.0 + (n + s + e + w) * 2.0 + (ne + nw + se + sw)) / 16.0;
  vec3 detail = c - blur;

  float lc = luma(c);
  float ld = abs(luma(detail));

  // Threshold gating to avoid noise sharpening
  float gate = smoothstep(uThreshold, uThreshold + 0.03, ld);

  // Mid-tone bias (optional)
  float mid = 1.0 - abs(lc - 0.5) * 2.0;
  float toneWeight = mix(1.0, mid, clamp(uLumaBias, 0.0, 1.0));

  // Keep this branch numerically stable in headless renderers.
  vec3 outColor = c + detail * (uAmount * gate * toneWeight);

  // Rounded filmic edge glow: combines soft border vignette + subtle corner bloom.
  vec2 uv = vUv;
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float borderCore = 1.0 - smoothstep(0.02, 0.24, edgeDist);
  float borderFeather = 1.0 - smoothstep(0.0, 0.36, edgeDist);

  vec2 centerUv = uv - vec2(0.5);
  vec2 ellipse = vec2(centerUv.x * 1.08, centerUv.y * 0.92);
  float radial = length(ellipse) * 1.55;
  float cornerBloom = smoothstep(0.56, 1.02, radial);
  cornerBloom = pow(cornerBloom, 1.65);

  float glowMask = clamp(borderCore * 0.62 + borderFeather * 0.28 + cornerBloom * 0.34, 0.0, 1.0);
  vec3 glowAdd = uGlowColor * (uGlowIntensity * glowMask * 0.82);
  outColor += glowAdd;
  if (uDebugMode > 2.5) {
    gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
    return;
  }
  if (uDebugMode > 1.5) {
    gl_FragColor = vec4(vUv, 0.0, 1.0);
    return;
  }
  if (uDebugMode > 0.5) {
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  if (uSampleVideo < 0.5) {
    gl_FragColor = vec4(glowAdd, clamp(length(glowAdd) * 0.9, 0.0, 1.0));
    return;
  }
  gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), 1.0);
}

`;

type GlState = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  texelSizeLoc: WebGLUniformLocation;
  amountLoc: WebGLUniformLocation;
  radiusLoc: WebGLUniformLocation;
  thresholdLoc: WebGLUniformLocation;
  lumaBiasLoc: WebGLUniformLocation;
  glowIntensityLoc: WebGLUniformLocation;
  glowColorLoc: WebGLUniformLocation;
  debugModeLoc: WebGLUniformLocation;
  sampleVideoLoc: WebGLUniformLocation;
};

const hexToRgb01 = (value?: string): [number, number, number] => {
  const fallback: [number, number, number] = [0.65, 0.82, 1];
  if (!value) return fallback;
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
};

const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
};

const createProgram = (
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
) => {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program.");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(info);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
};

export const ShaderVideoLayer: React.FC<ShaderVideoLayerProps> = ({
  src,
  width,
  height,
  frame,
  fps,
  videoFrameCount,
  startFrom = 0,
  playbackRate = 1,
  sharpenAmount = 0.25,
  glowEnabled = false,
  glowIntensity = 0,
  glowColor,
  sampleVideo = true,
  debugMode = "none",
  style,
}) => {
  const { isRendering } = useRemotionEnvironment();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const glStateRef = useRef<GlState | null>(null);
  const [glAvailable, setGlAvailable] = useState(true);
  const [runtimeFallback, setRuntimeFallback] = useState(false);
  const videoReadyRef = useRef(false);
  const textureInitializedRef = useRef(false);
  const lastUploadedVideoTimeRef = useRef(-1);

  const initGl = useCallback((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return null;

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const buffer = gl.createBuffer();
    if (!buffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) return null;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const texelSizeLoc = gl.getUniformLocation(program, "uTexelSize");
    const amountLoc = gl.getUniformLocation(program, "uAmount");
    const radiusLoc = gl.getUniformLocation(program, "uRadius");
    const thresholdLoc = gl.getUniformLocation(program, "uThreshold");
    const lumaBiasLoc = gl.getUniformLocation(program, "uLumaBias");
    const glowIntensityLoc = gl.getUniformLocation(program, "uGlowIntensity");
    const glowColorLoc = gl.getUniformLocation(program, "uGlowColor");
    const debugModeLoc = gl.getUniformLocation(program, "uDebugMode");
    const sampleVideoLoc = gl.getUniformLocation(program, "uSampleVideo");
    const textureLoc = gl.getUniformLocation(program, "uTexture");
    if (
      !texelSizeLoc ||
      !amountLoc ||
      !radiusLoc ||
      !thresholdLoc ||
      !lumaBiasLoc ||
      !glowIntensityLoc ||
      !glowColorLoc ||
      !debugModeLoc ||
      !sampleVideoLoc ||
      !textureLoc
    )
      return null;

    gl.uniform1i(textureLoc, 0);

    return {
      gl,
      program,
      texture,
      texelSizeLoc,
      amountLoc,
      radiusLoc,
      thresholdLoc,
      lumaBiasLoc,
      glowIntensityLoc,
      glowColorLoc,
      debugModeLoc,
      sampleVideoLoc,
    };
  }, []);

  useEffect(() => {
    if (!sampleVideo) {
      videoRef.current = null;
      videoReadyRef.current = true;
      textureInitializedRef.current = false;
      lastUploadedVideoTimeRef.current = -1;
      return;
    }
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.setAttribute("crossorigin", "anonymous");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = !isRendering;
    video.src = src;
    const onReady = () => {
      videoReadyRef.current = true;
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.load();
    videoRef.current = video;
    videoReadyRef.current = false;
    textureInitializedRef.current = false;
    lastUploadedVideoTimeRef.current = -1;
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.pause();
      video.src = "";
      videoRef.current = null;
      videoReadyRef.current = false;
    };
  }, [isRendering, src, sampleVideo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || glStateRef.current) return;
    const state = initGl(canvas);
    glStateRef.current = state;
    setGlAvailable(Boolean(state));
  }, [initGl]);

  useEffect(() => {
    const glState = glStateRef.current;
    const video = videoRef.current;
    if (!glState || runtimeFallback) return;
    let cancelled = false;

    const totalFrames =
      typeof videoFrameCount === "number" && Number.isFinite(videoFrameCount)
        ? Math.max(1, Math.floor(videoFrameCount))
        : null;
    const absoluteFrame = startFrom + frame;
    const sourceFrame =
      totalFrames === null
        ? absoluteFrame
        : ((absoluteFrame % totalFrames) + totalFrames) % totalFrames;
    const targetTime = (sourceFrame / Math.max(1, fps)) / Math.max(0.0001, playbackRate);

    const draw = (): boolean => {
      if (cancelled) return false;
      const {
        gl,
        texture,
        texelSizeLoc,
        amountLoc,
        radiusLoc,
        thresholdLoc,
        lumaBiasLoc,
        glowIntensityLoc,
        glowColorLoc,
        debugModeLoc,
        sampleVideoLoc,
      } = glState;
      if (sampleVideo && (!video || video.readyState < 2 || !videoReadyRef.current)) {
        return false;
      }
      const changedFrame =
        !sampleVideo ||
        !video ||
        Math.abs(video.currentTime - lastUploadedVideoTimeRef.current) >
          1 / Math.max(1, fps * 2);
      if (!isRendering && !changedFrame) return false;

      try {
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      try {
        if (sampleVideo && video) {
          if (!textureInitializedRef.current) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            textureInitializedRef.current = true;
          } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
          }
        } else {
          if (!textureInitializedRef.current) {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              1,
              1,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              new Uint8Array([0, 0, 0, 0])
            );
            textureInitializedRef.current = true;
          }
        }
      } catch {
        // Keep frame deterministic and avoid white/undefined canvas state.
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return false;
      }
      } catch {
        setRuntimeFallback(true);
        return false;
      }
      const clampedAmount = Math.max(0, Math.min(1, sharpenAmount));
      const boostedAmount = Math.pow(clampedAmount, 0.9) * 1.2;
      const radius = 1.25 - clampedAmount * 0.35;
      const threshold = Math.max(0.006, 0.02 - clampedAmount * 0.012);
      gl.uniform2f(texelSizeLoc, 1 / Math.max(1, width), 1 / Math.max(1, height));
      gl.uniform1f(amountLoc, boostedAmount);
      gl.uniform1f(radiusLoc, radius);
      gl.uniform1f(thresholdLoc, threshold);
      gl.uniform1f(lumaBiasLoc, 0.02);
      gl.uniform1f(
        glowIntensityLoc,
        glowEnabled ? Math.max(0, Math.min(1, glowIntensity)) : 0
      );
      const [r, g, b] = hexToRgb01(glowColor);
      gl.uniform3f(glowColorLoc, r, g, b);
      gl.uniform1f(sampleVideoLoc, sampleVideo ? 1 : 0);
      const debugValue =
        debugMode === "passthrough"
          ? 1
          : debugMode === "uv"
            ? 2
            : debugMode === "solid"
              ? 3
              : 0;
      gl.uniform1f(debugModeLoc, debugValue);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (sampleVideo && video) {
        lastUploadedVideoTimeRef.current = video.currentTime;
      }
      return true;
    };

      if (isRendering && sampleVideo) {
      const frameHandle = delayRender("Shader frame seek");
      let finished = false;
      let retries = 0;
      const maxRetries = 20;
      const finish = () => {
        if (finished) return;
        finished = true;
        continueRender(frameHandle);
      };
      const drawAfterSeek = () => {
        if (cancelled) return;
        const ok = draw();
        if (ok) {
          finish();
          return;
        }
        retries += 1;
        if (retries >= maxRetries) {
          setRuntimeFallback(true);
          finish();
          return;
        }
        setTimeout(drawAfterSeek, 8);
      };

      try {
        video.pause();
        const seekAndDraw = () => {
          if (cancelled) return;
          const duration =
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : Infinity;
          const clampedTarget = Math.max(0, Math.min(targetTime, duration - 1 / Math.max(1, fps)));
          if (
            Math.abs(video.currentTime - clampedTarget) <
            1 / Math.max(1, fps * 4)
          ) {
            drawAfterSeek();
            return;
          }
          let seekTimeout: ReturnType<typeof setTimeout> | null = null;
          const onSeeked = () => {
            if (seekTimeout) clearTimeout(seekTimeout);
            video.removeEventListener("seeked", onSeeked);
            drawAfterSeek();
          };
          video.addEventListener("seeked", onSeeked);
          seekTimeout = setTimeout(() => {
            video.removeEventListener("seeked", onSeeked);
            // Some headless runs intermittently miss seeked; proceed with best effort.
            drawAfterSeek();
          }, 300);
          try {
            video.currentTime = clampedTarget;
          } catch {
            if (seekTimeout) clearTimeout(seekTimeout);
            video.removeEventListener("seeked", onSeeked);
            finish();
          }
        };
        if (!videoReadyRef.current || video.readyState < 2) {
          const onLoaded = () => {
            video.removeEventListener("loadeddata", onLoaded);
            seekAndDraw();
          };
          video.addEventListener("loadeddata", onLoaded, { once: true });
          const safety = setTimeout(() => {
            video.removeEventListener("loadeddata", onLoaded);
            finish();
          }, 2000);
          return () => {
            clearTimeout(safety);
            cancelled = true;
            finish();
          };
        } else {
          seekAndDraw();
        }
      } catch {
        finish();
      }

      return () => {
        cancelled = true;
        finish();
      };
    }

    if (sampleVideo && video && Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.25) {
      try {
        video.currentTime = targetTime;
      } catch {
        return;
      }
    }

    if (sampleVideo && video && video.paused) {
      void video.play().catch(() => {
        // User gesture policy can block autoplay; ignore in preview path.
      });
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [
    frame,
    fps,
    glowColor,
    debugMode,
    glowEnabled,
    glowIntensity,
    height,
    videoFrameCount,
    playbackRate,
    sharpenAmount,
    startFrom,
    runtimeFallback,
    width,
    isRendering,
    sampleVideo,
  ]);

  return (
    glAvailable && !runtimeFallback ? (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          ...style,
        }}
      />
    ) : sampleVideo && isRendering ? (
      <OffthreadVideo
        src={src}
        startFrom={startFrom}
        muted
        playbackRate={playbackRate}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          ...style,
        }}
      />
    ) : sampleVideo ? (
      <Html5Video
        src={src}
        startFrom={startFrom}
        muted
        playbackRate={playbackRate}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          ...style,
        }}
      />
    ) : null
  );
};
