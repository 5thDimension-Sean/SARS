import type { Metadata } from "next";
import "./globals.css";
import { assetPath } from "@/lib/site-path";

export const metadata: Metadata = {
  title: "SAR-Waltz",
  description: "Explore Earth surface change through SAR sample data.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: assetPath("favicon.svg"),
    shortcut: assetPath("favicon.svg"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
