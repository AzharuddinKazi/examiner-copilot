import type { Metadata } from "next";
import { Inter, Source_Serif_4, IBM_Plex_Mono, Noto_Naskh_Arabic } from "next/font/google";
import { Providers } from "./providers";
import { AppShell } from "@/components/shell/app-shell";
import "../index.css";

const inter = Inter({ subsets: ["latin"], variable: "--app-font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--app-font-serif", display: "swap", style: ["normal", "italic"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--app-font-mono", display: "swap" });
const arabic = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "600"], variable: "--app-font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Examiner Co-Pilot", template: "%s · Examiner Co-Pilot" },
  description:
    "Supervisory workbench comparing credit-card disclosures against an examiner-supplied rulebook. Agents propose; examiners decide.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${serif.variable} ${mono.variable} ${arabic.variable}`}
    >
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
