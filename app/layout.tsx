import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Casa Home Design",
  description: "Object-first AI interior redesign.",
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
