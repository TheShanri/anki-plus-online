import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { ActivityMount } from "@/components/study/ActivityMount";
import { BugReporter } from "@/components/bugs/BugReporter";
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
          <BugReporter />
        </ThemeProvider>
      </body>
    </html>
  );
}
