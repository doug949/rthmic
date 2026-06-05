import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/app/components/ServiceWorkerRegistration";
import RouteTileBackground from "@/app/components/RouteTileBackground";
import { AudioProvider } from "@/app/contexts/AudioContext";
import { GenerationProvider } from "@/app/contexts/GenerationContext";
import AppChrome from "@/app/components/AppChrome";
import { AmbientBackground } from "@/app/components/AmbientBackground";
import { PageTransitionLayer } from "@/app/components/PageTransitionLayer";
import { PillarThemeProvider } from "@/app/contexts/PillarThemeContext";
import RoutePersistence from "@/app/components/RoutePersistence";
import { RuntimeDiagnosticsBoundary, RuntimeDiagnosticsListeners } from "@/app/components/RuntimeDiagnostics";

// Fonts are defined with system fallbacks in globals.css so cloud builds do not depend on fetching Google Fonts.
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
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#0a0a0a]">
        <PillarThemeProvider>
          <AmbientBackground />
          <RouteTileBackground />
          <PageTransitionLayer />
          <RuntimeDiagnosticsListeners />
          <RoutePersistence />
          <ServiceWorkerRegistration />
          <RuntimeDiagnosticsBoundary>
            <GenerationProvider>
              <AudioProvider>
                {children}
                <AppChrome />
              </AudioProvider>
            </GenerationProvider>
          </RuntimeDiagnosticsBoundary>
        </PillarThemeProvider>
      </body>
    </html>
  );
}
