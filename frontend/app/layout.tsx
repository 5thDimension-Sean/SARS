import type { Metadata } from "next";
import "./globals.css";
import "./radar-tokens.css";

export const metadata: Metadata = {
  title: "SAR-Waltz",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
