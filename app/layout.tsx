import type { Metadata } from "next";
import "tldraw/tldraw.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Casa Home Design",
  description: "Canvas-based AI home design exploration.",
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
