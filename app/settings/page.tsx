"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { transitionTo } from "@/app/lib/pageTransition";
import { AppHeader } from "@/app/components/AppHeader";

// ─── Purple palette ────────────────────────────────────────────────────────────
const PURPLE = {
  text:   "rgba(180,150,240,0.92)",
  dim:    "rgba(160,130,220,0.65)",
  bg:     "rgba(160,130,220,0.06)",
  border: "rgba(160,130,220,0.22)",
  hover:  "rgba(160,130,220,0.12)",
};

// ─── Styles slots ──────────────────────────────────────────────────────────────
const SLOTS = [
  { label: "Power",  question: "What music makes you feel powerful and inspired?",     hint: "Tracks that make you feel unstoppable — before a big moment, a workout, a challenge." },
  { label: "Focus",  question: "What music puts you in a deep focus state?",            hint: "The music you reach for when you need to think clearly and work without distraction." },
  { label: "Energy", question: "What music instantly lifts your energy or mood?",       hint: "Tracks that shift your state the moment they come on — pure joy or momentum." },
  { label: "Soul",   question: "What music do you always come back to — your soul music?", hint: "The artists that feel like home. The ones you've returned to across years of your life." },
];

interface SlotState {
  transcript: string;
  style: string;
  committed: boolean;
  interpreting: boolean;
  suggestedArtists: string[];
  selectedArtists: string[];
}

const emptySlot = (): SlotState => ({
  transcript: "", style: "", committed: false, interpreting: false,
  suggestedArtists: [], selectedArtists: [],
});

type VoicePhase = "idle" | "recording" | "transcribing" | "interpreting";

interface UserProfile {
  name: string;
  vocalist: "none" | "male" | "female";
  adhdMode: boolean;
}

export default function SettingsPage() {
  const router = useRouter();

  // ── Profile state ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile>({ name: "", vocalist: "none", adhdMode: false });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Styles state ─────────────────────────────────────────────────────────────
  const [currentSlot, setCurrentSlot] = useState(0);
  const [slots, setSlots] = useState<SlotState[]>([emptySlot(), emptySlot(), emptySlot(), emptySlot()]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [interpretError, setInterpretError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState("");
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const micBtnRef = useRef<HTMLDivElement>(null);

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()).catch(() => null),
      fetch("/api/genres").then(r => r.json()).catch(() => null),
    ]).then(([prof, gen]) => {
      if (prof) setProfile({ name: prof.name ?? "", vocalist: prof.vocalist ?? "none", adhdMode: !!prof.adhdMode });
      if (gen?.genres) {
        setSlots(prev => prev.map((s, i) => ({
          ...s, style: gen.genres[i] ?? "", committed: !!(gen.genres[i]),
        })));
      }
    }).finally(() => setLoading(false));
  }, []);

  // ── Profile auto-save (debounced 800ms) ───────────────────────────────────────
  const saveProfile = useCallback((next: UserProfile) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setProfileSaved(false);
    setProfileSaving(true);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        setProfileSaved(true);
      } catch { /* silent */ } finally {
        setProfileSaving(false);
      }
    }, 800);
  }, []);

  const updateProfile = (patch: Partial<UserProfile>) => {
    setProfile(prev => { const next = { ...prev, ...patch }; saveProfile(next); return next; });
  };

  // ── Slot helpers ─────────────────────────────────────────────────────────────
  const updateSlot = (i: number, patch: Partial<SlotState>) =>
    setSlots(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));

  const toggleArtist = (i: number, artist: string) => {
    const next = slots[i].selectedArtists.includes(artist)
      ? slots[i].selectedArtists.filter(a => a !== artist)
      : [...slots[i].selectedArtists, artist];
    updateSlot(i, { selectedArtists: next });
  };

  const goToSlot = (index: number) => {
    if (index === currentSlot) return;
    stopVoiceRecording();
    cleanupWebAudio();
    setVoiceError(""); setInterpretError(""); setShowAdvanced(false);
    setSaveError("");
    setCurrentSlot(index);
  };

  // ── Web Audio ────────────────────────────────────────────────────────────────
  const cleanupWebAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    const el = micBtnRef.current;
    if (el) { el.style.transform = ""; el.style.boxShadow = ""; }
  }, []);

  const startAudioVisualization = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser); analyserRef.current = analyser;
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0; for (let i = 0; i < bufLen; i++) sum += data[i];
        const norm = Math.min(sum / (bufLen * 90), 1);
        const scale = 1 + norm * 0.35;
        const glow = Math.round(norm * 28);
        const glowAlpha = (0.15 + norm * 0.45).toFixed(3);
        const el = micBtnRef.current;
        if (el) {
          el.style.transform = `scale(${scale.toFixed(3)})`;
          el.style.boxShadow = `0 0 ${glow}px ${Math.round(glow * 0.4)}px rgba(239,68,68,${glowAlpha})`;
        }
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch (e) { console.warn("Web Audio unavailable:", e); }
  }, []);

  // ── Auto-save style ──────────────────────────────────────────────────────────
  const autoSaveStyle = useCallback(async (slotIndex: number, formattedStyle: string) => {
    setSaveError("");
    try {
      const styles = slotsRef.current.map((sl, j) => j === slotIndex ? formattedStyle : sl.style.trim());
      const res = await fetch("/api/genres", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genres: styles }) });
      if (res.ok) setSlots(prev => prev.map((s, j) => j === slotIndex ? { ...s, committed: true } : s));
      else setSaveError("Could not save — please try again.");
    } catch { setSaveError("Could not save — please try again."); }
  }, []);

  // ── Voice recording ──────────────────────────────────────────────────────────
  const stopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }, []);

  const startVoiceRecording = useCallback(async (slotIndex: number) => {
    setVoiceError(""); setInterpretError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let recorder: MediaRecorder | null = null;
      let chosenMime = "";
      const LOW_BITRATE = 32768;
      for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try { recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: LOW_BITRATE }); chosenMime = type; break; }
        catch { try { recorder = new MediaRecorder(stream, { mimeType: type }); chosenMime = type; break; } catch { continue; } }
      }
      if (!recorder) {
        try { recorder = new MediaRecorder(stream, { audioBitsPerSecond: LOW_BITRATE }); }
        catch { recorder = new MediaRecorder(stream); }
        chosenMime = recorder.mimeType || "audio/mp4";
      }
      mimeTypeRef.current = chosenMime; chunksRef.current = []; mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); cleanupWebAudio();
        const actualMime = (mediaRecorderRef.current?.mimeType || mimeTypeRef.current || "audio/mp4").trim() || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size === 0) { setVoiceError("Nothing captured — please try again."); setVoicePhase("idle"); return; }
        setVoicePhase("transcribing");
        try {
          const ext = actualMime.includes("mp4") ? "mp4" : "webm";
          const form = new FormData(); form.append("audio", blob, `recording.${ext}`);
          const tres = await fetch("/api/transcribe", { method: "POST", body: form });
          if (!tres.ok) throw new Error("Transcription failed");
          const { transcript } = await tres.json();
          updateSlot(slotIndex, { transcript, interpreting: true }); setVoicePhase("interpreting");
          const ires = await fetch("/api/interpret-genre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript, slot: SLOTS[slotIndex].label }) });
          if (ires.ok) {
            const { style, artists } = await ires.json();
            const formattedStyle = typeof style === "string" ? style : Array.isArray(style) ? style.join(", ") : "";
            updateSlot(slotIndex, { style: formattedStyle, interpreting: false, suggestedArtists: artists ?? [], selectedArtists: [] });
            autoSaveStyle(slotIndex, formattedStyle);
          } else { updateSlot(slotIndex, { interpreting: false }); setInterpretError("Couldn't refine — please try again."); }
        } catch { updateSlot(slotIndex, { interpreting: false }); setInterpretError("Something went wrong — please try again."); }
        setVoicePhase("idle");
      };
      startAudioVisualization(stream); setVoicePhase("recording");
      recorder.start(200);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setVoiceError(/denied|not allowed/i.test(raw) ? "Microphone access denied — please allow it and try again." : "Could not start recording — please try again.");
    }
  }, [cleanupWebAudio, startAudioVisualization, autoSaveStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoiceTap = () => {
    if (voicePhase === "recording") stopVoiceRecording();
    else if (voicePhase === "idle") startVoiceRecording(currentSlot);
  };

  const refineWithArtists = async (i: number) => {
    const s = slots[i]; if (!s.selectedArtists.length) return;
    updateSlot(i, { interpreting: true }); setInterpretError("");
    try {
      const res = await fetch("/api/interpret-genre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: s.transcript, slot: SLOTS[i].label, artists: s.selectedArtists }) });
      if (res.ok) {
        const { style, artists } = await res.json();
        const formattedStyle = typeof style === "string" ? style : Array.isArray(style) ? style.join(", ") : "";
        updateSlot(i, { style: formattedStyle, interpreting: false, suggestedArtists: artists ?? [], selectedArtists: [] });
        autoSaveStyle(i, formattedStyle);
      } else { updateSlot(i, { interpreting: false }); setInterpretError("Couldn't refine — please try again."); }
    } catch { updateSlot(i, { interpreting: false }); setInterpretError("Refinement failed — please try again."); }
  };

  // ────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
      </main>
    );
  }

  const slot = SLOTS[currentSlot];
  const s = slots[currentSlot];
  const hasStyle = s.style.trim().length > 0;
  const isBusy = voicePhase !== "idle" || s.interpreting;

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title="Settings" onBack={() => transitionTo("/", router)} />

      <div className="flex-1 flex flex-col pb-10 gap-8 overflow-y-auto">

        {/* ── Profile ────────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ color: PURPLE.dim }}><ProfileIcon /></span>
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: PURPLE.dim }}>Your Profile</p>
            {(profileSaving || profileSaved) && (
              <span className="ml-auto text-[9px] uppercase tracking-widest" style={{ color: profileSaved ? PURPLE.dim : "rgba(255,255,255,0.3)" }}>
                {profileSaving ? "Saving…" : "✓ Saved"}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {/* Name */}
            <div className="rounded-2xl border px-5 py-4" style={{ background: PURPLE.bg, borderColor: PURPLE.border }}>
              <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: PURPLE.dim }}>Your name</p>
              <input
                type="text"
                value={profile.name}
                onChange={e => updateProfile({ name: e.target.value })}
                placeholder="How should Rthmic address you?"
                className="w-full bg-transparent outline-none text-base font-light placeholder-white/25"
                style={{ color: PURPLE.text }}
              />
            </div>

            {/* Vocalist */}
            <div className="rounded-2xl border px-5 py-4" style={{ background: PURPLE.bg, borderColor: PURPLE.border }}>
              <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: PURPLE.dim }}>Preferred vocalist</p>
              <div className="flex gap-2">
                {(["none", "female", "male"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => updateProfile({ vocalist: v })}
                    className="flex-1 py-2.5 rounded-xl border text-xs font-medium uppercase tracking-widest transition-all touch-manipulation active:scale-[0.97]"
                    style={profile.vocalist === v
                      ? { background: PURPLE.hover, borderColor: PURPLE.border, color: PURPLE.text }
                      : { background: "transparent", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                  >
                    {v === "none" ? "No pref" : v}
                  </button>
                ))}
              </div>
            </div>

            {/* ADHD mode */}
            <button
              onClick={() => updateProfile({ adhdMode: !profile.adhdMode })}
              className="w-full rounded-2xl border px-5 py-4 flex items-center gap-4 text-left transition-all touch-manipulation active:scale-[0.98]"
              style={{ background: profile.adhdMode ? PURPLE.hover : PURPLE.bg, borderColor: PURPLE.border }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: PURPLE.text }}>ADHD Mode</p>
                <p className="text-xs mt-0.5" style={{ color: PURPLE.dim }}>
                  Unlocks features tuned for how your brain works — including tracks for rejection sensitivity and executive function
                </p>
              </div>
              {/* Toggle */}
              <div
                className="flex-shrink-0 w-11 h-6 rounded-full border transition-all"
                style={{
                  background: profile.adhdMode ? "rgba(160,130,220,0.35)" : "rgba(255,255,255,0.06)",
                  borderColor: profile.adhdMode ? PURPLE.border : "rgba(255,255,255,0.12)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full mt-0.5 transition-all"
                  style={{
                    background: profile.adhdMode ? PURPLE.text : "rgba(255,255,255,0.3)",
                    marginLeft: profile.adhdMode ? "24px" : "3px",
                  }}
                />
              </div>
            </button>
          </div>
        </section>

        {/* ── Rthmic Styles ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span style={{ color: "rgba(201,165,90,0.65)" }}><StylesIcon /></span>
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(201,165,90,0.65)" }}>Rthmic Styles</p>
          </div>

          {/* Slot tabs */}
          <div className="flex gap-2 mb-5">
            {SLOTS.map((sl, i) => (
              <button
                key={sl.label}
                onClick={() => goToSlot(i)}
                className="flex-1 py-2 rounded-xl border text-xs font-medium tracking-wide transition-all touch-manipulation active:scale-[0.96]"
                style={i === currentSlot
                  ? { background: "rgba(201,165,90,0.1)", borderColor: "rgba(201,165,90,0.45)", color: "#c9a55a" }
                  : slots[i].committed
                  ? { background: "rgba(201,165,90,0.04)", borderColor: "rgba(201,165,90,0.18)", color: "rgba(201,165,90,0.5)" }
                  : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
              >
                {sl.label}
                {slots[i].committed && <span className="ml-1 text-[9px]">✓</span>}
              </button>
            ))}
          </div>

          {/* Slot label + question */}
          <div className="mb-4">
            <span
              className="inline-block text-[10px] px-2.5 py-0.5 rounded-full border uppercase tracking-widest font-medium mb-3"
              style={{ background: "rgba(201,165,90,0.08)", color: "rgba(201,165,90,0.55)", borderColor: "rgba(201,165,90,0.2)" }}
            >
              {slot.label}
            </span>
            <h2 className="text-xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
              {slot.question}
            </h2>
            <p className="text-sm text-white/40 mt-1.5 leading-relaxed">{slot.hint}</p>
          </div>

          {/* Voice input */}
          <div
            className="rounded-2xl border overflow-hidden mb-3"
            style={
              voicePhase === "recording"
                ? { borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.04)" }
                : voicePhase !== "idle"
                ? { borderColor: "rgba(201,165,90,0.25)", background: "rgba(201,165,90,0.03)" }
                : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
            }
          >
            <button
              onClick={handleVoiceTap}
              disabled={voicePhase === "transcribing" || voicePhase === "interpreting"}
              className="w-full flex items-center gap-5 px-5 py-5 touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-70"
            >
              <div
                ref={micBtnRef}
                className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center border"
                style={
                  voicePhase === "recording"
                    ? { background: "rgba(239,68,68,0.2)", borderColor: "rgba(239,68,68,0.6)", willChange: "transform, box-shadow", transition: "none" }
                    : voicePhase !== "idle"
                    ? { background: "rgba(201,165,90,0.1)", borderColor: "rgba(201,165,90,0.3)", transition: "all 0.2s" }
                    : { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)", transition: "all 0.2s" }
                }
              >
                {voicePhase === "transcribing" || voicePhase === "interpreting"
                  ? <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                  : voicePhase === "recording"
                  ? <div className="w-4 h-4 rounded bg-red-400/90" />
                  : <MicIcon />}
              </div>
              <div className="flex-1 text-left">
                {voicePhase === "recording" && (
                  <><div className="flex items-center gap-2 mb-1"><div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /><p className="text-base text-white/80 font-medium">Listening…</p></div><p className="text-xs text-white/45">Tap to stop</p></>
                )}
                {voicePhase === "transcribing" && <p className="text-base text-white/50">Transcribing…</p>}
                {voicePhase === "interpreting" && <p className="text-base text-white/50">Interpreting your style…</p>}
                {voicePhase === "idle" && (
                  <><p className="text-base font-medium" style={{ color: s.transcript ? "rgba(255,255,255,0.75)" : "#c9a55a" }}>{s.transcript ? "Tap to re-record" : "Your Rthm style – tap to speak"}</p><p className="text-xs text-white/50 mt-0.5">{s.transcript ? "Your words will be replaced" : "Describe the feel, energy, what it does to you"}</p></>
                )}
              </div>
            </button>
            {s.transcript && voicePhase === "idle" && (
              <div className="px-5 pb-4 border-t border-white/[0.05] pt-3">
                <p className="text-[10px] text-white/45 uppercase tracking-widest mb-1.5">What you said</p>
                <p className="text-sm text-white/50 leading-relaxed italic">&ldquo;{s.transcript}&rdquo;</p>
              </div>
            )}
          </div>

          {voiceError && <p className="text-xs text-red-400/60 mb-3 leading-relaxed">{voiceError}</p>}

          {/* Interpreted style */}
          {hasStyle && !isBusy && (
            <div className="rounded-2xl border px-5 py-5 mb-3" style={{ borderColor: "rgba(201,165,90,0.2)", background: "rgba(201,165,90,0.04)" }}>
              <p className="text-[10px] text-white/50 uppercase tracking-widest mb-2">{s.committed ? "✓ Saved" : "Saving…"}</p>
              <textarea
                value={s.style}
                onChange={e => updateSlot(currentSlot, { style: e.target.value, committed: false })}
                rows={3}
                className="w-full bg-transparent text-base font-light leading-relaxed outline-none resize-none"
                style={{ color: "#c9a55a", fontFamily: "var(--font-display)" }}
                placeholder="Style description"
              />
              <p className="text-[10px] text-white/45 mt-1 leading-relaxed">Tap to edit · this feeds the music engine</p>
            </div>
          )}

          {/* Artist chips */}
          {hasStyle && !isBusy && s.suggestedArtists.length > 0 && (
            <div className="mb-3">
              <button onClick={() => setShowAdvanced(v => !v)} className="flex items-center gap-2 text-[10px] text-white/45 uppercase tracking-widest touch-manipulation hover:text-white/60 transition-colors">
                <span>{showAdvanced ? "▾" : "▸"}</span><span>Refine with artists</span>
              </button>
              {showAdvanced && (
                <div className="mt-3">
                  <p className="text-xs text-white/50 mb-3 leading-relaxed">Select artists that match, then tap Refine to sharpen the result.</p>
                  <div className="flex flex-wrap gap-2">
                    {s.suggestedArtists.map(artist => {
                      const isSelected = s.selectedArtists.includes(artist);
                      return (
                        <button key={artist} onClick={() => toggleArtist(currentSlot, artist)}
                          className="text-[11px] rounded-full px-3 py-1.5 border transition-all duration-150 touch-manipulation active:scale-95"
                          style={isSelected ? { color: "#c9a55a", background: "rgba(201,165,90,0.12)", borderColor: "rgba(201,165,90,0.45)" } : { color: "rgba(255,255,255,0.35)", background: "transparent", borderColor: "rgba(255,255,255,0.08)" }}>
                          {isSelected && <span className="mr-1 text-[10px]">✓</span>}{artist}
                        </button>
                      );
                    })}
                  </div>
                  {s.selectedArtists.length > 0 && <button onClick={() => updateSlot(currentSlot, { selectedArtists: [] })} className="mt-2 text-[10px] text-white/45 touch-manipulation">Clear selection</button>}
                </div>
              )}
            </div>
          )}

          {hasStyle && !isBusy && s.selectedArtists.length > 0 && (
            <button onClick={() => refineWithArtists(currentSlot)}
              className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all touch-manipulation active:scale-[0.98] mb-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
              Refine with selected artists →
            </button>
          )}

          {interpretError && !isBusy && <p className="text-xs text-red-400/60 mb-3 leading-relaxed">{interpretError}</p>}
          {saveError && <p className="text-xs text-red-400/60 text-center">{saveError}</p>}
        </section>

      </div>
    </main>
  );
}

function ProfileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StylesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M9 18V6l12-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="18" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.45)" }}>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
