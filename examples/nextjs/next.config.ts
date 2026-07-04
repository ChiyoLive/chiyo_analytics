import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["cyanly_sdk"],
  turbopack: {
    root: path.join(__dirname, "../../"),
  },
};

export default nextConfig;
