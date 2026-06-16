import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketing Analytics — Bolt Farm Treehouse",
  description: "Marketing & traffic analytics for Bolt Farm Treehouse",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Ovo&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
