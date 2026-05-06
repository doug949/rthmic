"use client";

// CustomStyleInput — voice-first custom genre/style entry.
// Handles recording → transcription → interpretation → selectable result.
// Used in GenreView (speak) and LibraryGenrePicker (library).

import { useState, useRef, useCallback } from "react";

interface Props {
  onStyleChange: (style: string) => void;  // fires when interpreted style updates
  selected: boolean;
  onSelect: () => void;
}

type VoicePhase = "idle" | "recording" | "transcribing";

export default function CustomStyleInput({ onStyleChange, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [style, setStyle] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

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
          } else {
            setVoiceError("Couldn't transcribe — please try again or type below.");
          }
        } catch {
          setVoiceError("Transcription failed — please try again.");
        } finally {
          setVoicePhase("idle");
        }
      };

      recorder.start(250);
      setVoicePhase("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setVoiceError(/denied|permission/i.test(msg)
        ? "Microphone access denied."
        : "Could not start recording — please try again.");
      setVoicePhase("idle");
    }
  }, []);

  const handleVoiceTap = () => {
    if (voicePhase === "recording") {
      stopRecording();
      setVoicePhase("transcribing");
    } else if (voicePhase === "idle") {
      startRecording();
    }
  };

  // ─── Interpret ────────────────────────────────────────────────────────────

  const handleInterpret = async () => {
    if (!text.trim()) return;
    setInterpreting(true);
    try {
      const res = await fetch("/api/interpret-genre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Describe the musical style or genre you want",
          description: text,
        }),
      });
      const data = await res.json();
      const result = data.style || data.genre;
      if (result) {
        setStyle(result);
        onStyleChange(result);
      }
    } catch {
      setVoiceError("Interpretation failed — please try again.");
    } finally {
      setInterpreting(false);
    }
  };

  const handleStyleEdit = (val: string) => {
    setStyle(val);
    onStyleChange(val);
  };

  // ─── Toggle open ──────────────────────────────────────────────────────────

  const handleToggleOpen = () => {
    if (!open) {
      setOpen(true);
    } else if (!selected) {
      setOpen(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-2xl border transition-all duration-200"
      style={
        selected
          ? { borderColor: "rgba(201,165,90,0.5)", background: "rgba(201,165,90,0.06)" }
          : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
      }
    >
      {/* Header row — always visible */}
      <button
        onClick={handleToggleOpen}
        className="w-full flex items-center gap-3 px-5 py-4 text-left touch-manipulation active:scale-[0.98] transition-transform"
      >
        <span className="text-lg flex-shrink-0" style={{ color: selected ? "#c9a55a" : "rgba(255,255,255,0.25)" }}>
          ✦
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-base font-medium ${selected ? "text-[#c9a55a]" : "text-white/55"}`}>
              {style || "Describe your own style"}
            </p>
            <span
              className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full border flex-shrink-0"
              style={{ color: "rgba(201,165,90,0.55)", borderColor: "rgba(201,165,90,0.2)", background: "rgba(201,165,90,0.06)" }}
            >
              Beta
            </span>
          </div>
          {!open && !style && (
            <p className="text-xs text-white/25 mt-0.5">Speak or type any genre, mood, or reference</p>
          )}
        </div>
        {style ? (
          <div
            className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
            style={selected
              ? { borderColor: "rgba(201,165,90,0.7)", background: "rgba(201,165,90,0.3)" }
              : { borderColor: "rgba(255,255,255,0.2)" }}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
          >
            {selected && <div className="w-2 h-2 rounded-full bg-[#c9a55a]" />}
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
              disabled={voicePhase === "transcribing"}
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border transition-all touch-manipulation active:scale-95 disabled:opacity-40"
              style={
                voicePhase === "recording"
                  ? { background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)" }
                  : voicePhase === "transcribing"
                  ? { background: "rgba(201,165,90,0.08)", borderColor: "rgba(201,165,90,0.2)" }
                  : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }
              }
              aria-label={voicePhase === "recording" ? "Stop" : "Record"}
            >
              {voicePhase === "transcribing" ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
              ) : voicePhase === "recording" ? (
                <div className="w-3.5 h-3.5 rounded bg-red-400/80" />
              ) : (
                <MicIcon />
              )}
            </button>

            <div className="flex-1">
              {voicePhase === "recording" && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  <p className="text-sm text-white/50">Listening… tap to stop</p>
                </div>
              )}
              {voicePhase === "transcribing" && <p className="text-sm text-white/35">Transcribing…</p>}
              {voicePhase === "idle" && (
                <p className="text-sm text-white/40">{text ? "Tap to re-record" : "Tap to speak your style"}</p>
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

          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. dark Nordic techno, or Afrobeats with jazz brass, or something that feels like driving at 3am…"
            rows={3}
            className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-white/70 placeholder-white/15 outline-none focus:border-white/20 transition-colors resize-none leading-relaxed"
          />

          {/* Interpret */}
          <button
            onClick={handleInterpret}
            disabled={!text.trim() || interpreting}
            className="w-full py-2.5 rounded-xl text-xs font-semibold tracking-widest uppercase transition-all touch-manipulation disabled:opacity-30 active:scale-[0.98]"
            style={{ background: "rgba(201,165,90,0.08)", border: "1px solid rgba(201,165,90,0.3)", color: "#c9a55a" }}
          >
            {interpreting ? "Interpreting…" : style ? "Re-interpret →" : "Interpret my style →"}
          </button>

          {/* Result */}
          {style && (
            <div>
              <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1.5">Interpreted style — tap to refine</p>
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
                  ? { background: "rgba(201,165,90,0.15)", border: "1px solid rgba(201,165,90,0.5)", color: "#c9a55a" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }
                }
              >
                {selected ? "✓ Using this style" : "Use this style"}
              </button>
            </div>
          )}
        </div>
      )}
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
