/** @type {import('next').NextConfig} */
const rawBase = process.env.BASE_PATH ?? "/";
const basePath = rawBase.replace(/\/+$/, "");

const devDomain = process.env.REPLIT_DEV_DOMAIN;

const nextConfig = {
  basePath: basePath === "" ? undefined : basePath,
  // Local verification builds set NEXT_DIST_DIR so they do not overwrite the dev server's .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ["@workspace/api-client-react"],
  // The Replit preview is served through a proxied iframe on another origin.
  allowedDevOrigins: [
    ...(devDomain ? [devDomain] : []),
    "*.replit.dev",
    "*.repl.co",
    "*.replit.app",
  ],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
