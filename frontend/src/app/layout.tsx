import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TailorCV — Resume Studio",
  description:
    "Thoughtfully tailor your resume to your next opportunity. Preserve your facts, review every change, and export a clean resume.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
