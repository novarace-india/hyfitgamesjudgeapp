import type { Metadata } from "next";
import "./globals.css";
import "./operations.css";
import "./brand.css";

export const metadata: Metadata = {
  title: "HYFIT Games Judge App",
  description: "Official field judging app for HYFIT Games.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/branding/hyfit-games-2026-dark.svg",
    shortcut: "/branding/hyfit-games-2026-dark.svg",
    apple: "/branding/hyfit-games-2026-dark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
