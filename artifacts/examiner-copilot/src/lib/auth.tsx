"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { useQueryClient } from "@tanstack/react-query";

export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
export const SIGN_IN_PATH = `${basePath}/sign-in`;
export const SIGN_UP_PATH = `${basePath}/sign-up`;

/** Development preview only: no sign-in needed; the API acts as the workspace owner. */
export const PREVIEW_AUTO_SIGNIN = process.env.NEXT_PUBLIC_PREVIEW_AUTO_SIGNIN === "true";

const clerkProxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL || undefined;

function clerkPubKey() {
  // Next prerenders client components without a request hostname. Only the
  // browser can resolve domain-specific keys; never pass an empty host to Clerk.
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  }
  return publishableKeyFromHost(
    window.location.hostname,
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

// Next's router adds the base path itself; Clerk hands us full paths.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

/** Clears cached API data when the signed-in person changes. */
function ClearCacheOnUserChange() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (prev.current !== undefined && prev.current !== id) qc.clear();
    prev.current = id;
  }), [addListener, qc]);
  return null;
}

const appearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: typeof window === "undefined" ? undefined : `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
  },
  variables: {
    colorPrimary: "hsl(30 10% 10%)",
    colorForeground: "hsl(30 10% 11%)",
    colorMutedForeground: "hsl(30 6% 36%)",
    colorDanger: "hsl(2 62% 42%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(30 10% 11%)",
    colorNeutral: "hsl(30 10% 11%)",
    fontFamily: "var(--app-font-sans), Inter, system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
    cardBox: { background: "hsl(0 0% 100%)", border: "1px solid hsl(34 10% 83%)", borderRadius: "0.75rem", width: "400px", maxWidth: "100%", overflow: "hidden", boxShadow: "none" },
    card: { boxShadow: "none", border: 0, background: "transparent", borderRadius: 0 },
    footer: { boxShadow: "none", border: 0, background: "hsl(36 14% 96%)", borderRadius: 0 },
    headerTitle: { color: "hsl(30 10% 11%)", fontSize: "1.125rem", fontWeight: 600 },
    headerSubtitle: { color: "hsl(30 6% 36%)" },
    socialButtonsBlockButton: { border: "1px solid hsl(34 10% 83%)", background: "hsl(0 0% 100%)" },
    socialButtonsBlockButtonText: { color: "hsl(30 10% 11%)", fontWeight: 500 },
    dividerLine: { background: "hsl(34 10% 83%)" },
    dividerText: { color: "hsl(30 6% 36%)" },
    formFieldLabel: { color: "hsl(30 10% 11%)", fontWeight: 500 },
    formFieldInput: { border: "1px solid hsl(34 10% 83%)", color: "hsl(30 10% 11%)" },
    formButtonPrimary: { background: "hsl(30 10% 10%)", color: "hsl(36 20% 97%)", boxShadow: "none" },
    footerAction: { justifyContent: "center" },
    footerActionText: { color: "hsl(30 6% 36%)" },
    footerActionLink: { color: "hsl(30 10% 11%)", fontWeight: 600, textDecoration: "underline" },
    identityPreviewEditButton: { color: "hsl(30 10% 11%)" },
    formFieldSuccessText: { color: "hsl(150 45% 28%)" },
    alert: { border: "1px solid hsl(34 10% 83%)" },
    alertText: { color: "hsl(30 10% 11%)" },
    otpCodeFieldInput: { border: "1px solid hsl(34 10% 83%)", color: "hsl(30 10% 11%)" },
    logoBox: { height: "2.25rem" },
    logoImage: { height: "2.25rem", width: "2.25rem" },
    formFieldRow: {},
    main: {},
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey()}
      proxyUrl={clerkProxyUrl}
      appearance={appearance}
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl={basePath || "/"}
      signUpFallbackRedirectUrl={basePath || "/"}
      afterSignOutUrl={basePath || "/"}
      localization={{
        signIn: { start: { title: "Sign in to Examiner Co-Pilot", subtitle: "Use your work email or Google account" } },
        signUp: { start: { title: "Create your account", subtitle: "A senior examiner assigns your role after you join" } },
      }}
      routerPush={(to) => router.push(stripBase(to))}
      routerReplace={(to) => router.replace(stripBase(to))}
    >
      <ClearCacheOnUserChange />
      {children}
    </ClerkProvider>
  );
}
