"use client";

// CustomStyleInput — voice-first custom genre/style entry.
// Handles recording → transcription → auto-interpretation → selectable result.
// Used in GenreView (speak) and LibraryGenrePicker (library).

import { useState, useRef, useCallback, useEffect } from "react";
import { titleCaseStyle } from "@/app/lib/styleText";

interface Props {
  onStyleChange: (style: string) => void;  // fires when interpreted style updates
  selected: boolean;
  onSelect: () => void;
  onSave?: (style: string) => void;        // optional: save to user's style library
}

type VoicePhase = "idle" | "recording" | "transcribing" | "interpreting";

export default function CustomStyleInput({ onStyleChange, selected, onSelect, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [style, setStyle] = useState("");
  const [saved, setSaved] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  // Web Audio for voice bar animation
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const animFrameRef   = useRef<number>(0);
  const barsRef        = useRef<(HTMLDivElement | null)[]>([]);
  const barDataRef     = useRef(new Uint8Array(64));

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  const startBarAnimation = useCallback((stream: MediaStream) => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const N = barsRef.current.length;
      const bufLen = analyser.frequencyBinCount;
      const data = barDataRef.current = new Uint8Array(bufLen);
      const segLen = Math.floor(bufLen / N);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        barsRef.current.forEach((el, i) => {
          if (!el) return;
          let sum = 0;
          for (let j = i * segLen; j < Math.min((i + 1) * segLen, bufLen); j++) sum += data[j];
          const avg = sum / segLen;
          const h = Math.max(3, Math.round(3 + (avg / 255) * 22));
          el.style.height = `${h}px`;
        });
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch { /* Web Audio unavailable */ }
  }, []);

  // ─── Interpret ─────────────────────────────────────────────────────────────

  const runInterpret = useCallback(async (inputText: string) => {
    if (!inputText.trim()) return;
    setVoicePhase("interpreting");
    try {
      const res = await fetch("/api/interpret-genre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Describe the musical style or genre you want",
          description: inputText,
        }),
      });
      const data = await res.json();
      const result: string = data.style || data.genre || "";
      if (result) {
        const cap = titleCaseStyle(result);
        setStyle(cap);
        onStyleChange(cap);
        onSave?.(cap);
        setSaved(true);
      }
    } catch {
      setVoiceError("Interpretation failed — please try again.");
    } finally {
      setVoicePhase("idle");
    }
  }, [onStyleChange, onSave]);

  // ─── Voice recording ──────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    setVoiceError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let recorder: MediaRecorder | null = null;
      let chosenMime = "";
      const LOW_BITRATE = 32768;
      const typesToTry = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

      for (const type of typesToTry) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: LOW_BITRATE });
          chosenMime = type;
          break;
        } catch {
          try { recorder = new MediaRecorder(stream, { mimeType: type }); chosenMime = type; break; }
          catch { continue; }
        }
      }
      if (!recorder) {
        try { recorder = new MediaRecorder(stream, { audioBitsPerSecond: LOW_BITRATE }); }
        catch { recorder = new MediaRecorder(stream); }
        chosenMime = recorder.mimeType || "audio/mp4";
      }

      mimeTypeRef.current = chosenMime;
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        cleanupAudio();

        const actualMime = (mediaRecorderRef.current?.mimeType || mimeTypeRef.current || "audio/mp4").trim() || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size === 0) { setVoiceError("Nothing captured — please try again."); setVoicePhase("idle"); return; }

        setVoicePhase("transcribing");
        try {
          const ext = actualMime.includes("mp4") ? "m4a" : "webm";
          const form = new FormData();
          form.append("audio", blob, `recording.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (data.transcript) {
            setText(data.transcript);
            // Auto-interpret — no button press needed
            await runInterpret(data.transcript);
          } else {
            setVoiceError("Couldn't transcribe — please try again or type below.");
            setVoicePhase("idle");
          }
        } catch {
          setVoiceError("Transcription failed — please try again.");
          setVoicePhase("idle");
        }
      };

      recorder.start(250);
      startBarAnimation(stream);
      setVoicePhase("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setVoiceError(/denied|permission/i.test(msg)
        ? "Microphone access denied."
        : "Could not start recording — please try again.");
      setVoicePhase("idle");
    }
  }, [cleanupAudio, startBarAnimation, runInterpret]);

  const handleVoiceTap = () => {
    if (voicePhase === "recording") {
      stopRecording();
    } else if (voicePhase === "idle") {
      startRecording();
    }
  };

  // ─── Typed text auto-interpret on blur ────────────────────────────────────

  const handleTextBlur = () => {
    if (text.trim() && voicePhase === "idle") {
      runInterpret(text);
    }
  };

  const handleStyleEdit = (val: string) => {
    const formatted = titleCaseStyle(val);
    setStyle(formatted);
    onStyleChange(formatted);
    setSaved(false);
  };

  // ─── Toggle open ──────────────────────────────────────────────────────────

  const handleToggleOpen = () => {
    if (!open) {
      setOpen(true);
    } else if (!selected) {
      setOpen(false);
    }
  };

  const isProcessing = voicePhase === "transcribing" || voicePhase === "interpreting";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-2xl border transition-all duration-200"
      style={
        selected
          ? { borderColor: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.5)", background: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.06)" }
          : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
      }
    >
      {/* Header row — always visible */}
      <button
        onClick={handleToggleOpen}
        className="w-full flex items-center gap-3 px-5 py-4 text-left touch-manipulation active:scale-[0.98] transition-transform"
      >
        <span className="text-lg flex-shrink-0" style={{ color: selected ? "rgb(var(--flow-accent-rgb, 201, 165, 90))" : "rgba(255,255,255,0.25)" }}>
          ✦
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium" style={{ color: selected ? "rgb(var(--flow-accent-rgb, 201, 165, 90))" : "rgba(255,255,255,0.55)" }}>
            {style || "Speak a New Style"}
          </p>
          {!open && !style && (
            <p className="text-xs text-white/25 mt-0.5">Artist, era, genre, mood, or anything you like</p>
          )}
        </div>
        {style ? (
          <div
            className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
            style={selected
              ? { borderColor: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.7)", background: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.3)" }
              : { borderColor: "rgba(255,255,255,0.2)" }}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
          >
            {selected && <div className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--flow-accent-rgb, 201, 165, 90))" }} />}
          </div>
        ) : (
          <span className="text-white/20 text-sm flex-shrink-0">{open ? "−" : "+"}</span>
        )}
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-white/[0.05] pt-4">

          {/* Voice input */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleVoiceTap}
              disabled={isProcessing}
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border transition-all touch-manipulation active:scale-95 disabled:opacity-40"
              style={
                voicePhase === "recording"
                  ? { background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)" }
                  : isProcessing
                  ? { background: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.08)", borderColor: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.2)" }
                  : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }
              }
              aria-label={voicePhase === "recording" ? "Stop" : "Record"}
            >
              {isProcessing ? (
                <WaveDots size="sm" />
              ) : voicePhase === "recording" ? (
                <div className="w-3.5 h-3.5 rounded bg-red-400/80" />
              ) : (
                <MicIcon />
              )}
            </button>

            <div className="flex-1">
              {voicePhase === "recording" && (
                <div className="flex items-center gap-3">
                  {/* Audio-reactive bars */}
                  <div className="flex items-end gap-[3px] h-7">
                    {[0,1,2,3,4,5,6].map((i) => (
                      <div
                        key={i}
                        ref={(el) => { barsRef.current[i] = el; }}
                        style={{
                          width: 3,
                          height: 3,
                          background: "rgba(239,68,68,0.7)",
                          borderRadius: 2,
                          transition: "height 60ms ease",
                          alignSelf: "flex-end",
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-white/50">Listening… tap to stop</p>
                </div>
              )}
              {voicePhase === "transcribing" && (
                <p className="text-sm text-white/35">Transcribing…</p>
              )}
              {voicePhase === "interpreting" && (
                <p className="text-sm text-white/35">Reading your style…</p>
              )}
              {voicePhase === "idle" && (
                <p className="text-sm text-white/40">{text ? "Tap to re-record" : "Describe a new style or genre to add it to your custom styles"}</p>
              )}
            </div>
          </div>

          {voiceError && <p className="text-xs text-red-400/50 -mt-2 leading-relaxed">{voiceError}</p>}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.05]" />
            <span className="text-[10px] text-white/15 uppercase tracking-widest">or type</span>
            <div className="flex-1 h-px bg-white/[0.05]" />
          </div>

          {/* Textarea — auto-interprets on blur */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleTextBlur}
            placeholder="Name an artist, era, genre, feeling, reference, or anything you want this Rthm to sound like…"
            rows={3}
            className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-white/70 placeholder-white/15 outline-none focus:border-white/20 transition-colors resize-none leading-relaxed"
          />

          {/* Result */}
          {style && (
            <div>
              <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1.5">
                {isProcessing ? "Interpreting…" : "Interpreted style — tap to refine"}
              </p>
              <input
                type="text"
                value={style}
                onChange={(e) => handleStyleEdit(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white/80 outline-none focus:border-white/25 transition-colors"
              />
              <button
                onClick={onSelect}
                className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold tracking-widest uppercase transition-all touch-manipulation active:scale-[0.98]"
                style={selected
                  ? { background: "rgba(var(--flow-accent-rgb, 201, 165, 90),0.15)", border: "1px solid rgba(var(--flow-accent-rgb, 201, 165, 90),0.5)", color: "rgb(var(--flow-accent-rgb, 201, 165, 90))" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }
                }
              >
                {selected ? "✓ Using this style" : "Use this style"}
              </button>
              {onSave && (
                <button
                  onClick={() => { onSave(style); setSaved(true); }}
                  disabled={saved}
                  className="w-full mt-2 py-2.5 rounded-xl text-xs font-medium tracking-widest uppercase transition-all touch-manipulation active:scale-[0.98] disabled:opacity-60"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: saved ? "rgba(var(--flow-accent-rgb, 201, 165, 90),0.7)" : "rgba(255,255,255,0.3)" }}
                >
                  {saved ? "✓ Saved to Custom Styles" : "Save to Custom Styles"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared wave dots ─────────────────────────────────────────────────────────

export function WaveDots({ size = "md", gold = false }: { size?: "sm" | "md"; gold?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 30), 90);
    return () => clearInterval(id);
  }, []);

  const n = size === "sm" ? 3 : 5;
  const dotSize = size === "sm" ? 3 : 4;
  const color = gold ? "rgba(var(--flow-accent-rgb, 201, 165, 90),0.75)" : "rgba(255,255,255,0.5)";

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: n }, (_, i) => {
        const phase = (tick - i * 5 + 60) % 30;
        const scale = phase < 15 ? 0.5 + (phase / 15) * 0.7 : 1.2 - ((phase - 15) / 15) * 0.7;
        return (
          <div
            key={i}
            style={{
              width: dotSize, height: dotSize,
              borderRadius: "50%",
              background: color,
              transform: `scale(${scale.toFixed(3)})`,
              opacity: (0.35 + (scale - 0.5) * 0.65).toFixed(3) as unknown as number,
            }}
          />
        );
      })}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.4)" }}>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
