import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Heartbeat from "@/components/Heartbeat";

export const metadata: Metadata = {
  title: "Scaler IE — Interview Questions",
  description: "Real interview questions from real Scaler learners.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-text font-sans antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-acad/10 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full bg-dsml/10 blur-[120px]" />
        </div>
        <Header />
        <Heartbeat />
        <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
