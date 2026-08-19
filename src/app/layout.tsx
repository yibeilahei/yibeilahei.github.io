import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lazahata — Books to XTCH",
  description: "Convert EPUB, TXT, MOBI, and FB2 books to XTCH in the browser for Xteink / CrossPoint e-readers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
