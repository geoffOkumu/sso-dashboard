import type { Metadata } from "next";
import { productName } from "@/lib/env";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: productName, template: `%s · ${productName}` },
  description: "Your company's applications, together in one secure workspace.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
