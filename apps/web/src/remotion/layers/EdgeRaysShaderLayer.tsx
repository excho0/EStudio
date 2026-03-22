"use client";

import React, { useEffect, useRef, useMemo, useState } from "react";

type EdgeRaysShaderLayerProps = {
  width: number;
  height: number;
  frame: number;
  fps: number;
  glowIntensity: number;
  edgeEnergy: number;
  motionEnergy: number;
  opacity?: number;
  color: string;
  style?: React.CSSProperties;
};

const hexToRgb = (hex: string) => {
  const cleanHex = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) return [1.0, 1.0, 1.0];
  const r = Number.parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(cleanHex.slice(4, 6), 16) / 255;
  return [r, g, b];
};

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_glowIntensity;
  uniform float u_edgeEnergy;
  uniform float u_motionEnergy;
  uniform vec3 u_color;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i.x + i.y * 57.0);
    float b = hash(i.x + 1.0 + i.y * 57.0);
    float c = hash(i.x + (i.y + 1.0) * 57.0);
    float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float lightningBand(
    float along,
    float inward,
    float time,
    float seed,
    float motion,
    float intensity
  ) {
    float stableMotion = smoothstep(0.08, 0.9, motion);
    float intensityDetail = smoothstep(0.45, 1.0, intensity);
    float travel =
      along * (5.0 + intensityDetail * 1.9) -
      time * (0.14 + stableMotion * 0.22 + intensityDetail * 0.16) +
      seed;
    float n1 = noise(vec2(travel, inward * (0.028 + intensityDetail * 0.01) + seed * 0.18));
    float n2 = noise(vec2(travel * 0.92 + 2.6, inward * 0.013 + seed * 0.1));
    float n3 = noise(vec2(travel * 0.66 - 1.0, inward * 0.007 + seed * 0.06));
    float combined = n1 * 0.58 + n2 * 0.24 + n3 * (0.12 + intensityDetail * 0.04);
    float streak = smoothstep(0.84 - intensityDetail * 0.08, 0.944 - intensityDetail * 0.04, combined);
    float falloff = exp(-inward / (34.0 + stableMotion * 8.0 + intensityDetail * 9.0));
    return streak * falloff;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    float stableEdge = smoothstep(0.08, 0.92, u_edgeEnergy);
    float stableMotion = smoothstep(0.08, 0.88, u_motionEnergy);
    float glowLevel = clamp(u_glowIntensity, 0.0, 1.0);
    float intensityMotion = smoothstep(0.2, 1.0, glowLevel);

    float pulseAmount = 0.002 + stableMotion * 0.004 + intensityMotion * 0.008;
    float pTop = 1.0 + sin(u_time * 0.72) * pulseAmount;
    float pBot = 1.0 + sin(u_time * 0.67 + 1.1) * pulseAmount;
    float pLeft = 1.0 + sin(u_time * 0.61 + 0.6) * pulseAmount;
    float pRight = 1.0 + sin(u_time * 0.58 + 1.7) * pulseAmount;

    float dTop = u_resolution.y - gl_FragCoord.y;
    float dBot = gl_FragCoord.y;
    float dLeft = gl_FragCoord.x;
    float dRight = u_resolution.x - gl_FragCoord.x;

    float spread = mix(12.0, 184.0, pow(glowLevel, 0.72));
    float raySpread = mix(4.0, 74.0, pow(glowLevel, 0.78));

    float baseTop = exp(-dTop / spread) * pTop;
    float baseBot = exp(-dBot / spread) * pBot;
    float baseLeft = exp(-dLeft / spread) * pLeft;
    float baseRight = exp(-dRight / spread) * pRight;

    float rayStrength = glowLevel * (0.08 + stableEdge * 0.14 + intensityMotion * 0.1);
    float topRay = lightningBand(uv.x, dTop, u_time, 0.7, stableMotion, u_glowIntensity) * rayStrength;
    float botRay = lightningBand(uv.x, dBot, u_time, 2.1, stableMotion, u_glowIntensity) * rayStrength;
    float leftRay = lightningBand(uv.y, dLeft, u_time, 3.4, stableMotion, u_glowIntensity) * rayStrength;
    float rightRay = lightningBand(uv.y, dRight, u_time, 5.0, stableMotion, u_glowIntensity) * rayStrength;

    topRay *= exp(-dTop / raySpread);
    botRay *= exp(-dBot / raySpread);
    leftRay *= exp(-dLeft / raySpread);
    rightRay *= exp(-dRight / raySpread);

    float rayField = max(max(topRay, botRay), max(leftRay, rightRay));
    float baseField = max(max(baseTop, baseBot), max(baseLeft, baseRight));

    float totalGlow = (baseField * 0.72 + rayField * (0.8 + glowLevel * 0.08 + intensityMotion * 0.08)) * 0.56;
    totalGlow *= glowLevel * (0.82 + stableEdge * 0.04 + intensityMotion * 0.04);
    totalGlow = clamp(totalGlow, 0.0, 1.0);

    vec3 baseColor = u_color;
    vec3 coreColor = clamp(baseColor * (1.04 + stableEdge * 0.06), 0.0, 1.0);
    vec3 bloomColor = clamp(baseColor * (0.72 + u_glowIntensity * 0.14), 0.0, 1.0);
    vec3 glowColor = mix(bloomColor, coreColor, clamp(rayField * 1.15, 0.0, 1.0));
    gl_FragColor = vec4(glowColor * totalGlow, totalGlow);
  }
`;

export const EdgeRaysShaderLayer: React.FC<EdgeRaysShaderLayerProps> = ({
  width,
  height,
  frame,
  fps,
  glowIntensity,
  edgeEnergy,
  motionEnergy,
  opacity = 1,
  color,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [glAvailable, setGlAvailable] = useState(true);
  const programInfoRef = useRef<{
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    uniformLocations: Record<string, WebGLUniformLocation | null>;
  } | null>(null);

  const rgbColor = useMemo(() => hexToRgb(color), [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setGlAvailable(false);
      return;
    }

    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    programInfoRef.current = {
      gl,
      program,
      uniformLocations: {
        u_resolution: gl.getUniformLocation(program, "u_resolution"),
        u_time: gl.getUniformLocation(program, "u_time"),
        u_glowIntensity: gl.getUniformLocation(program, "u_glowIntensity"),
        u_edgeEnergy: gl.getUniformLocation(program, "u_edgeEnergy"),
        u_motionEnergy: gl.getUniformLocation(program, "u_motionEnergy"),
        u_color: gl.getUniformLocation(program, "u_color"),
      },
    };

    return () => {
      gl.deleteProgram(program);
    };
  }, []);

  useEffect(() => {
    if (!programInfoRef.current) return;
    const { gl, program, uniformLocations } = programInfoRef.current;

    const time = frame / Math.max(1, fps);

    gl.useProgram(program);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(uniformLocations.u_resolution, width, height);
    gl.uniform1f(uniformLocations.u_time, time);
    gl.uniform1f(uniformLocations.u_glowIntensity, glowIntensity);
    gl.uniform1f(uniformLocations.u_edgeEnergy, edgeEnergy);
    gl.uniform1f(uniformLocations.u_motionEnergy, motionEnergy);
    gl.uniform3fv(uniformLocations.u_color, rgbColor);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [width, height, frame, fps, glowIntensity, edgeEnergy, motionEnergy, opacity, rgbColor]);

  if (!glAvailable) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        ...style,
      }}
    />
  );
};
