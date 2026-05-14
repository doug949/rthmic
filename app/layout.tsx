import type { Metadata, Viewport } from "next";
import { Raleway, DM_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/app/components/ServiceWorkerRegistration";
import SplashScreen from "@/app/components/SplashScreen";
import { AudioProvider } from "@/app/contexts/AudioContext";
import { GenerationProvider } from "@/app/contexts/GenerationContext";
import MiniPlayer from "@/app/components/MiniPlayer";
import FullScreenPlayer from "@/app/components/FullScreenPlayer";
import GenerationBanner from "@/app/components/GenerationBanner";
import PageFooter from "@/app/components/PageFooter";
import { AmbientBackground } from "@/app/components/AmbientBackground";
import { PageTransitionLayer } from "@/app/components/PageTransitionLayer";

// Display font — wordmark, headings. Geometric, elegant, premium sans.
const raleway = Raleway({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
});

// UI font — labels, buttons, body copy. Clean and precise.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "RTHMIC",
  description: "Stream RTHM audio tracks",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RTHMIC",
  },
  icons: {
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1628",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${raleway.variable} ${dmSans.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#0d1628]">
        <AmbientBackground />
        <PageTransitionLayer />
        <ServiceWorkerRegistration />
        <SplashScreen />
        <GenerationProvider>
          <AudioProvider>
            <GenerationBanner />
            {children}
            <MiniPlayer />
            <FullScreenPlayer />
            <PageFooter />
          </AudioProvider>
        </GenerationProvider>
      </body>
    </html>
  );
}
