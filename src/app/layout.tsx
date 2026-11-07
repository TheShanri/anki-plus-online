import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { ActivityMount } from "@/components/study/ActivityMount";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { Backdrop } from "@/components/theme/Backdrop";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { fontVars } from "@/lib/theme/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme/prefs";
import { loadUiPrefs } from "@/lib/theme/server";

export const metadata: Metadata = {
  title: "ANKI PLUS Online",
  description: "Type-the-answer anatomy flashcards with FSRS scheduling.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { prefs, signedIn } = await loadUiPrefs();
  return (
    <html
      lang="en"
      className={fontVars}
      data-theme={prefs.theme}
      data-effects={prefs.effects}
      data-mode={prefs.mode}
      data-server={signedIn ? "1" : "0"}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider initial={prefs} signedIn={signedIn}>
          <Backdrop />
          <NavBar />
          <ActivityMount />
          <main className="page">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-12 pt-4 text-center text-xs text-text-faint">
            <Link href="/about" className="underline-offset-2 hover:underline">About, credits and privacy</Link>
          </footer>
          <FeedbackWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
