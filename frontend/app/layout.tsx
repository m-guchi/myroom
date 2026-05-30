import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "MyRoom",
  description: "お部屋の環境データをモニタリング",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "MyRoom",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2ecc71",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${notoSansJP.className} min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="mx-auto min-h-screen max-w-[480px] bg-background">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
