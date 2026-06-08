"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUDIO_CACHE, keepAllOfflineEnabled, setKeepAllOffline } from "@/app/lib/offlineAudio";
import { LAST_ROUTE_KEY, RELOAD_REASON_KEY, currentClientRoute, recordDiagnosticEvent, safeSetSessionItem } from "@/app/lib/clientDiagnostics";

interface AppMenuProps {
  open: boolean;
  onClose: () => void;
}

export function AppMenu({ open, onClose }: AppMenuProps) {
  const router = useRouter();
  const [userCode, setUserCode] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keepOffline, setKeepOffline] = useState(false);
  const [clearingAudio, setClearingAudio] = useState(false);
  const [confirmClearAudio, setConfirmClearAudio] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [queueCleared, setQueueCleared] = useState<number | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    if (match) setUserCode(decodeURIComponent(match[1]));
    setKeepOffline(keepAllOfflineEnabled());
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setIsAdmin(!!data.access?.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [open]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    safeSetSessionItem(RELOAD_REASON_KEY, "user-clicked-refresh");
    safeSetSessionItem(LAST_ROUTE_KEY, currentClientRoute());
    recordDiagnosticEvent("manual-refresh-clicked");
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

  const handleToggleKeepOffline = () => {
    const next = !keepOffline;
    setKeepOffline(next);
    setKeepAllOffline(next);
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
    onClose();
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div
        className="fixed left-0 right-0 z-50 rounded-t-2xl flex flex-col"
        style={{
          bottom: 0,
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 12px)",
          background: "#0f1a2e",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          overflow: "hidden",
        }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/15" /></div>
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <p className="text-[10px] text-white/25 uppercase tracking-widest mb-0.5">Signed in as</p>
          <p className="text-sm text-white/60 font-medium tracking-wide">{userCode || "RTHMIC"}</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-4 pt-3 gap-2" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          {isAdmin && (
            <>
              <MenuRow icon="✎" title="Codex Notes" detail="Review quick notes captured in the app" onClick={() => go("/codex-notes")} />
              <MenuRow icon="⌁" title="Diagnostics" detail="Inspect reloads, routes, cache, and service worker state" onClick={() => go("/diagnostics")} />
            </>
          )}
          <MenuRow icon="↺" title={refreshing ? "Refreshing…" : "Refresh App Cache"} detail="Updates app files, keeps permissions and offline audio" onClick={handleRefresh} disabled={refreshing} />
          <button onClick={handleToggleKeepOffline} className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left">
            <span className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors" style={{ background: keepOffline ? "rgba(201,165,90,0.35)" : "rgba(255,255,255,0.10)" }}>
              <span className="absolute top-1 w-4 h-4 rounded-full transition-transform" style={{ left: 4, transform: keepOffline ? "translateX(16px)" : "translateX(0)", background: keepOffline ? "rgba(201,165,90,0.95)" : "rgba(255,255,255,0.48)" }} />
            </span>
            <span><span className="block text-sm text-white/70 font-medium">Keep All Rthms Offline</span><span className="block text-xs text-white/30 mt-0.5">Automatically saves new playable Rthms on this device</span></span>
          </button>
          <MenuRow icon="↓" title={clearingAudio ? "Clearing…" : confirmClearAudio ? "Tap again to clear offline audio" : "Clear Offline Audio"} detail={confirmClearAudio ? "This removes saved tracks from this device" : "Requires confirmation before removing device audio"} onClick={handleClearOfflineAudio} disabled={clearingAudio} />
          <MenuRow icon="⊘" title={clearingQueue ? "Clearing…" : queueCleared !== null ? `Cleared ${queueCleared} job${queueCleared === 1 ? "" : "s"}` : "Clear Generation Queue"} detail="Remove any stuck or pending Rthms" onClick={handleClearQueue} disabled={clearingQueue} />
          <div className="mt-auto pt-3 border-t border-white/[0.06]">
            <MenuRow icon="⎋" title="Log Out" detail="Return to access screen" onClick={handleLogout} danger />
          </div>
        </div>
      </div>
    </>
  );
}

function MenuRow({ icon, title, detail, onClick, disabled, danger }: {
  icon: string;
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
    >
      <span className="text-white/35 text-lg leading-none">{icon}</span>
      <span>
        <span className="block text-sm font-medium" style={{ color: danger ? "rgba(248,113,113,0.72)" : "rgba(255,255,255,0.7)" }}>{title}</span>
        <span className="block text-xs text-white/30 mt-0.5">{detail}</span>
      </span>
    </button>
  );
}
