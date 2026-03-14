import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@estudio/audio-core", "@estudio/utils"],
};

export default nextConfig;
