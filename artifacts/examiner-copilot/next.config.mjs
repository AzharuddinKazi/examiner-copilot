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
    // Development preview only: the API acts as the workspace owner without a Clerk session.
    NEXT_PUBLIC_PREVIEW_AUTO_SIGNIN: process.env.NODE_ENV === "development" && process.env.PREVIEW_AUTO_SIGNIN !== "false" ? "true" : "",
    // Clerk sign-in. The proxy URL is empty in development and set automatically when published.
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_CLERK_PROXY_URL: process.env.VITE_CLERK_PROXY_URL ?? process.env.CLERK_PROXY_URL ?? "",
  },
};

export default nextConfig;
