"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const SHOW_ON = ["/"];

export default function PageFooter() {
  const pathname = usePathname();
  const router = useRouter();
  const [userCode, setUserCode] = useState("");
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    if (match) setUserCode(decodeURIComponent(match[1]));
  }, []);

  if (!SHOW_ON.includes(pathname)) return null;
  if (!userCode) return null;

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
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  };

  return (
    <>
      {/* Tiny hamburger — bottom-right, never covers buttons */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 touch-manipulation"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
          right: 14,
          width: 32,
          height: 32,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          opacity: 0.35,
        }}
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

      {/* Bottom sheet */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed left-0 right-0 z-50 rounded-t-2xl flex flex-col"
            style={{
              bottom: 0,
              background: "#0f1a2e",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* User code */}
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <p className="text-[10px] text-white/25 uppercase tracking-widest mb-0.5">Signed in as</p>
              <p className="text-sm text-white/60 font-medium tracking-wide">{userCode}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-col px-4 pt-3 gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl touch-manipulation active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
              >
                <span className="text-white/35 text-lg leading-none">↺</span>
                <div>
                  <p className="text-sm text-white/70 font-medium">Refresh App Cache</p>
                  <p className="text-xs text-white/30 mt-0.5">Clears cached data and reloads</p>
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

            {/* Cancel */}
            <div className="px-4 pt-2">
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
    </>
  );
}
