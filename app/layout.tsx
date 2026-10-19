import type { Metadata, Viewport } from "next";
import { productName } from "@/lib/env";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000"),
  applicationName: productName,
  title: { default: productName, template: `%s · ${productName}` },
  description: "Your company's applications, together in one secure workspace.",
  openGraph: {
    type: "website",
    siteName: productName,
    title: productName,
    description:
      "One account. Every possibility. Secure access to all your team's apps.",
  },
  twitter: {
    card: "summary_large_image",
    title: productName,
    description:
      "One account. Every possibility. Secure access to all your team's apps.",
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#084bff" };
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
