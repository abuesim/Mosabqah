import type { Metadata, Viewport } from "next";
import { Tajawal, Orbitron, Alkalami } from "next/font/google";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800", "900"],
  display: "swap",
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  display: "swap",
});

const alkalami = Alkalami({
  variable: "--font-alkalami",
  subsets: ["arabic", "latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "مُسَابَقَة عَصُومِي",
  description:
    "المنصة التفاعلية المتكاملة لإدارة التحديات والمسابقات العائلية بالوقت الفعلي — مدعومة بـ Next.js و Supabase.",
};

export const viewport: Viewport = {
  themeColor: "#070314",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} ${orbitron.variable} ${alkalami.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-void text-ink">
        {children}
      </body>
    </html>
  );
}
