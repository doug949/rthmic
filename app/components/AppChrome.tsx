"use client";

import { usePathname } from "next/navigation";
import IntroSequence from "@/app/components/IntroSequence";
import MiniPlayer from "@/app/components/MiniPlayer";
import FullScreenPlayer from "@/app/components/FullScreenPlayer";
import GenerationBanner from "@/app/components/GenerationBanner";
import PageFooter from "@/app/components/PageFooter";
import QuickCodexNote from "@/app/components/QuickCodexNote";
import OfflineAudioKeeper from "@/app/components/OfflineAudioKeeper";

function isStandalonePublicRoute(pathname: string | null) {
  return pathname?.startsWith("/r/") ?? false;
}

export default function AppChrome() {
  const pathname = usePathname();
  if (isStandalonePublicRoute(pathname)) return null;

  return (
    <>
      <IntroSequence />
      <GenerationBanner />
      <MiniPlayer />
      <FullScreenPlayer />
      <OfflineAudioKeeper />
      <QuickCodexNote />
      <PageFooter />
    </>
  );
}
