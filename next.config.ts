import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function createNextConfig(phase: string): NextConfig {
  const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

  return {
    reactStrictMode: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    ...(isCapacitorBuild
      ? {
          output: "export" as const,
          trailingSlash: true,
          images: {
            unoptimized: true,
          },
        }
      : {}),
  };
}
