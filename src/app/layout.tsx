import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
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

// Applies a saved theme before first paint — without this, the page would flash the default
// theme and then jump to the saved one once React hydrates.
const NO_FLASH_SCRIPT = `
try {
  var t = localStorage.getItem("theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <nav className="flex items-center justify-between gap-6 border-b border-accent/20 px-6 py-3 text-sm font-medium text-foreground-muted">
          <div className="flex gap-6">
            <Link href="/dashboard" className="hover:text-accent">
              Dashboard
            </Link>
            <Link href="/workshop" className="hover:text-accent">
              Workshop
            </Link>
            <Link href="/analytics" className="hover:text-accent">
              Analytics
            </Link>
            <Link href="/profile" className="hover:text-accent">
              Profile
            </Link>
          </div>
          <ThemeSwitcher />
        </nav>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
