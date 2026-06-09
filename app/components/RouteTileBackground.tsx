"use client";

import { useEffect, useState } from "react";

const TILE_BACKGROUNDS: Record<string, { image: string; position?: string }> = {
  create: { image: "/images/tiles/optimized/create.webp", position: "50% 48%" },
  "in-the-moment": { image: "/images/tiles/optimized/in-the-moment.webp" },
  "my-rthms": { image: "/images/tiles/optimized/my-rthms.webp" },
  bridge: { image: "/images/tiles/optimized/bridge.webp" },
  invite: { image: "/images/tiles/optimized/invite.webp" },
  rthmix: { image: "/images/tiles/optimized/rthmix.webp" },
  structure: { image: "/images/tiles/optimized/structure.webp" },
  adhd: { image: "/images/tiles/optimized/adhd.webp" },
  settings: { image: "/images/tiles/optimized/settings.webp" },
  about: { image: "/images/tiles/optimized/about.webp" },
  studio: { image: "/images/tiles/optimized/feedback.webp" },
};

function tileForRoute(pathname: string | null, search: URLSearchParams): string | null {
  if (!pathname || pathname === "/" || pathname === "/login" || pathname.startsWith("/r/")) return null;

  if (pathname === "/speak") {
    if (search.get("quick") === "1") return "in-the-moment";
    const collection = search.get("collection");
    if (collection === "adhd") return "adhd";
    const pillar = search.get("pillar");
    if (pillar === "bridge" || pillar === "invite") return pillar;
    return null;
  }

  if (pathname === "/bridge") return "bridge";
  if (pathname === "/invite") return "invite";
  if (pathname === "/rthmix") return "rthmix";
  if (pathname === "/structure" || pathname.startsWith("/structure/")) return "structure";
  if (pathname === "/settings") return "settings";
  if (pathname === "/understand") return "about";
  if (pathname === "/studio") return "studio";
  if (pathname === "/reddit-adhd") return "adhd";
  if (pathname === "/library" || pathname.startsWith("/library/")) return "my-rthms";

  return null;
}

export default function RouteTileBackground() {
  const [route, setRoute] = useState<{ pathname: string | null; search: URLSearchParams }>(() => ({
    pathname: typeof window === "undefined" ? null : window.location.pathname,
    search: typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search),
  }));

  useEffect(() => {
    let current = "";
    const updateRoute = () => {
      const next = `${window.location.pathname}${window.location.search}`;
      if (next === current) return;
      current = next;
      setRoute({
        pathname: window.location.pathname,
        search: new URLSearchParams(window.location.search),
      });
    };

    updateRoute();
    const interval = window.setInterval(updateRoute, 350);
    window.addEventListener("popstate", updateRoute);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("popstate", updateRoute);
    };
  }, []);

  const tile = tileForRoute(route.pathname, route.search);
  const background = tile ? TILE_BACKGROUNDS[tile] : null;

  if (!background) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden select-none" aria-hidden style={{ zIndex: 0 }}>
      <img
        key={background.image}
        src={background.image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: background.position ?? "50% 34%",
          opacity: 0.28,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(5,8,16,0.64) 0%, rgba(5,8,16,0.82) 42%, rgba(5,8,16,0.96) 100%)",
        }}
      />
    </div>
  );
}
