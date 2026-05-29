"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { usePillarTheme } from "@/app/contexts/PillarThemeContext";
import type { SavedRhythm } from "@/app/types/library";
import { MenusIcon } from "@/app/components/HomeTileIcons";
import { MENU_CONFIGS, MENU_GROUPS } from "@/app/lib/menuConfigs";

const TEAL = {
  text:   "rgba(120,210,180,0.92)",
  dim:    "rgba(100,195,165,0.65)",
  bg:     "rgba(100,195,165,0.06)",
  border: "rgba(100,195,165,0.22)",
  hover:  "rgba(100,195,165,0.12)",
};

type MenuSlots = Record<string, SavedRhythm[]>;

export default function StructurePage() {
  const router = useRouter();
  const { genPhase } = useGeneration();
  const { setActivePillar } = usePillarTheme();
  const [menus, setMenus] = useState<MenuSlots>({});
  const [loading, setLoading] = useState(true);
  const prevGenPhase = useRef<string>("idle");

  const fetchMenus = async () => {
    const entries = await Promise.all(
      MENU_CONFIGS.map(async (tm) => {
        try {
          const res = await fetch(`/api/menu?slug=${tm.slug}`);
          if (!res.ok) return [tm.slug, []] as [string, SavedRhythm[]];
          const data = await res.json() as { songs: SavedRhythm[] };
          return [tm.slug, data.songs ?? []] as [string, SavedRhythm[]];
        } catch {
          return [tm.slug, []] as [string, SavedRhythm[]];
        }
      })
    );
    setMenus(Object.fromEntries(entries));
    setLoading(false);
  };

  useEffect(() => { fetchMenus(); }, []);

  useEffect(() => {
    setActivePillar("menus");
    return () => setActivePillar(null);
  }, [setActivePillar]);

  useEffect(() => {
    if (prevGenPhase.current === "generating" && genPhase === "ready") {
      fetchMenus();
    }
    prevGenPhase.current = genPhase;
  }, [genPhase]);

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title="Menus" titleIcon={<MenusIcon />} />

      <section className="flex-1 flex flex-col pb-10">
        <RevealBlock delay={0}>
          <div className="flex flex-col gap-1 pb-6">
            <div className="flex items-center gap-2.5 mb-1">
              <span style={{ color: TEAL.dim }}><StructureIcon /></span>
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>
                RTHMIC Menus
              </p>
            </div>
            <p className="text-xl font-light text-white/70 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
              Loops of options, not lists to finish.
            </p>
            <p className="text-sm text-white/38 leading-relaxed max-w-xl mt-2">
              Pick the context you are in, play the menu on loop, and let useful things bubble up while you move.
              Stop when enough feels done.
            </p>
          </div>
        </RevealBlock>

        <div className="flex flex-col gap-7">
          {MENU_GROUPS.map((group, groupIndex) => {
            const groupMenus = MENU_CONFIGS.filter((menu) => menu.group === group.id);

            return (
              <RevealBlock key={group.id} delay={groupIndex * 80}>
                <div className="flex flex-col gap-3">
                  <div className="px-1">
                    <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>
                      {group.label}
                    </p>
                    <p className="text-xs text-white/35 mt-1 leading-relaxed">{group.intro}</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {groupMenus.map((tm) => {
                      const songs = menus[tm.slug] ?? [];
                      const hasSongs = songs.length > 0;
                      const firstSong = songs[0];

                      return (
                        <div
                          key={tm.slug}
                          className="w-full rounded-2xl border"
                          style={{ background: TEAL.bg, borderColor: TEAL.border }}
                        >
                          <button
                            onClick={() => router.push(`/structure/${tm.slug}`)}
                            className="w-full flex items-center gap-4 px-6 py-5 text-left touch-manipulation active:scale-[0.98] transition-all"
                          >
                            <span className="flex-shrink-0" style={{ color: TEAL.dim }}><StructureIcon /></span>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-semibold tracking-wide" style={{ color: TEAL.text }}>{tm.label}</p>
                              <p className="text-xs text-white/45 mt-0.5 leading-snug">
                                {hasSongs ? `${songs.length} version${songs.length === 1 ? "" : "s"} · ${firstSong.title}` : tm.description}
                              </p>
                            </div>
                            <span className="text-lg flex-shrink-0" style={{ color: TEAL.border }}>
                              {hasSongs ? "›" : "+"}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </RevealBlock>
            );
          })}
        </div>

        {loading && (
          <p className="text-center text-white/20 text-xs mt-8 tracking-widest uppercase">Loading menus…</p>
        )}
      </section>
    </main>
  );
}

function StructureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 16 A7 7 0 0 1 19 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="12" y1="4.5" x2="12" y2="5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16.8" y1="6" x2="15.9" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7.2" y1="6" x2="8.1" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
