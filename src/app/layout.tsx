import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "jobschlob",
  description: "Job compatibility dashboard, application tracking, and resume workshop",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">
        <nav className="flex gap-6 border-b border-ink-soft/20 px-6 py-3 text-sm font-medium text-ink-soft">
          <Link href="/dashboard" className="hover:text-green">
            Dashboard
          </Link>
          <Link href="/workshop" className="hover:text-green">
            Workshop
          </Link>
          <Link href="/analytics" className="hover:text-green">
            Analytics
          </Link>
          <Link href="/profile" className="hover:text-green">
            Profile
          </Link>
        </nav>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
