"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { LockIcon } from "@/app/components/HomeTileIcons";

const STUDIO_CODE = "doug2026";

export default function StudioPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [walkUrl, setWalkUrl] = useState("");
  const [walkContext, setWalkContext] = useState("");
  const [walkBusy, setWalkBusy] = useState(false);
  const [walkError, setWalkError] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkContext, setLinkContext] = useState("");
  const [photoContext, setPhotoContext] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    const code = match ? decodeURIComponent(match[1]) : "";
    if (code === STUDIO_CODE) setAllowed(true);
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <RevealBlock delay={0}>
          <AppHeader title="Developer" titleIcon={<LockIcon />} />
        </RevealBlock>
        <section className="flex-1 flex flex-col items-center justify-center text-center pb-28">
          <p className="text-sm text-white/45">Studio is private for now.</p>
          <button onClick={() => router.push("/")} className="mt-5 text-xs uppercase tracking-widest text-white/35">Return Home</button>
        </section>
      </main>
    );
  }

  const startWalkingTour = async () => {
    const url = walkUrl.trim();
    if (!url || walkBusy) return;
    setWalkBusy(true);
    setWalkError("");

    try {
      const res = await fetch("/api/walking-tour-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, context: walkContext.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not read Google Maps link");
      const seed = typeof data.seed === "string" ? data.seed : "";
      if (!seed) throw new Error("Could not read Google Maps link");
      router.push(`/speak?pillar=explain&experiment=walking-tour&autoText=1&seed=${encodeURIComponent(seed)}`);
    } catch (err) {
      setWalkError(err instanceof Error ? err.message : "Could not read Google Maps link");
      setWalkBusy(false);
    }
  };

  const startSpokenWalkingTour = () => {
    const seed = [
      "Developer experiment: Walking Tour from spoken input.",
      "The user will describe where they are walking through to learn about the place.",
      "Create a Rthm that works as an audio walking-tour companion, paced for someone walking, looking around, and making sense of the place.",
      "Use the user's spoken details honestly: the place, route, mood, stops, atmosphere, what to notice, what to question, and what to remember.",
      "Do not invent landmarks, history, businesses, or facts that were not provided.",
    ].join(" ");
    router.push(`/speak?pillar=explain&experiment=walking-tour&seed=${encodeURIComponent(seed)}`);
  };

  const startLinkRthm = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const context = linkContext.trim();
    const seed = [
      "Developer experiment: Paste a link and make a Rthm about it.",
      `Link: ${url}`,
      context ? `User context: ${context}` : "User context: Make this useful before acting on the link.",
      "If this is a real estate listing, make the Rthm useful before a viewing: what to notice, what to question, what the listing implies, what tradeoffs to remember, and how to stay clear-eyed.",
      "If it is another kind of page, make the Rthm a practical pre-listen that helps the user absorb, remember, and act on the linked material.",
      "Do not pretend to have read page details that are not in the prompt. Use the URL and user context honestly.",
    ].join(" ");
    router.push(`/speak?pillar=explain&experiment=link-song&autoText=1&seed=${encodeURIComponent(seed)}`);
  };

  const startPhotoRthm = async (file: File | null) => {
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoName(file.name || "Photo");

    try {
      const image = await resizePhotoForPrompt(file);
      const form = new FormData();
      form.append("image", image, "photo.jpg");
      const context = photoContext.trim();
      if (context) form.append("context", context);

      const res = await fetch("/api/photo-rthm", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not interpret photo");

      const seed = typeof data.seed === "string" ? data.seed : "";
      if (!seed) throw new Error("Could not interpret photo");
      router.push(`/speak?pillar=explain&experiment=photo-song&autoText=1&seed=${encodeURIComponent(seed)}`);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not interpret photo");
      setPhotoBusy(false);
    }
  };

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Developer" titleIcon={<LockIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-28">
        <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(109,40,217,0.08)", borderColor: "rgba(139,92,246,0.28)" }}>
          <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: "rgb(167,139,250)" }}>Private export workspace</p>
          <h1 className="text-2xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Make Rthms intended to leave the app.
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mt-3">
            A place for export-ready pieces, client demos, use-case tracks, and versions that need cleaner naming, notes, or download workflows.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <p className="px-1 text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(167,139,250,0.72)" }}>Experimental categories</p>
          <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(139,92,246,0.08)", borderColor: "rgba(139,92,246,0.24)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
                ⌖
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white/82">Walking Tour</p>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.34)" }}>Experiment</span>
                </div>
                <p className="text-xs text-white/43 leading-relaxed mt-1">
                  Paste a Google Maps place, route, or dropped-pin link, or speak where you are walking.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={walkUrl}
                    onChange={(event) => setWalkUrl(event.target.value)}
                    placeholder="Paste Google Maps link"
                    className="w-full rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    inputMode="url"
                    disabled={walkBusy}
                  />
                  <textarea
                    value={walkContext}
                    onChange={(event) => setWalkContext(event.target.value)}
                    placeholder="Optional context: property viewing, gallery route, neighbourhood walk, what to notice..."
                    className="min-h-20 w-full resize-none rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    disabled={walkBusy}
                  />
                  <button
                    onClick={startWalkingTour}
                    disabled={!walkUrl.trim() || walkBusy}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.32)", color: "rgb(190,170,250)" }}
                  >
                    {walkBusy ? "Reading map..." : "Create walking tour"}
                  </button>
                  <button
                    onClick={startSpokenWalkingTour}
                    disabled={walkBusy}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.58)" }}
                  >
                    Speak walking tour
                  </button>
                  {walkError && <p className="text-xs text-red-300/70 leading-relaxed">{walkError}</p>}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
                ↗
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white/78">Paste Link to Rthm</p>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>Experiment</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mt-1">
                  Turn a link into a useful pre-listen. Good first test: a property listing before a viewing.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="Paste listing, article, venue, or video URL"
                    className="w-full rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    inputMode="url"
                  />
                  <textarea
                    value={linkContext}
                    onChange={(event) => setLinkContext(event.target.value)}
                    placeholder="Optional context: viewing a house today, evaluating a neighbourhood, reading before a meeting..."
                    className="min-h-20 w-full resize-none rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                  />
                  <button
                    onClick={startLinkRthm}
                    disabled={!linkUrl.trim()}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.32)", color: "rgb(190,170,250)" }}
                  >
                    Create from link
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
                ◉
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white/78">Photograph to Rthm</p>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>Experiment</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mt-1">
                  Take or choose a photo, then make a Rthm about what to notice, remember, question, or feel.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <textarea
                    value={photoContext}
                    onChange={(event) => setPhotoContext(event.target.value)}
                    placeholder="Optional context: property viewing, menu choice, object memory, room layout, travel moment..."
                    className="min-h-20 w-full resize-none rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    disabled={photoBusy}
                  />
                  <label
                    className="w-full rounded-xl px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98]"
                    style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.32)", color: "rgb(190,170,250)", opacity: photoBusy ? 0.55 : 1 }}
                  >
                    {photoBusy ? "Reading photo..." : "Take or choose photo"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={photoBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        startPhotoRthm(file);
                      }}
                    />
                  </label>
                  {photoName && <p className="text-[11px] text-white/28 truncate">{photoName}</p>}
                  {photoError && <p className="text-xs text-red-300/70 leading-relaxed">{photoError}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <StudioAction title="Export Rthm" detail="Prepare a track for use in a video, deck, page, workshop, or client context." status="Next" />
        <StudioAction title="Use-Case Builder" detail="Create a Rthm around a specific scenario rather than a personal moment." status="Now: experiments above" />
        <StudioAction title="Studio Notes" detail="Collect production notes, export intent, and follow-up tasks for Codex." status="Planned" />
        <StudioAction title="Style Archetypes" detail="Review and tune the named style characters that shape generated music." status="Planned" />
      </section>
    </main>
  );
}

function resizePhotoForPrompt(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not prepare photo"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not prepare photo"));
      }, "image/jpeg", 0.78);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open photo"));
    };
    img.src = url;
  });
}

function StudioAction({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
          +
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/78">{title}</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>{status}</span>
          </div>
          <p className="text-xs text-white/40 leading-relaxed mt-1">{detail}</p>
        </div>
      </div>
    </div>
  );
}
