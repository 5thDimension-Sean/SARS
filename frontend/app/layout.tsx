import type { Metadata } from "next";
import "./globals.css";
import "./radar-tokens.css";
import localFont from "next/font/local";
import { SiteNav } from "@/components/site-nav";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs-boot";

// Geist: a precise geometric grotesk, self-hosted (no third-party font requests).
const geist = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist", weight: "100 900", display: "swap" });
const geistMono = localFont({ src: "./fonts/GeistMono-Variable.woff2", variable: "--font-geist-mono", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: "Dancing with SARs",
  description: "Explore Earth surface change through SAR sample data.",
  other: {
    "codex-preview": "development",
    "development-assistance": "AI-assisted interface design and code. Published radar measurements preserved.",
  },
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon.svg`,
    shortcut: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" data-motion="full" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} /></head>
      <body className="antialiased"><SiteNav />{children}</body>
    </html>
  );
}
