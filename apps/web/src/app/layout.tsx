import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Follac AI — Your meetings, handled",
  description:
    "Follac joins your meetings, transcribes who said what, extracts decisions and action items, and emails you the report. Follow → Understand → Act.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
