"use client";

import { useEffect, useRef, useState } from "react";

export default function SplashScreen() {
  const [videoOpacity, setVideoOpacity] = useState(0);
  const [wrapperOpacity, setWrapperOpacity] = useState(1);
  const [gone, setGone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Fade video in from black on mount
    const fadeIn = setTimeout(() => setVideoOpacity(1), 50);

    const video = videoRef.current;
    if (!video) return;

    const handleEnd = () => {
      // Fade wrapper to black over 0.5s, then unmount
      setWrapperOpacity(0);
      setTimeout(() => setGone(true), 500);
    };

    const handleError = () => {
      setWrapperOpacity(0);
      setTimeout(() => setGone(true), 500);
    };

    video.addEventListener("ended", handleEnd);
    video.addEventListener("error", handleError);

    video.play().catch(() => {
      setWrapperOpacity(0);
      setTimeout(() => setGone(true), 500);
    });

    return () => {
      clearTimeout(fadeIn);
      video.removeEventListener("ended", handleEnd);
      video.removeEventListener("error", handleError);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      style={{
        opacity: wrapperOpacity,
        transition: wrapperOpacity === 0 ? "opacity 0.5s ease-in-out" : "none",
      }}
    >
      <video
        ref={videoRef}
        src="/splash.mp4"
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: videoOpacity,
          transition: "opacity 0.5s ease-in-out",
        }}
      />
    </div>
  );
}
