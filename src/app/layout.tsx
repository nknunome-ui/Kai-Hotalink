import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

// 丸みのあるやわらかい書体で、親しみやすさを出す
const maru = Zen_Maru_Gothic({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-maru",
});

export const metadata: Metadata = {
  title: "Hotalink",
  description: "有料老人ホームの入居判定を支援するツール",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fff8f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${maru.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
