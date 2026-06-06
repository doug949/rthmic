import type { PillarType, StateSummary } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";

export const INTERPRETATION_DRAFT_KEY = "rthmic:interpretation-draft";
export const INTERPRETATION_DRAFT_EVENT = "rthmic:interpretation-draft";

export interface InterpretationDraft {
  transcript: string;
  pillar: PillarType;
  stateSummary: StateSummary;
  title: string;
  lyrics: string;
  style: StyleChoice;
  savedAt: number;
}

export function saveInterpretationDraft(draft: Omit<InterpretationDraft, "savedAt">) {
  if (typeof window === "undefined") return;
  const payload: InterpretationDraft = { ...draft, savedAt: Date.now() };
  window.localStorage.setItem(INTERPRETATION_DRAFT_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(INTERPRETATION_DRAFT_EVENT, { detail: payload }));
}

export function readInterpretationDraft(): InterpretationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INTERPRETATION_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as InterpretationDraft) : null;
  } catch {
    return null;
  }
}

export function clearInterpretationDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(INTERPRETATION_DRAFT_KEY);
  window.dispatchEvent(new CustomEvent(INTERPRETATION_DRAFT_EVENT));
}
