import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HYFIT Games Judge App",
  description: "Official field judging app for HYFIT Games.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/branding/hyfit-games-logo.png",
    shortcut: "/branding/hyfit-games-logo.png",
    apple: "/branding/hyfit-games-logo.png",
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
