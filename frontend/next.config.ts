import type { NextConfig } from "next";
import path from "path";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoBasePath = "/insight-myroom";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGithubPages ? repoBasePath : undefined,
  assetPrefix: isGithubPages ? `${repoBasePath}/` : undefined,
  images: { unoptimized: true },
  turbopack: {
    root: path.join(__dirname),
  },
  env: {
    NEXT_PUBLIC_APP_PASSWORD: process.env.NEXT_PUBLIC_APP_PASSWORD,
  },
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/api/:path*",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
