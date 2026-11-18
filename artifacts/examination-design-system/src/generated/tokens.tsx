/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "primary": "#92722A",
      "secondary": "#ECE8DE",
      "accent": "#F0E6C8",
      "background": "#F7F6F2",
      "foreground": "#182236",
      "card": "#FFFFFF",
      "cardForeground": "#182236",
      "popover": "#FFFFFF",
      "popoverForeground": "#182236",
      "primaryForeground": "#FFFFFF",
      "secondaryForeground": "#353D4D",
      "muted": "#EEEFEE",
      "mutedForeground": "#586376",
      "accentForeground": "#624A15",
      "destructive": "#B42332",
      "destructiveForeground": "#FFFFFF",
      "border": "#D9DCE1",
      "input": "#AAB1BC",
      "ring": "#92722A",
      "chart1": "#92722A",
      "chart2": "#B42332",
      "chart3": "#AC4D0D",
      "chart4": "#235AA6",
      "chart5": "#087D5B",
      "sidebar": "#F0EFEA",
      "sidebarForeground": "#182236",
      "sidebarBorder": "#D9DCE1",
      "sidebarPrimary": "#92722A",
      "sidebarPrimaryForeground": "#FFFFFF",
      "sidebarAccent": "#E9DFC3",
      "sidebarAccentForeground": "#624A15",
      "sidebarRing": "#92722A"
    },
    "dark": {
      "primary": "#CBA344",
      "secondary": "#192437",
      "accent": "#292719",
      "background": "#050D1A",
      "foreground": "#EEF2F8",
      "card": "#141C2A",
      "cardForeground": "#EEF2F8",
      "popover": "#0F1F38",
      "popoverForeground": "#EEF2F8",
      "primaryForeground": "#1A1206",
      "secondaryForeground": "#B3BED0",
      "muted": "#111C2D",
      "mutedForeground": "#A3AEC2",
      "accentForeground": "#E6D7A2",
      "destructive": "#F87171",
      "destructiveForeground": "#1A1206",
      "border": "#303744",
      "input": "#526075",
      "ring": "#CBA344",
      "chart1": "#CBA344",
      "chart2": "#F87171",
      "chart3": "#FB923C",
      "chart4": "#60A5FA",
      "chart5": "#34D399",
      "sidebar": "#0A1628",
      "sidebarForeground": "#EEF2F8",
      "sidebarBorder": "#303744",
      "sidebarPrimary": "#CBA344",
      "sidebarPrimaryForeground": "#1A1206",
      "sidebarAccent": "#292719",
      "sidebarAccentForeground": "#E6D7A2",
      "sidebarRing": "#CBA344"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "JetBrains Mono",
      "monospace"
    ]
  },
  "radius": "0.875rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
