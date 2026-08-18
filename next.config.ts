import type { NextConfig } from "next";

function resolveBasePath(): string {
  if (process.env.NEXT_PUBLIC_BASE_PATH != null) {
    return process.env.NEXT_PUBLIC_BASE_PATH;
  }
  const repo = process.env.GITHUB_REPOSITORY;
  if (process.env.GITHUB_ACTIONS && repo) {
    const name = repo.split("/")[1] || "";
    if (name && !name.endsWith(".github.io")) {
      return `/${name}`;
    }
  }
  return "";
}

const basePath = resolveBasePath();

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: ["foliate-js"],
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
