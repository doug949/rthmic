"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { transitionTo } from "@/app/lib/pageTransition";
import { AppHeader } from "@/app/components/AppHeader";
import { EQIcon } from "@/app/components/HomeTileIcons";
import { titleCaseStyle, toTitleCase } from "@/app/lib/styleText";
import { emptyStylePreferences, type StylePreferences } from "@/app/types/stylePreferences";

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
  { id: "power" as const, label: "Power", color: "235,120,108", question: "What music makes you feel powerful and inspired?", hint: "Choose the one that best fits before a big moment, workout, or challenge.", suggestions: [
    { label: "70s arena rock", examples: "Queen - We Will Rock You; Led Zeppelin - Immigrant Song" },
    { label: "Modern musical theatre", examples: "Hamilton - My Shot; The Greatest Showman - This Is Me" },
    { label: "90s hip-hop confidence", examples: "The Notorious B.I.G. - Juicy; Salt-N-Pepa - None of Your Business" },
    { label: "80s synth anthem", examples: "Bonnie Tyler - Holding Out for a Hero; Survivor - Eye of the Tiger" },
    { label: "00s pop-rock drive", examples: "Kelly Clarkson - Since U Been Gone; The Killers - All These Things That I've Done" },
    { label: "Classic heavy metal", examples: "Black Sabbath - Iron Man; Judas Priest - You've Got Another Thing Comin'" },
    { label: "Modern cinematic epic", examples: "Hans Zimmer - Mombasa; Woodkid - Run Boy Run" },
    { label: "Empowering soul", examples: "Aretha Franklin - Respect; Nina Simone - Feeling Good" },
  ] },
  { id: "focus" as const, label: "Focus", color: "70,205,235", question: "What music puts you in a deep focus state?", hint: "Select the sounds that help you think clearly and work without distraction.", suggestions: [
    { label: "Minimal electronic", examples: "Jon Hopkins - Abandon Window; Nils Frahm - Says" },
    { label: "Baroque focus", examples: "J.S. Bach - Goldberg Variations; Vivaldi - Winter" },
    { label: "Ambient techno", examples: "Brian Eno - An Ending (Ascent); Aphex Twin - Xtal" },
    { label: "Lo-fi jazz", examples: "Nujabes - Aruarian Dance; BADBADNOTGOOD - Time Moves Slow" },
    { label: "Modern classical", examples: "Philip Glass - Opening; Ludovico Einaudi - Experience" },
    { label: "Deep house flow", examples: "Kiasmos - Looped; Bonobo - Cirrus" },
    { label: "Post-rock instrumentals", examples: "Explosions in the Sky - Your Hand in Mine; Mogwai - Auto Rock" },
    { label: "Acoustic concentration", examples: "Nick Drake - From the Morning; Jose Gonzalez - Crosses" },
  ] },
  { id: "energy" as const, label: "Energy", color: "116,225,128", question: "What music instantly lifts your energy or mood?", hint: "Choose the one that most reliably creates joy, movement, or momentum.", suggestions: [
    { label: "70s disco", examples: "Bee Gees - You Should Be Dancing; Earth, Wind & Fire - September" },
    { label: "60s funk and soul", examples: "James Brown - I Got You (I Feel Good); Sly & The Family Stone - Dance to the Music" },
    { label: "00s dance-pop", examples: "Kylie Minogue - Love at First Sight; Daft Punk - One More Time" },
    { label: "Modern Afrobeats", examples: "Burna Boy - Last Last; Rema - Calm Down" },
    { label: "90s house", examples: "Robin S. - Show Me Love; Crystal Waters - Gypsy Woman" },
    { label: "Indie dance", examples: "LCD Soundsystem - Dance Yrself Clean; Phoenix - Lisztomania" },
    { label: "Latin pop", examples: "Shakira - Hips Don't Lie; Marc Anthony - Vivir Mi Vida" },
    { label: "Pop punk", examples: "Blink-182 - The Rock Show; Paramore - Misery Business" },
  ] },
  { id: "safety" as const, label: "Safety", color: "176,136,255", question: "What music makes you feel safe, held, and at home?", hint: "Choose the sounds you return to when you need steadiness, warmth, or reassurance.", suggestions: [
    { label: "70s singer-songwriter", examples: "Carole King - You've Got a Friend; James Taylor - Fire and Rain" },
    { label: "90s acoustic warmth", examples: "Tracy Chapman - The Promise; Eva Cassidy - Songbird" },
    { label: "Classic soul comfort", examples: "Bill Withers - Lean on Me; Otis Redding - These Arms of Mine" },
    { label: "Ambient piano", examples: "Max Richter - Written on the Sky; Olafur Arnalds - Saman" },
    { label: "80s dream pop", examples: "Cocteau Twins - Heaven or Las Vegas; The Cure - Pictures of You" },
    { label: "Gentle folk", examples: "Nick Drake - Northern Sky; Joni Mitchell - A Case of You" },
    { label: "Warm vocal jazz", examples: "Ella Fitzgerald - Misty; Chet Baker - I Fall in Love Too Easily" },
    { label: "Soft indie comfort", examples: "The National - Light Years; Sufjan Stevens - Mystery of Love" },
  ] },
];

interface SlotState {
  transcript: string;
  style: string;
  committed: boolean;
  interpreting: boolean;
  suggestedArtists: string[];
  selectedArtists: string[];
  selections: string[];
  overrideStyle: string;
}

const emptySlot = (): SlotState => ({
  transcript: "", style: "", committed: false, interpreting: false,
  suggestedArtists: [], selectedArtists: [], selections: [], overrideStyle: "",
});

interface CurrentStyle {
  name: string;
  prompt: string;
  source: "Built-in" | "Your style";
}

type VoicePhase = "idle" | "recording" | "transcribing" | "interpreting";

interface UserProfile {
  name: string;
  vocalist: "none" | "male" | "female";
  adhdMode: boolean;
  stylePreferences: StylePreferences;
  access?: {
    role?: "admin" | "beta";
    isAdmin?: boolean;
  };
}

function styleName(style: string): string {
  const idx = style.indexOf("|");
  if (idx > 0) return toTitleCase(style.slice(0, idx).trim());
  const comma = style.indexOf(",");
  return toTitleCase((comma > 0 ? style.slice(0, comma) : style.slice(0, 42)).trim());
}

function stylePrompt(style: string): string {
  const idx = style.indexOf("|");
  return (idx > 0 ? style.slice(idx + 1) : style).trim();
}

function styleList(styles: string[], source: CurrentStyle["source"]): CurrentStyle[] {
  return styles
    .filter((style) => style.trim())
    .map((style) => ({ name: styleName(style), prompt: stylePrompt(style), source }));
}

export default function SettingsPage() {
  const router = useRouter();

  // ── Profile state ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile>({ name: "", vocalist: "none", adhdMode: false, stylePreferences: emptyStylePreferences(), access: { role: "beta", isAdmin: false } });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Styles state ─────────────────────────────────────────────────────────────
  const [currentSlot, setCurrentSlot] = useState(0);
  const [slots, setSlots] = useState<SlotState[]>([emptySlot(), emptySlot(), emptySlot(), emptySlot()]);
  const [currentStyles, setCurrentStyles] = useState<CurrentStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [interpretError, setInterpretError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stylesExpanded, setStylesExpanded] = useState(false);
  const [setupMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "1");
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
      const preferences: StylePreferences = prof?.stylePreferences ?? emptyStylePreferences();
      if (prof) setProfile({ name: prof.name ?? "", vocalist: prof.vocalist ?? "none", adhdMode: !!prof.adhdMode, stylePreferences: preferences, access: prof.access ?? { role: "beta", isAdmin: false } });
      setSlots(prev => prev.map((s, i) => {
        const pref = preferences[SLOTS[i].id];
        return { ...s, style: pref.customDescription, transcript: pref.customDescription, selections: pref.selections.slice(0, 1), overrideStyle: pref.overrideStyle, committed: !!(pref.customDescription || pref.selections.length || pref.overrideStyle) };
      }));
      const builtIn = Array.isArray(gen?.builtIn) ? gen.builtIn : [];
      const user = Array.isArray(gen?.user) ? gen.user : [];
      const fallback = !builtIn.length && !user.length && Array.isArray(gen?.genres) ? gen.genres : [];
      setCurrentStyles([
        ...styleList((builtIn.length ? builtIn : fallback).map(titleCaseStyle), "Built-in"),
        ...styleList(user.map(titleCaseStyle), "Your style"),
      ]);
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

  const saveSlots = useCallback((nextSlots: SlotState[]) => {
    const stylePreferences = emptyStylePreferences();
    nextSlots.forEach((item, index) => {
      stylePreferences[SLOTS[index].id] = {
        selections: item.selections,
        customDescription: item.style.trim(),
        overrideStyle: item.overrideStyle,
      };
    });
    setProfile(prev => {
      const next = { ...prev, stylePreferences };
      saveProfile(next);
      return next;
    });
  }, [saveProfile]);

  // ── Slot helpers ─────────────────────────────────────────────────────────────
  const updateSlot = (i: number, patch: Partial<SlotState>, save = false) =>
    setSlots(prev => {
      const next = prev.map((s, j) => j === i ? { ...s, ...patch } : s);
      if (save) saveSlots(next);
      return next;
    });

  const toggleSuggestion = (i: number, suggestion: string) => {
    const selected = slots[i].selections.includes(suggestion) ? [] : [suggestion];
    updateSlot(i, { selections: selected, overrideStyle: "", committed: selected.length > 0 || !!slots[i].style }, true);
  };

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
  const saveSpokenStyle = useCallback((slotIndex: number, formattedStyle: string) => {
    setSlots(prev => {
      const next = prev.map((item, index) => index === slotIndex ? { ...item, style: formattedStyle, committed: true } : item);
      saveSlots(next);
      return next;
    });
  }, [saveSlots]);

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
          const ires = await fetch("/api/interpret-genre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: transcript, question: SLOTS[slotIndex].question }) });
          if (ires.ok) {
            const { style, artists } = await ires.json();
            const formattedStyle = titleCaseStyle(typeof style === "string" ? style : Array.isArray(style) ? style.join(", ") : "");
            updateSlot(slotIndex, { style: formattedStyle, interpreting: false, suggestedArtists: artists ?? [], selectedArtists: [] });
            saveSpokenStyle(slotIndex, formattedStyle);
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
  }, [cleanupWebAudio, startAudioVisualization, saveSpokenStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoiceTap = () => {
    if (voicePhase === "recording") stopVoiceRecording();
    else if (voicePhase === "idle") startVoiceRecording(currentSlot);
  };

  const refineWithArtists = async (i: number) => {
    const s = slots[i]; if (!s.selectedArtists.length) return;
    updateSlot(i, { interpreting: true }); setInterpretError("");
    try {
      const res = await fetch("/api/interpret-genre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: s.transcript, question: SLOTS[i].question, selectedArtists: s.selectedArtists }) });
      if (res.ok) {
        const { style, artists } = await res.json();
        const formattedStyle = titleCaseStyle(typeof style === "string" ? style : Array.isArray(style) ? style.join(", ") : "");
        updateSlot(i, { style: formattedStyle, interpreting: false, suggestedArtists: artists ?? [], selectedArtists: [] });
        saveSpokenStyle(i, formattedStyle);
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
  const activeAccent = slot.color;
  const hasStyle = s.style.trim().length > 0;
  const hasPreference = hasStyle || s.selections.length > 0 || !!s.overrideStyle;
  const isBusy = voicePhase !== "idle" || s.interpreting;

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title={setupMode ? "Choose Your Styles" : "Settings and Styles"} titleIcon={<EQIcon />} onBack={setupMode ? undefined : () => transitionTo("/", router)} />

      <div className="flex-1 flex flex-col pb-10 gap-8 overflow-y-auto">

        {/* ── Profile ────────────────────────────────────────────────────────── */}
        {!setupMode && <section>
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
                placeholder="Your first name — what do your friends call you?"
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

        </section>}

        {/* ── Rthmic Styles ─────────────────────────────────────────────────── */}
        <section
          className="rounded-3xl border overflow-hidden"
          style={{ borderColor: "rgba(70,205,235,0.22)", background: "rgba(70,205,235,0.035)" }}
        >
          <button
            type="button"
            onClick={() => setStylesExpanded((open) => !open)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left touch-manipulation active:bg-white/[0.03]"
          >
            <span className="flex items-center gap-2">
              <span style={{ color: "rgba(70,205,235,0.78)" }}><StylesIcon /></span>
              <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(70,205,235,0.78)" }}>Rthmic Styles</span>
            </span>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(70,205,235,0.46)" }}>
              {stylesExpanded ? "Hide" : "Show"} {currentStyles.length}
            </span>
          </button>

          {stylesExpanded && (
            <div className="px-5 pb-5">

          {currentStyles.length > 0 && (
            <div className="rounded-2xl border overflow-hidden mb-5" style={{ borderColor: "rgba(70,205,235,0.16)", background: "rgba(70,205,235,0.035)" }}>
              <div className="px-5 py-3.5 border-b border-white/[0.06]">
                <p className="text-sm font-medium" style={{ color: "rgba(70,205,235,0.9)" }}>Styles available as category overrides</p>
                <p className="text-xs mt-0.5 text-white/38">Nominate one below to override a category&apos;s detailed preferences.</p>
              </div>
              {currentStyles.map((style, i) => (
                <div
                  key={`${style.source}-${style.name}-${i}`}
                  className="px-5 py-3.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white/72">{style.name}</p>
                    <span className="flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest" style={{ borderColor: "rgba(70,205,235,0.22)", color: "rgba(70,205,235,0.68)", background: "rgba(70,205,235,0.06)" }}>
                      {style.source}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/42">{style.prompt}</p>
                </div>
              ))}
            </div>
          )}
            </div>
          )}
        </section>

        <section
          className="rounded-3xl border px-5 pb-5"
          style={{ borderColor: "rgba(70,205,235,0.22)", background: "rgba(70,205,235,0.035)" }}
        >

          {/* Slot tabs */}
          <div className="mt-4 pt-5 mb-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex gap-2">
            {SLOTS.map((sl, i) => (
              <button
                key={sl.label}
                onClick={() => goToSlot(i)}
                className="flex-1 py-2 rounded-xl border text-xs font-medium tracking-wide transition-all touch-manipulation active:scale-[0.96]"
                style={i === currentSlot
                  ? { background: `rgba(${sl.color},0.12)`, borderColor: `rgba(${sl.color},0.52)`, color: `rgb(${sl.color})` }
                  : slots[i].committed
                  ? { background: `rgba(${sl.color},0.045)`, borderColor: `rgba(${sl.color},0.22)`, color: `rgba(${sl.color},0.62)` }
                  : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
              >
                {sl.label}
                {slots[i].committed && <span className="ml-1 text-[9px]">✓</span>}
              </button>
            ))}
          </div>
          </div>

          {/* Slot label + question */}
          <div className="mb-4">
            <span
              className="inline-block text-[10px] px-2.5 py-0.5 rounded-full border uppercase tracking-widest font-medium mb-3"
              style={{ background: `rgba(${activeAccent},0.10)`, color: `rgba(${activeAccent},0.78)`, borderColor: `rgba(${activeAccent},0.28)` }}
            >
              {slot.label}
            </span>
            <h2 className="text-xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
              {slot.question}
            </h2>
            <p className="text-sm text-white/40 mt-1.5 leading-relaxed">{slot.hint}</p>
          </div>

          <div className="mb-5">
            <p className="text-[10px] text-white/45 uppercase tracking-widest mb-3">Choose one style</p>
            <div className="grid grid-cols-2 gap-2.5">
              {slot.suggestions.map((suggestion) => {
                const selected = s.selections.includes(suggestion.label);
                return (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => toggleSuggestion(currentSlot, suggestion.label)}
                    className="relative aspect-square rounded-2xl border p-3 text-left transition-all touch-manipulation active:scale-[0.98] flex flex-col"
                    style={selected
                      ? { background: `rgba(${activeAccent},0.12)`, borderColor: `rgba(${activeAccent},0.48)` }
                      : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug" style={{ color: selected ? `rgb(${activeAccent})` : "rgba(255,255,255,0.72)" }}>{suggestion.label}</span>
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px]" style={{ borderColor: selected ? `rgba(${activeAccent},0.65)` : "rgba(255,255,255,0.18)", background: selected ? `rgba(${activeAccent},0.18)` : "transparent", color: `rgb(${activeAccent})` }}>{selected ? "✓" : ""}</span>
                    </div>
                    <p className="mt-auto pt-3 text-[10px] leading-snug text-white/38">{suggestion.examples}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/38 text-center">OR choose one of your RTHMIC styles</p>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <div className="rounded-2xl border px-4 py-4 mb-4" style={{ borderColor: `rgba(${activeAccent},0.2)`, background: `rgba(${activeAccent},0.035)` }}>
            <select
              value={s.overrideStyle}
              onChange={(event) => {
                const overrideStyle = event.target.value;
                updateSlot(currentSlot, { overrideStyle, selections: overrideStyle ? [] : s.selections, committed: !!(overrideStyle || s.selections.length || s.style) }, true);
              }}
              className="w-full rounded-xl border bg-[#0d1628] px-3 py-3 text-sm text-white/75 outline-none"
              style={{ borderColor: "rgba(255,255,255,0.12)" }}
            >
              <option value="">No RTHMIC style override</option>
              {currentStyles.map((style, index) => <option key={`${style.source}-${index}`} value={`${style.name}|${style.prompt}`}>{style.name} ({style.source})</option>)}
            </select>
          </div>

          {/* Voice input */}
          <div
            className="rounded-2xl border overflow-hidden mb-3"
            style={
              voicePhase === "recording"
                ? { borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.04)" }
                : voicePhase !== "idle"
                ? { borderColor: `rgba(${activeAccent},0.25)`, background: `rgba(${activeAccent},0.035)` }
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
                    ? { background: `rgba(${activeAccent},0.1)`, borderColor: `rgba(${activeAccent},0.3)`, transition: "all 0.2s" }
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
                  <><p className="text-base font-medium" style={{ color: s.transcript ? "rgba(255,255,255,0.75)" : `rgb(${activeAccent})` }}>{s.transcript ? "Tap to re-record" : "Speak your own style"}</p><p className="text-xs text-white/50 mt-0.5">{s.transcript ? "Your words will be replaced" : `Describe anything else that belongs in your ${slot.label.toLowerCase()} preference`}</p></>
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
          {hasPreference && !isBusy && (
            <div className="rounded-2xl border px-5 py-5 mb-3" style={{ borderColor: `rgba(${activeAccent},0.24)`, background: `rgba(${activeAccent},0.045)` }}>
              <p className="text-[10px] text-white/50 uppercase tracking-widest mb-2">Your Current {slot.label} Style Preference</p>
              {s.overrideStyle ? (
                <p className="text-base font-light leading-relaxed" style={{ color: `rgb(${activeAccent})`, fontFamily: "var(--font-display)" }}>
                  {styleName(s.overrideStyle)}
                </p>
              ) : (
                <>
                  {s.selections.length > 0 && <p className="text-sm leading-relaxed mb-2" style={{ color: `rgb(${activeAccent})` }}>{s.selections.join(" + ")}</p>}
                  {hasStyle && <textarea
                    value={s.style}
                    onChange={e => updateSlot(currentSlot, { style: e.target.value, committed: false })}
                    onBlur={() => saveSpokenStyle(currentSlot, s.style)}
                    rows={3}
                    className="w-full bg-transparent text-base font-light leading-relaxed outline-none resize-none"
                    style={{ color: `rgb(${activeAccent})`, fontFamily: "var(--font-display)" }}
                    placeholder="Style description"
                  />}
                  <p className="text-[10px] text-white/45 mt-1 leading-relaxed">Your selected suggestions and spoken description are used together.</p>
                </>
              )}
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
                          style={isSelected ? { color: `rgb(${activeAccent})`, background: `rgba(${activeAccent},0.12)`, borderColor: `rgba(${activeAccent},0.45)` } : { color: "rgba(255,255,255,0.35)", background: "transparent", borderColor: "rgba(255,255,255,0.08)" }}>
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
          {(s.selections.length > 0 || s.style || s.overrideStyle) && !isBusy && (
            <button
              type="button"
              onClick={() => updateSlot(currentSlot, { selections: [], style: "", transcript: "", overrideStyle: "", committed: false, suggestedArtists: [], selectedArtists: [] }, true)}
              className="mt-3 text-xs text-white/42 underline underline-offset-4 touch-manipulation"
            >
              Reset {slot.label} preferences
            </button>
          )}
        </section>

        {setupMode && (
          <button
            type="button"
            onClick={() => transitionTo("/understand?welcome=1", router)}
            className="w-full rounded-2xl border py-4 text-sm font-semibold tracking-wide touch-manipulation active:scale-[0.98]"
            style={{ color: "rgba(70,205,235,0.92)", borderColor: "rgba(70,205,235,0.4)", background: "rgba(70,205,235,0.1)" }}
          >
            Continue to RTHMIC
          </button>
        )}

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
