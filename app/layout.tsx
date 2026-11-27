import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "KeuanganKu",
  description: "Catat keuangan pribadi dan bersama, tersinkron ke Google Sheets.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "KeuanganKu", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0b6e6e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="font-sans antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
