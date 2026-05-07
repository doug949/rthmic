"use client";

import { useState, useEffect } from "react";

/**
 * Mounts invisible, then after `delay` ms fades up into view.
 * Shared across all pages for consistent reveal animation.
 */
export function RevealBlock({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 380ms ease, transform 380ms ease",
      }}
    >
      {children}
    </div>
  );
}
