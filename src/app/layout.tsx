import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "ANKI PLUS Online",
  description: "Type-the-answer anatomy flashcards with FSRS scheduling.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="synthwave">
      <body>
        <div className="bg-scene" aria-hidden>
          <div className="bg-sky" />
          <div className="bg-stars" />
        </div>
        <NavBar />
        <main className="mx-auto w-full max-w-5xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
