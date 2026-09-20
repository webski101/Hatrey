import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-harbor-display",
  subsets: ["latin"],
});

const sans = Figtree({
  variable: "--font-harbor-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harbor — IXS RWA desk for agent treasuries",
  description:
    "Mandate-gated allocator for licensed IXS RWA vaults. SERV decides. Settlement-aware. Built for OpenServ Hackathon Edition 01.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
