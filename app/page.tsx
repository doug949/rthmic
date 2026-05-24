"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TransitionLink } from "@/app/components/TransitionLink";
import { AUDIO_CACHE, keepAllOfflineEnabled, setKeepAllOffline } from "@/app/lib/offlineAudio";

const SCREEN_FADE_MS = 1800;
const TILE_ENTER_MS = 1600;
const TILE_ROW_DELAY_MS = 260;
const HOME_TILE_ORDER_KEY = "rthmic_home_tile_order_v2";
const INTRO_SEEN_KEY = "rthmic_intro_v4";

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  return "Good Evening";
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

export default function Home() {
  const router = useRouter();
  const [userCode, setUserCode] = useState("");
  const [userName, setUserName] = useState("");
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clearingAudio, setClearingAudio] = useState(false);
  const [confirmClearAudio, setConfirmClearAudio] = useState(false);
  const [keepOffline, setKeepOffline] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [queueCleared, setQueueCleared] = useState<number | null>(null);
  const [buildCopied, setBuildCopied] = useState(false);
  const [serverBuild, setServerBuild] = useState("");
  const [screenReady, setScreenReady] = useState(false);
  const [tilesReady, setTilesReady] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [tileIntroDone, setTileIntroDone] = useState(false);
  const [tileOrder, setTileOrder] = useState<string[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingTile, setDraggingTile] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    if (match) setUserCode(decodeURIComponent(match[1]));
    setKeepOffline(keepAllOfflineEnabled());
    try {
      const raw = localStorage.getItem(HOME_TILE_ORDER_KEY);
      setTileOrder(raw ? JSON.parse(raw) : HOME_TILES.map((tile) => tile.id));
    } catch {
      setTileOrder(HOME_TILES.map((tile) => tile.id));
    }
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d.name) setUserName(d.name); })
      .catch(() => {});
    fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { build?: string }) => { if (d.build) setServerBuild(d.build); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(INTRO_SEEN_KEY)) {
      setIntroComplete(true);
      return;
    }
    const onIntroComplete = () => setIntroComplete(true);
    window.addEventListener("rthmic:intro-complete", onIntroComplete);
    return () => window.removeEventListener("rthmic:intro-complete", onIntroComplete);
  }, []);

  // Keep the menu hidden until its images are decoded, then let the page fade in
  // before the tile rows begin their wave.
  useEffect(() => {
    if (!introComplete) return;
    let cancelled = false;
    let tileTimer: ReturnType<typeof setTimeout>;
    const imageUrls = HOME_TILES.flatMap((tile) => tile.image ? [tile.image] : []);

    Promise.all(imageUrls.map(preloadImage)).then(() => {
      if (cancelled) return;
      setScreenReady(true);
      tileTimer = setTimeout(() => {
        if (!cancelled) setTilesReady(true);
      }, SCREEN_FADE_MS);
    });

    return () => {
      cancelled = true;
      clearTimeout(tileTimer);
    };
  }, [introComplete]);

  useEffect(() => {
    if (!tilesReady) return;
    const rows = Math.ceil(HOME_TILES.length / 2);
    const timer = setTimeout(() => setTileIntroDone(true), TILE_ENTER_MS + rows * TILE_ROW_DELAY_MS + 120);
    return () => clearTimeout(timer);
  }, [tilesReady]);

  const handleClearQueue = async () => {
    setClearingQueue(true);
    try {
      const res = await fetch("/api/clear-queue", { method: "POST" });
      const data = res.ok ? await res.json() : { cleared: 0 };
      setQueueCleared(data.cleared ?? 0);
      setTimeout(() => setQueueCleared(null), 3000);
    } catch {
      setQueueCleared(0);
      setTimeout(() => setQueueCleared(null), 3000);
    } finally {
      setClearingQueue(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== AUDIO_CACHE).map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  };

  const handleClearOfflineAudio = async () => {
    if (!confirmClearAudio) {
      setConfirmClearAudio(true);
      setTimeout(() => setConfirmClearAudio(false), 3500);
      return;
    }
    setClearingAudio(true);
    try {
      if ("caches" in window) await caches.delete(AUDIO_CACHE);
      setConfirmClearAudio(false);
    } finally {
      setClearingAudio(false);
    }
  };

  const handleToggleKeepOffline = () => {
    const next = !keepOffline;
    setKeepOffline(next);
    setKeepAllOffline(next);
  };

  const persistTileOrder = (next: string[]) => {
    setTileOrder(next);
    try { localStorage.setItem(HOME_TILE_ORDER_KEY, JSON.stringify(next)); } catch {}
  };

  const reorderTile = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const base = tileOrder.length > 0 ? tileOrder : HOME_TILES.map((tile) => tile.id);
    const ids = [...base];
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    persistTileOrder(ids);
  };

  const beginTilePress = (tileId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      setReorderMode(true);
      setDraggingTile(tileId);
    }, 420);
  };

  const endTilePress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    setDraggingTile(null);
    setTimeout(() => { suppressClickRef.current = false; }, 80);
  };

  const moveTilePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!reorderMode || !draggingTile) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-tile-id]") as HTMLElement | null;
    const targetId = target?.dataset.tileId;
    if (targetId) reorderTile(draggingTile, targetId);
  };

  const resetHomeTiles = () => {
    persistTileOrder(HOME_TILES.map((tile) => tile.id));
    setReorderMode(false);
  };

  const buildId = serverBuild || process.env.NEXT_PUBLIC_RTHMIC_BUILD || "unknown";
  const buildLabel = `RTHMIC beta · ${buildId}`;

  const copyBuildLabel = async () => {
    try {
      await navigator.clipboard.writeText(buildLabel);
      setBuildCopied(true);
      setTimeout(() => setBuildCopied(false), 1800);
    } catch {
      setBuildCopied(false);
    }
  };

  const order = tileOrder.length > 0 ? tileOrder : HOME_TILES.map((tile) => tile.id);
  const visibleTiles = HOME_TILES
    .filter((tile) => !tile.adminOnly || userCode === "doug2026")
    .sort((a, b) => {
      const fallbackA = HOME_TILES.findIndex((tile) => tile.id === a.id);
      const fallbackB = HOME_TILES.findIndex((tile) => tile.id === b.id);
      const orderA = order.includes(a.id) ? order.indexOf(a.id) : fallbackA;
      const orderB = order.includes(b.id) ? order.indexOf(b.id) : fallbackB;
      return orderA - orderB;
    });

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{
        opacity: screenReady ? undefined : 0,
        animation: screenReady ? `page-enter ${SCREEN_FADE_MS}ms cubic-bezier(0.16,1,0.3,1) both` : undefined,
      }}
    >
      {/* Wordmark + hamburger */}
      <header className="relative pt-6 pb-3">
        <h1 className="text-3xl tracking-[0.18em] uppercase" style={{ fontFamily: "var(--font-display)", fontWeight: 300, color: "#c9a55a" }}>
          RTHMIC
        </h1>
        <p className="text-xs mt-1.5 tracking-widest uppercase" style={{ color: "#c9a55a", opacity: 0.6 }}>
          music to live by
        </p>
        {(userName || userCode) && (
          <p className="text-xs mt-2 font-light" style={{ color: "rgba(255,255,255,0.85)", letterSpacing: "0.02em" }}>
            {greeting()}{userName ? `, ${userName}` : ""}
          </p>
        )}

        {/* Hamburger — top right of header */}
        <button
          onClick={() => setOpen(true)}
          className="absolute top-10 right-0 touch-manipulation flex flex-col items-center justify-center"
          style={{ width: 32, height: 32, gap: 4, opacity: 0.35 }}
          aria-label="Menu"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: "block",
                width: i === 1 ? 12 : 16,
                height: 1.5,
                borderRadius: 1,
                background: "rgba(255,255,255,0.8)",
              }}
            />
          ))}
        </button>
      </header>

      <section className="flex-1 flex flex-col pb-6 mt-1">
        {reorderMode && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border px-3 py-2" style={{ background: "rgba(10,16,32,0.72)", borderColor: "rgba(201,165,90,0.22)" }}>
            <p className="flex-1 text-[11px] text-white/45">Drag tiles to rearrange.</p>
            <button onClick={() => setReorderMode(false)} className="text-[10px] uppercase tracking-widest text-[#c9a55a] touch-manipulation">
              Done
            </button>
          </div>
        )}
        {/* ── tile grid — rows glide in one after another ── */}
        <div className="grid grid-cols-2 gap-1.5 pb-4">
          {visibleTiles.map((tile, i) => {
            const row = Math.floor(i / 2);
            const rowDelay = row * TILE_ROW_DELAY_MS;
            return (
              <div
                key={tile.label}
                data-tile-id={tile.id}
                onPointerDown={(event) => {
                  if (reorderMode) event.preventDefault();
                  beginTilePress(tile.id);
                }}
                onPointerMove={moveTilePointer}
                onPointerUp={endTilePress}
                onPointerCancel={endTilePress}
                onDragStart={(event) => event.preventDefault()}
                className="select-none"
                onClickCapture={(event) => {
                  if (reorderMode || suppressClickRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                style={{
                  opacity: tilesReady ? undefined : 0,
                  touchAction: reorderMode ? "none" : "manipulation",
                  userSelect: "none",
                  animation: tilesReady && !tileIntroDone && !reorderMode ? `tile-enter ${TILE_ENTER_MS}ms cubic-bezier(0.16,1,0.3,1) ${rowDelay}ms both` : undefined,
                  transform: draggingTile === tile.id ? "scale(0.97)" : undefined,
                }}
              >
                <HomeTile tile={tile} reorderMode={reorderMode} />
              </div>
            );
          })}
        </div>

        <p className="text-center text-[9px] tracking-wide mt-4 pb-2" style={{ color: "rgba(255,255,255,0.18)" }}>
          © 4Ward Vision Video Ltd
        </p>
      </section>

      {/* Bottom sheet */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed left-0 right-0 z-50 rounded-t-2xl flex flex-col"
            style={{
              bottom: 0,
              height: "75vh",
              maxHeight: "75vh",
              background: "#0f1a2e",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <p className="text-[10px] text-white/25 uppercase tracking-widest mb-0.5">Signed in as</p>
              <p className="text-sm text-white/60 font-medium tracking-wide">{userCode}</p>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col px-4 pt-3 gap-2">
              <button
                onClick={() => { setOpen(false); router.push("/codex-notes"); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left"
              >
                <span className="text-white/35 text-lg leading-none">✎</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">Codex Notes</p>
                  <p className="text-xs text-white/30 mt-0.5">Review quick notes captured in the app</p>
                </div>
              </button>
              <button
                onClick={() => { setOpen(false); router.push("/diagnostics"); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left"
              >
                <span className="text-white/35 text-lg leading-none">⌁</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">Diagnostics</p>
                  <p className="text-xs text-white/30 mt-0.5">Inspect reloads, routes, cache, and service worker state</p>
                </div>
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
              >
                <span className="text-white/35 text-lg leading-none">↺</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">Refresh App Cache</p>
                  <p className="text-xs text-white/30 mt-0.5">Updates app files, keeps permissions and offline audio</p>
                </div>
              </button>
              <button
                onClick={handleToggleKeepOffline}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left"
              >
                <span
                  className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors"
                  style={{ background: keepOffline ? "rgba(201,165,90,0.35)" : "rgba(255,255,255,0.10)" }}
                >
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                    style={{
                      left: 4,
                      transform: keepOffline ? "translateX(16px)" : "translateX(0)",
                      background: keepOffline ? "rgba(201,165,90,0.95)" : "rgba(255,255,255,0.48)",
                    }}
                  />
                </span>
                <div>
                  <p className="text-sm text-white/70 font-medium">Keep All Rthms Offline</p>
                  <p className="text-xs text-white/30 mt-0.5">Automatically saves new playable Rthms on this device</p>
                </div>
              </button>
              <button
                onClick={handleClearOfflineAudio}
                disabled={clearingAudio}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
              >
                <span className="text-white/35 text-lg leading-none">↓</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">
                    {clearingAudio ? "Clearing…" : confirmClearAudio ? "Tap again to clear offline audio" : "Clear Offline Audio"}
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    {confirmClearAudio ? "This removes saved tracks from this device" : "Requires confirmation before removing device audio"}
                  </p>
                </div>
              </button>
              <button
                onClick={handleClearQueue}
                disabled={clearingQueue}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
              >
                <span className="text-white/35 text-lg leading-none">⊘</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">
                    {clearingQueue ? "Clearing…" : queueCleared !== null ? `Cleared ${queueCleared} job${queueCleared === 1 ? "" : "s"}` : "Clear Generation Queue"}
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">Remove any stuck or pending Rthms</p>
                </div>
              </button>
              <button
                onClick={resetHomeTiles}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left"
              >
                <span className="text-white/35 text-lg leading-none">⌂</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">Reset Home Screen</p>
                  <p className="text-xs text-white/30 mt-0.5">Restore the default tile order</p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left"
              >
                <span className="text-white/25 text-lg leading-none">→</span>
                <div>
                  <p className="text-sm text-white/50 font-medium">Log out</p>
                  <p className="text-xs text-white/20 mt-0.5">Return to login screen</p>
                </div>
              </button>
            </div>
            <div className="px-4 pt-2">
              <button
                onClick={copyBuildLabel}
                className="w-full py-2 rounded-xl text-[10px] uppercase tracking-widest touch-manipulation active:bg-white/[0.03] transition-colors"
                style={{ color: buildCopied ? "rgba(201,165,90,0.78)" : "rgba(255,255,255,0.22)" }}
              >
                {buildCopied ? "Build copied" : buildLabel}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full py-4 rounded-xl text-sm text-white/30 tracking-wide touch-manipulation active:bg-white/[0.03] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

// ─── Home tile grid ───────────────────────────────────────────────────────────

const HOME_TILES: {
  id: string;
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  accent: string;       // rgba for gradient tint when no image
  image?: string;
  imageScale?: number;  // scale > 1 crops in to hide white borders
  comingSoon?: boolean;
  adminOnly?: boolean;
  adminPreview?: boolean;
}[] = [
  { id: "create", href: "/speak",     label: "Create a Rthm",        shortLabel: "Create",     icon: <MicIcon />,     accent: "rgba(201,165,90,0.55)", image: "/images/tiles/optimized/create.webp" },
  { id: "right-now", href: "/speak?quick=1", label: "In The Moment", shortLabel: "In The Moment", icon: <SituationIcon />, accent: "rgba(120,200,210,0.55)", image: "/images/tiles/optimized/in-the-moment.webp" },
  { id: "my-rthms", href: "/library/my-rthms", label: "My Rthms",      shortLabel: "My Rthms",   icon: <PlayIcon />,    accent: "rgba(100,140,255,0.5)", image: "/images/tiles/optimized/my-rthms.webp" },
  { id: "bridge", href: "/bridge", label: "Rthmic Bridge", shortLabel: "Bridge", icon: <BridgeTileIcon />, accent: "rgba(180,160,140,0.55)", image: "/images/tiles/optimized/bridge.webp" },
  { id: "invite", href: "/invite", label: "Rthmic Invite", shortLabel: "Invite", icon: <InviteTileIcon />, accent: "rgba(218,185,120,0.55)", image: "/images/tiles/optimized/invite.webp", adminOnly: true },
  { id: "rthmix", href: "/rthmix",    label: "Rthmix",                shortLabel: "Rthmix",     icon: <CassetteIcon />, accent: "rgba(230,155,60,0.5)", image: "/images/tiles/optimized/rthmix.webp" },
  { id: "structure", href: "/structure", label: "Menus",                 shortLabel: "Menus",      icon: <MenusIcon />,   accent: "rgba(100,195,165,0.5)", image: "/images/tiles/optimized/structure.webp", imageScale: 1.12 },
  { id: "adhd", href: "/speak",     label: "ADHD Collection",       shortLabel: "ADHD Collection",       icon: <BrainIcon />,   accent: "rgba(220,110,140,0.5)", image: "/images/tiles/optimized/adhd.webp" },
  { id: "settings", href: "/settings",  label: "Settings and Styles",   shortLabel: "Settings + Styles", icon: <EQIcon />, accent: "rgba(160,130,220,0.5)", image: "/images/tiles/optimized/settings.webp", imageScale: 1.12 },
  { id: "about", href: "/understand",label: "About RTHMIC",          shortLabel: "About",      icon: <InfoIcon />,    accent: "rgba(255,255,255,0.15)", image: "/images/tiles/optimized/about.webp" },
  { id: "studio", href: "/studio",    label: "Developer",            shortLabel: "Developer",  icon: <LockIcon />,    accent: "rgba(109,40,217,0.55)", image: "/images/tiles/optimized/feedback.webp", adminOnly: true },
];

function SituationIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 9.5v2.7l1.8 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HomeTile({ tile, reorderMode }: { tile: typeof HOME_TILES[number]; reorderMode?: boolean; delay?: number }) {
  const inner = (
    <div
      className="relative rounded-xl overflow-hidden touch-manipulation select-none"
      style={{ aspectRatio: "5/4", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {tile.image ? (
        <img
          src={tile.image}
          alt={tile.label}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            ...(tile.imageScale ? { transform: `scale(${tile.imageScale})` } : {}),
            ...(tile.comingSoon ? { filter: "brightness(0.3)" } : {}),
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 60% 30%, ${tile.accent} 0%, transparent 70%)` }} />
      )}
      {/* Bottom gradient */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)" }} />

      {/* Coming soon badge */}
      {tile.comingSoon && (
        <div className="absolute top-2 right-2">
          <span className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: "rgba(230,155,60,0.18)", color: "rgba(230,155,60,0.75)", border: "1px solid rgba(230,155,60,0.25)" }}>
            Soon
          </span>
        </div>
      )}

      {/* Icon + label */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 pb-2.5 px-1 pointer-events-none">
        <span className="text-white/60" style={{ transform: "scale(0.72)", transformOrigin: "center" }}>{tile.icon}</span>
        <p className="text-[10px] font-semibold text-white/90 leading-tight tracking-wide text-center">{tile.shortLabel}</p>
      </div>
    </div>
  );

  if ((tile.comingSoon && !tile.adminPreview) || reorderMode) return <div>{inner}</div>;
  return <TransitionLink href={tile.href} className="active:opacity-70 transition-opacity block">{inner}</TransitionLink>;
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 10V7.5A3.5 3.5 0 0 1 12 4v0a3.5 3.5 0 0 1 3.5 3.5V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 14v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BridgeTileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M4 15c2.2-4 4.9-6 8-6s5.8 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 15v-3M12 15V9M17 15v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 16h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 7.8c1.4-1.6 3-2.4 5-2.4s3.6.8 5 2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

function InviteTileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5 8.5h14v9H5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5.5 9l6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4.5v2.2M8.6 5.6 7.4 4M15.4 5.6 16.6 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function ModeCard({
  href,
  label,
  description,
  icon,
  primary,
  blue,
  amber,
  teal,
  purple,
  rose,
  subtle,
  comingSoon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
  blue?: boolean;
  amber?: boolean;
  teal?: boolean;
  purple?: boolean;
  rose?: boolean;
  subtle?: boolean;
  comingSoon?: boolean;
}) {
  const iconColor  = primary ? "#c9a55a" : blue ? "rgba(120,160,255,0.75)" : amber ? "rgba(230,155,60,0.85)" : teal ? "rgba(100,195,165,0.85)" : purple ? "rgba(160,130,220,0.85)" : rose ? "rgba(220,110,140,0.85)" : subtle ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.45)";
  const labelColor = primary ? "#c9a55a" : blue ? "rgba(140,175,255,0.92)" : amber ? "rgba(240,170,80,0.95)" : teal ? "rgba(120,210,180,0.92)" : purple ? "rgba(180,150,240,0.92)" : rose ? "rgba(235,130,155,0.92)" : subtle ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.9)";
  const arrowColor = primary ? "rgba(201,165,90,0.4)" : blue ? "rgba(120,160,255,0.35)" : amber ? "rgba(230,155,60,0.35)" : teal ? "rgba(100,195,165,0.35)" : purple ? "rgba(160,130,220,0.35)" : rose ? "rgba(220,110,140,0.35)" : subtle ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.2)";

  const cardStyle =
    primary ? { background: "rgba(201,165,90,0.08)", borderColor: "rgba(201,165,90,0.35)" }
    : blue   ? { background: "rgba(100,140,255,0.06)", borderColor: "rgba(120,160,255,0.28)" }
    : amber  ? { background: "rgba(230,155,60,0.06)", borderColor: "rgba(230,155,60,0.28)" }
    : teal   ? { background: "rgba(100,195,165,0.06)", borderColor: "rgba(100,195,165,0.28)" }
    : purple ? { background: "rgba(160,130,220,0.06)", borderColor: "rgba(160,130,220,0.28)" }
    : rose   ? { background: "rgba(220,110,140,0.06)", borderColor: "rgba(220,110,140,0.28)" }
    : {};

  const cardClass = `
    flex items-center gap-4 px-5 rounded-2xl border
    ${primary ? "py-3.5" : "py-3"}
    ${primary || blue || amber || teal || purple || rose ? "" : "bg-white/[0.03] border-white/[0.08]"}
    ${comingSoon ? "opacity-60 cursor-default" : "transition-all duration-150 active:scale-[0.98] touch-manipulation"}
  `;

  const inner = (
    <>
      <span className="flex-shrink-0" style={{ color: iconColor }} aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium tracking-wide" style={{ color: labelColor }}>
            {label}
          </p>
          {comingSoon && (
            <span
              className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: "rgba(230,155,60,0.12)", color: "rgba(230,155,60,0.6)", border: "1px solid rgba(230,155,60,0.2)" }}
            >
              Soon
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 leading-snug text-white/45">{description}</p>
      </div>
      {!comingSoon && <span className="flex-shrink-0 text-lg" style={{ color: arrowColor }}>›</span>}
    </>
  );

  if (comingSoon) {
    return <div className={cardClass} style={cardStyle}>{inner}</div>;
  }

  return (
    <TransitionLink href={href} className={cardClass} style={cardStyle}>
      {inner}
    </TransitionLink>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="8.5" y1="22" x2="15.5" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 4.5L20 12L6 19.5V4.5Z" fill="currentColor" />
    </svg>
  );
}

function CassetteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {/* Outer shell */}
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      {/* Reels */}
      <circle cx="8.5" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="15.5" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8.5" cy="13" r="0.8" fill="currentColor" />
      <circle cx="15.5" cy="13" r="0.8" fill="currentColor" />
      {/* Tape window cutout */}
      <path d="M6 13 Q8.5 10.5 11 13" stroke="currentColor" strokeWidth="1" opacity="0.5" fill="none" />
      <path d="M13 13 Q15.5 10.5 18 13" stroke="currentColor" strokeWidth="1" opacity="0.5" fill="none" />
      {/* Label area */}
      <rect x="5" y="6.5" width="14" height="4" rx="0.5" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M9.5 3C7.6 3 6 4.6 6 6.5c0 .4.07.8.2 1.15C4.9 8.1 4 9.2 4 10.5c0 1 .5 1.9 1.3 2.5C5.1 13.3 5 13.65 5 14c0 1.7 1.3 3.1 3 3.25V20h8v-2.75C17.7 17.1 19 15.7 19 14c0-.35-.1-.7-.3-1C19.5 12.4 20 11.5 20 10.5c0-1.3-.9-2.4-2.2-2.85.13-.35.2-.75.2-1.15C18 4.6 16.4 3 14.5 3c-.8 0-1.55.28-2.13.75A2.98 2.98 0 0 0 12 3.5c-.35 0-.68.06-1 .17A3.47 3.47 0 0 0 9.5 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="12" y1="6" x2="12" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="9" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="12" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

function EQIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="14" width="3" height="7" rx="1.5" fill="currentColor" />
      <rect x="3" y="11" width="3" height="2" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="10.5" y="9" width="3" height="12" rx="1.5" fill="currentColor" />
      <rect x="10.5" y="6" width="3" height="2" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="18" y="5" width="3" height="16" rx="1.5" fill="currentColor" />
      <rect x="18" y="2" width="3" height="2" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function MenusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="4" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="4" y1="18" x2="12" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
