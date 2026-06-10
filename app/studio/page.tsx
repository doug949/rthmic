"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { LockIcon } from "@/app/components/HomeTileIcons";

const PHOTO_FOCUS_OPTIONS = [
  { id: "place-history", label: "History", detail: "What this place or object might be connected to." },
  { id: "surroundings", label: "Surroundings", detail: "What the area, setting, or nearby context may imply." },
  { id: "sun-aspect", label: "Sun / aspect", detail: "Light, direction, time, and property-viewing clues." },
  { id: "property", label: "Property", detail: "Useful things to notice before a viewing." },
  { id: "memory", label: "Memory", detail: "What to preserve emotionally or personally." },
  { id: "questions", label: "Questions", detail: "What to investigate or ask next." },
] as const;

const PHOTO_METADATA_SLICE_BYTES = 768 * 1024;

const WALK_FOCUS_OPTIONS = [
  { id: "walking-tour", label: "Walking tour", detail: "A paced companion for moving through the place." },
  { id: "standing-history", label: "History here", detail: "What this spot may connect to historically." },
  { id: "architecture", label: "Architecture", detail: "Materials, form, age, and design clues." },
  { id: "nature", label: "Nature", detail: "Landscape, plants, water, light, and season." },
  { id: "food-drink", label: "Food / drink", detail: "Where to pause, eat, drink, or people-watch." },
  { id: "property", label: "Property", detail: "Viewing clues, aspect, access, and tradeoffs." },
  { id: "sensory", label: "Sensory walk", detail: "Sound, texture, rhythm, atmosphere, mood." },
  { id: "questions", label: "Questions", detail: "What to look up, ask, or investigate next." },
] as const;

function tagHintsParam(tags: string[]): string {
  return encodeURIComponent(tags.filter(Boolean).join(","));
}

export default function StudioPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [walkUrl, setWalkUrl] = useState("");
  const [walkContext, setWalkContext] = useState("");
  const [walkFocus, setWalkFocus] = useState<string[]>(["walking-tour", "questions"]);
  const [walkLocation, setWalkLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [walkBusy, setWalkBusy] = useState(false);
  const [walkLocationBusy, setWalkLocationBusy] = useState(false);
  const [walkError, setWalkError] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkContext, setLinkContext] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoContext, setPhotoContext] = useState("");
  const [photoFocus, setPhotoFocus] = useState<string[]>(["surroundings", "questions"]);
  const [photoName, setPhotoName] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoPurposeRecording, setPhotoPurposeRecording] = useState(false);
  const photoRecorderRef = useRef<MediaRecorder | null>(null);
  const photoChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setAllowed(!!data.access?.capabilities?.developerStudio))
      .catch(() => setAllowed(false))
      .finally(() => setChecked(true));
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

  const toggleWalkFocus = (id: string) => {
    setWalkFocus((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const requestWalkLocation = () => {
    if (!navigator.geolocation || walkLocationBusy) {
      setWalkError("Current location is not available in this browser.");
      return;
    }
    setWalkError("");
    setWalkLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setWalkLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setWalkLocationBusy(false);
      },
      () => {
        setWalkError("Could not get current location. You can paste a Google Maps link instead.");
        setWalkLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const walkFocusText = () => WALK_FOCUS_OPTIONS
    .filter((option) => walkFocus.includes(option.id))
    .map((option) => `${option.label}: ${option.detail}`)
    .join("\n");

  const startWalkingTour = async () => {
    const url = walkUrl.trim();
    if ((!url && !walkLocation) || walkBusy) return;
    setWalkBusy(true);
    setWalkError("");

    try {
      const res = await fetch("/api/walking-tour-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          context: walkContext.trim(),
          location: walkLocation,
          focusAreas: walkFocusText(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not read Google Maps link");
      const seed = typeof data.seed === "string" ? data.seed : "";
      if (!seed) throw new Error("Could not read Google Maps link");
      const tags = tagHintsParam(["walking tour", "current location", "local history", "place"]);
      router.push(`/speak?pillar=understanding&experiment=walking-tour&autoText=1&tagHints=${tags}&seed=${encodeURIComponent(seed)}`);
    } catch (err) {
      setWalkError(err instanceof Error ? err.message : "Could not read Google Maps link");
      setWalkBusy(false);
    }
  };

  const startSpokenWalkingTour = () => {
    const seed = [
      "Developer experiment: Walking Tour from spoken input.",
      "The user will describe where they are walking through to learn about the place.",
      walkLocation ? `Current location coordinates: ${walkLocation.latitude.toFixed(6)}, ${walkLocation.longitude.toFixed(6)}${walkLocation.accuracy ? `, accuracy about ${Math.round(walkLocation.accuracy)} metres` : ""}.` : "",
      walkFocus.length ? `Selected tour purpose:\n${walkFocusText()}` : "",
      "Create a Rthm that works as an audio walking-tour companion, paced for someone walking, looking around, and making sense of the place.",
      "Use the user's spoken details honestly: the place, route, mood, stops, atmosphere, what to notice, what to question, and what to remember.",
      "Do not invent landmarks, history, businesses, or facts that were not provided.",
    ].filter(Boolean).join(" ");
    const tags = tagHintsParam(["walking tour", "current location", "local history", "place"]);
    router.push(`/speak?pillar=understanding&experiment=walking-tour&tagHints=${tags}&seed=${encodeURIComponent(seed)}`);
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

  const togglePhotoFocus = (id: string) => {
    setPhotoFocus((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const handlePhotoFile = (file: File | null) => {
    setPhotoError("");
    setPhotoFile(file);
    setPhotoName(file?.name || "");
  };

  const transcribePhotoPurpose = async (audio: Blob) => {
    try {
      const form = new FormData();
      const ext = audio.type.includes("mp4") ? "mp4" : "webm";
      form.append("audio", audio, `purpose.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not transcribe purpose");
      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (transcript) {
        setPhotoContext((current) => [current.trim(), transcript].filter(Boolean).join("\n"));
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not transcribe purpose");
    }
  };

  const togglePhotoPurposeRecording = async () => {
    if (photoPurposeRecording) {
      const recorder = photoRecorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
      return;
    }

    try {
      setPhotoError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
      photoChunksRef.current = [];
      photoRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) photoChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setPhotoPurposeRecording(false);
        const blob = new Blob(photoChunksRef.current, { type: mimeType || "audio/webm" });
        photoChunksRef.current = [];
        if (blob.size > 0) transcribePhotoPurpose(blob);
      };
      recorder.start();
      setPhotoPurposeRecording(true);
    } catch {
      setPhotoPurposeRecording(false);
      setPhotoError("Microphone unavailable. Type the purpose instead.");
    }
  };

  const startPhotoRthm = async () => {
    if (!photoFile || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError("");

    try {
      const image = await resizePhotoForPrompt(photoFile);
      const form = new FormData();
      form.append("image", image, "photo.jpg");
      form.append(
        "metadataImage",
        photoFile.slice(0, PHOTO_METADATA_SLICE_BYTES, photoFile.type || "application/octet-stream"),
        photoFile.name || "original-photo"
      );
      const context = photoContext.trim();
      if (context) form.append("context", context);
      form.append("purpose", context);
      form.append("focusAreas", PHOTO_FOCUS_OPTIONS
        .filter((option) => photoFocus.includes(option.id))
        .map((option) => `${option.label}: ${option.detail}`)
        .join("\n"));

      const res = await fetch("/api/photo-rthm", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not interpret photo");

      const seed = typeof data.seed === "string" ? data.seed : "";
      if (!seed) throw new Error("Could not interpret photo");
      const tags = tagHintsParam(Array.isArray(data.tagHints) ? data.tagHints : ["photograph", "visual memory"]);
      router.push(`/speak?pillar=understanding&experiment=photo-song&autoText=1&tagHints=${tags}&seed=${encodeURIComponent(seed)}`);
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
          <button
            type="button"
            onClick={() => router.push("/reddit-adhd")}
            className="w-full rounded-2xl border px-5 py-4 text-left touch-manipulation active:scale-[0.99] transition-transform"
            style={{ background: "rgba(220,110,140,0.08)", borderColor: "rgba(220,110,140,0.24)" }}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(220,110,140,0.15)", color: "rgba(245,155,180,0.9)" }}>
                ↗
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white/82">ADHD Reddit Response</p>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.34)" }}>Developer</span>
                </div>
                <p className="text-xs text-white/43 leading-relaxed mt-1">Turn a Reddit ADHD post and your spoken response into a direct, supportive Bridge Rthm.</p>
              </div>
            </div>
          </button>
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
                  Paste a Google Maps link, use your current location, or speak where you are walking.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {WALK_FOCUS_OPTIONS.map((option) => {
                      const active = walkFocus.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleWalkFocus(option.id)}
                          disabled={walkBusy || walkLocationBusy}
                          className="rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98] disabled:opacity-40"
                          style={{
                            background: active ? "rgba(139,92,246,0.16)" : "rgba(255,255,255,0.035)",
                            borderColor: active ? "rgba(167,139,250,0.36)" : "rgba(255,255,255,0.10)",
                          }}
                        >
                          <span className="block text-[10px] uppercase tracking-widest" style={{ color: active ? "rgb(190,170,250)" : "rgba(255,255,255,0.46)" }}>{option.label}</span>
                          <span className="mt-1 block text-[10px] leading-snug text-white/30">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={walkUrl}
                    onChange={(event) => setWalkUrl(event.target.value)}
                    placeholder="Paste Google Maps link"
                    className="w-full rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    inputMode="url"
                    disabled={walkBusy}
                  />
                  <button
                    type="button"
                    onClick={requestWalkLocation}
                    disabled={walkBusy || walkLocationBusy}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.10)", color: walkLocation ? "rgb(190,170,250)" : "rgba(255,255,255,0.58)" }}
                  >
                    {walkLocationBusy ? "Getting location..." : walkLocation ? "Current location added" : "Use current location"}
                  </button>
                  {walkLocation && (
                    <p className="text-[11px] text-white/28 leading-relaxed">
                      {walkLocation.latitude.toFixed(5)}, {walkLocation.longitude.toFixed(5)}
                      {walkLocation.accuracy ? ` · about ${Math.round(walkLocation.accuracy)}m accuracy` : ""}
                    </p>
                  )}
                  <textarea
                    value={walkContext}
                    onChange={(event) => setWalkContext(event.target.value)}
                    placeholder="Optional context: what you want to learn, where you're heading, what you can see, property viewing, history, food stop, questions..."
                    className="min-h-20 w-full resize-none rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    disabled={walkBusy}
                  />
                  <button
                    onClick={startWalkingTour}
                    disabled={(!walkUrl.trim() && !walkLocation) || walkBusy}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.32)", color: "rgb(190,170,250)" }}
                  >
                    {walkBusy ? "Preparing tour..." : "Create from map/location"}
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
                  Take or choose a photo, choose what you want to learn from it, then create when ready.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {PHOTO_FOCUS_OPTIONS.map((option) => {
                      const active = photoFocus.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => togglePhotoFocus(option.id)}
                          disabled={photoBusy}
                          className="rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98] disabled:opacity-40"
                          style={{
                            background: active ? "rgba(139,92,246,0.16)" : "rgba(255,255,255,0.035)",
                            borderColor: active ? "rgba(167,139,250,0.36)" : "rgba(255,255,255,0.10)",
                          }}
                        >
                          <span className="block text-[10px] uppercase tracking-widest" style={{ color: active ? "rgb(190,170,250)" : "rgba(255,255,255,0.46)" }}>{option.label}</span>
                          <span className="mt-1 block text-[10px] leading-snug text-white/30">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={photoContext}
                    onChange={(event) => setPhotoContext(event.target.value)}
                    placeholder="Purpose or context: house for sale, old wall, room layout, travel moment, what you want the Rthm to help you learn..."
                    className="min-h-20 w-full resize-none rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    disabled={photoBusy}
                  />
                  <button
                    type="button"
                    onClick={togglePhotoPurposeRecording}
                    disabled={photoBusy}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{
                      background: photoPurposeRecording ? "rgba(248,113,113,0.10)" : "rgba(255,255,255,0.045)",
                      border: photoPurposeRecording ? "1px solid rgba(248,113,113,0.30)" : "1px solid rgba(255,255,255,0.10)",
                      color: photoPurposeRecording ? "rgba(252,165,165,0.86)" : "rgba(255,255,255,0.58)",
                    }}
                  >
                    {photoPurposeRecording ? "Stop speaking" : "Speak purpose"}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className="w-full rounded-xl px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98]"
                      style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.32)", color: "rgb(190,170,250)", opacity: photoBusy ? 0.55 : 1 }}
                    >
                      Take photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={photoBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          event.target.value = "";
                          handlePhotoFile(file);
                        }}
                      />
                    </label>
                    <label
                      className="w-full rounded-xl px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98]"
                      style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.62)", opacity: photoBusy ? 0.55 : 1 }}
                    >
                      Choose photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={photoBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          event.target.value = "";
                          handlePhotoFile(file);
                        }}
                      />
                    </label>
                  </div>
                  {photoName && <p className="text-[11px] text-white/28 truncate">{photoName}</p>}
                  <button
                    type="button"
                    onClick={startPhotoRthm}
                    disabled={!photoFile || photoBusy}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(139,92,246,0.20)", border: "1px solid rgba(167,139,250,0.42)", color: "rgb(210,196,255)" }}
                  >
                    {photoBusy ? "Reading photo..." : "Create Rthm"}
                  </button>
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
