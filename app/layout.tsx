import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HYFIT Games Judge App",
  description: "Official field judging app for HYFIT Games.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/hyfit-games-icon.png",
    shortcut: "/hyfit-games-icon.png",
    apple: "/hyfit-games-icon.png",
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
