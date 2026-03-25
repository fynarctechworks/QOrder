import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Q Order — QR Code Restaurant Ordering System | Scan. Order. Done.",
  description:
    "Transform your restaurant with contactless QR ordering. Live orders, kitchen display, smart inventory, staff management, analytics, and thermal printing. Zero commission. No app download.",
  keywords:
    "QR code ordering, restaurant ordering system, contactless dining, digital menu, table ordering app, restaurant SaaS, QR menu India, kitchen display system",
  openGraph: {
    title: "Q Order — QR Code Restaurant Ordering System",
    description:
      "Zero commission QR ordering for restaurants. Real-time dashboard, KDS, smart inventory, and more.",
    type: "website",
    siteName: "Q Order",
  },
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
