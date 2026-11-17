/** @type {import('next').NextConfig} */
const rawBase = process.env.BASE_PATH ?? "/";
const basePath = rawBase.replace(/\/+$/, "");

const devDomain = process.env.REPLIT_DEV_DOMAIN;

const nextConfig = {
  basePath: basePath === "" ? undefined : basePath,
  reactStrictMode: true,
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
