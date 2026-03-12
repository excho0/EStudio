"use client";

import React, { useEffect, useRef, useMemo, useState } from "react";

type EdgeRaysShaderLayerProps = {
  width: number;
  height: number;
  frame: number;
  fps: number;
  glowIntensity: number;
  edgeEnergy: number; // לא בשימוש ישיר ב-Shader כרגע, אך הושאר לתאימות
  motionEnergy: number;
  opacity?: number;
  color: string;
  style?: React.CSSProperties;
};

// פונקציית עזר להמרת HEX ל-RGB מנורמל (0.0 עד 1.0) עבור ה-Shader
const hexToRgb = (hex: string) => {
  const cleanHex = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) return [1.0, 1.0, 1.0];
  const r = Number.parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(cleanHex.slice(4, 6), 16) / 255;
  return [r, g, b];
};

// קוד ה-Vertex Shader (בסיסי מאוד - רק מותח את הקנבס)
const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// קוד ה-Fragment Shader (כאן קורה הקסם במקום ה-CSS)
const fragmentShaderSource = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_glowIntensity;
  uniform float u_edgeEnergy;
  uniform float u_motionEnergy;
  uniform float u_opacity;
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

  float lightningBand(float along, float inward, float time, float seed, float motion) {
    float stableMotion = smoothstep(0.12, 0.4, motion);
    float travel = along * 5.2 - time * (0.24 + stableMotion * 0.32) + seed;
    float n1 = noise(vec2(travel, inward * 0.028 + seed * 0.18));
    float n2 = noise(vec2(travel * 0.96 + 2.6, inward * 0.013 + seed * 0.1));
    float n3 = noise(vec2(travel * 0.58 - 1.0, inward * 0.007 + seed * 0.06));
    float combined = n1 * 0.68 + n2 * 0.2 + n3 * 0.12;
    float streak = smoothstep(0.8, 0.955, combined);
    float falloff = exp(-inward / (34.0 + stableMotion * 8.0));
    return streak * falloff;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    float stableEdge = smoothstep(0.08, 0.3, u_edgeEnergy);
    float stableMotion = smoothstep(0.1, 0.3, u_motionEnergy);

    float pulseAmount = 0.005 + stableMotion * 0.008;
    float pTop = 1.0 + sin(u_time * 0.72) * pulseAmount;
    float pBot = 1.0 + sin(u_time * 0.67 + 1.1) * pulseAmount;
    float pLeft = 1.0 + sin(u_time * 0.61 + 0.6) * pulseAmount;
    float pRight = 1.0 + sin(u_time * 0.58 + 1.7) * pulseAmount;

    float dTop = u_resolution.y - gl_FragCoord.y;
    float dBot = gl_FragCoord.y;
    float dLeft = gl_FragCoord.x;
    float dRight = u_resolution.x - gl_FragCoord.x;

    float spread = 88.0 + (u_glowIntensity * 96.0);
    float raySpread = 42.0 + u_glowIntensity * 18.0;

    float baseTop = exp(-dTop / spread) * pTop;
    float baseBot = exp(-dBot / spread) * pBot;
    float baseLeft = exp(-dLeft / spread) * pLeft;
    float baseRight = exp(-dRight / spread) * pRight;

    float rayStrength = 0.14 + stableEdge * 0.22;
    float topRay = lightningBand(uv.x, dTop, u_time, 0.7, stableMotion) * rayStrength;
    float botRay = lightningBand(uv.x, dBot, u_time, 2.1, stableMotion) * rayStrength;
    float leftRay = lightningBand(uv.y, dLeft, u_time, 3.4, stableMotion) * rayStrength;
    float rightRay = lightningBand(uv.y, dRight, u_time, 5.0, stableMotion) * rayStrength;

    topRay *= exp(-dTop / raySpread);
    botRay *= exp(-dBot / raySpread);
    leftRay *= exp(-dLeft / raySpread);
    rightRay *= exp(-dRight / raySpread);

    float rayField = max(max(topRay, botRay), max(leftRay, rightRay));
    float baseField = max(max(baseTop, baseBot), max(baseLeft, baseRight));

    float totalGlow = (baseField * 0.82 + rayField * (0.92 + u_glowIntensity * 0.22)) * 0.7;
    totalGlow *= u_glowIntensity * (0.94 + stableEdge * 0.06);
    totalGlow = clamp(totalGlow, 0.0, 1.0);

    vec3 baseColor = u_color;
    vec3 coreColor = clamp(baseColor * (1.04 + stableEdge * 0.06), 0.0, 1.0);
    vec3 bloomColor = clamp(baseColor * (0.72 + u_glowIntensity * 0.14), 0.0, 1.0);
    vec3 glowColor = mix(bloomColor, coreColor, clamp(rayField * 1.15, 0.0, 1.0));
    gl_FragColor = vec4(glowColor * totalGlow, totalGlow * u_opacity);
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

  // איתחול ה-WebGL וה-Shaders בפעם הראשונה
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
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

    // הגדרת משולש שמכסה את כל הקנבס
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

    // שמירת ה-Uniforms לשימוש בפריימים הבאים
    programInfoRef.current = {
      gl,
      program,
      uniformLocations: {
        u_resolution: gl.getUniformLocation(program, "u_resolution"),
        u_time: gl.getUniformLocation(program, "u_time"),
        u_glowIntensity: gl.getUniformLocation(program, "u_glowIntensity"),
        u_edgeEnergy: gl.getUniformLocation(program, "u_edgeEnergy"),
        u_motionEnergy: gl.getUniformLocation(program, "u_motionEnergy"),
        u_opacity: gl.getUniformLocation(program, "u_opacity"),
        u_color: gl.getUniformLocation(program, "u_color"),
      },
    };

    return () => {
      gl.deleteProgram(program);
    };
  }, []);

  // עדכון ה-Uniforms בכל פריים (ללא יצירה מחדש של ה-Context)
  useEffect(() => {
    if (!programInfoRef.current) return;
    const { gl, uniformLocations } = programInfoRef.current;

    const time = frame / Math.max(1, fps);

    // Keep frame deterministic for headless Remotion capture.
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // העברת הנתונים ל-Shader
    gl.uniform2f(uniformLocations.u_resolution, width, height);
    gl.uniform1f(uniformLocations.u_time, time);
    gl.uniform1f(uniformLocations.u_glowIntensity, glowIntensity);
    gl.uniform1f(uniformLocations.u_edgeEnergy, edgeEnergy);
    gl.uniform1f(uniformLocations.u_motionEnergy, motionEnergy);
    gl.uniform1f(uniformLocations.u_opacity, opacity);
    gl.uniform3fv(uniformLocations.u_color, rgbColor);

    // ציור
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
        ...style,
      }}
    />
  );
};