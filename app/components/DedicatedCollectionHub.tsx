"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { TransitionLink } from "@/app/components/TransitionLink";
import type { SavedRhythm } from "@/app/types/library";

type CollectionKind = "bridge" | "invite";

interface QueueJob {
  jobId: string;
  title: string;
  pillar: string;
  status: "pending" | "writing" | "generating";
}

interface DedicatedCollectionHubProps {
  kind: CollectionKind;
  title: string;
  eyebrow: string;
  intro: string;
  createLabel: string;
  libraryLabel: string;
  emptyCopy: string;
  icon: ReactNode;
  accent: string;
}

const PILLAR_BY_KIND: Record<CollectionKind, string> = {
  bridge: "Bridge",
  invite: "Invite",
};

export function DedicatedCollectionHub({
  kind,
  title,
  eyebrow,
  intro,
  createLabel,
  libraryLabel,
  emptyCopy,
  icon,
  accent,
}: DedicatedCollectionHubProps) {
  const [rhythms, setRhythms] = useState<SavedRhythm[]>([]);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [accessChecked, setAccessChecked] = useState(kind !== "invite");
  const [allowed, setAllowed] = useState(kind !== "invite");
  const pillar = PILLAR_BY_KIND[kind];

  useEffect(() => {
    if (kind !== "invite") return;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setAllowed(!!data.access?.capabilities?.invite))
      .catch(() => setAllowed(false))
      .finally(() => setAccessChecked(true));
  }, [kind]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const [libraryRes, queueRes] = await Promise.all([
          fetch("/api/library", { cache: "no-store" }),
          fetch("/api/queue-jobs", { cache: "no-store" }),
        ]);
        const libraryJson = libraryRes.ok ? await libraryRes.json() : { rhythms: [] };
        const queueJson = queueRes.ok ? await queueRes.json() : { jobs: [] };
        if (cancelled) return;
        setRhythms(libraryJson.rhythms ?? []);
        setJobs(queueJson.jobs ?? []);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [allowed]);

  const active = useMemo(
    () => rhythms.filter((r) => r.pillar === pillar && r.status !== "deleted" && r.status !== "archived"),
    [rhythms, pillar]
  );
  const activeJobs = jobs.filter((job) => job.pillar === pillar);
  const latest = active.slice(0, 3);

  if (!accessChecked) {
    return (
      <main className="min-h-dvh px-6 pb-20 text-white page-enter">
        <div className="mx-auto max-w-xl">
          <AppHeader title={title} titleIcon={icon} />
          <section className="flex min-h-[60vh] items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
          </section>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-dvh px-6 pb-20 text-white page-enter">
        <div className="mx-auto max-w-xl">
          <AppHeader title={title} titleIcon={icon} />
          <section className="flex min-h-[60vh] items-center justify-center text-center">
            <p className="text-sm text-white/45">Rthmic Invite is private for admin testing.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 pb-20 text-white page-enter">
      <div className="mx-auto max-w-xl">
        <AppHeader title={title} titleIcon={icon} />

        <RevealBlock delay={80}>
          <section
            className="rounded-2xl border p-5 overflow-hidden"
            style={{
              borderColor: `${accent}66`,
              background: `linear-gradient(145deg, ${accent}24, rgba(255,255,255,0.035))`,
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="shrink-0 grid place-items-center rounded-xl"
                style={{
                  width: 54,
                  height: 54,
                  color: accent,
                  background: `${accent}18`,
                  border: `1px solid ${accent}42`,
                }}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: `${accent}cc` }}>{eyebrow}</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-wide">{title}</h1>
                <p className="mt-3 text-sm leading-relaxed text-white/55">{intro}</p>
              </div>
            </div>
          </section>
        </RevealBlock>

        <RevealBlock delay={170}>
          <div className="mt-5 grid grid-cols-1 gap-3">
            <TransitionLink
              href={`/speak?pillar=${kind}`}
              className="flex items-center justify-between rounded-2xl border px-5 py-4 active:scale-[0.99] transition-transform"
              style={{ borderColor: `${accent}55`, background: `${accent}12` }}
            >
              <span>
                <span className="block text-sm font-semibold tracking-wide" style={{ color: accent }}>{createLabel}</span>
                <span className="mt-1 block text-xs text-white/38">Start a new {kind === "bridge" ? "Bridge" : "Invite"} Rthm</span>
              </span>
              <span className="text-2xl leading-none" style={{ color: `${accent}aa` }}>+</span>
            </TransitionLink>

            <TransitionLink
              href={`/library/my-rthms?collection=${kind}`}
              className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.035] px-5 py-4 active:scale-[0.99] transition-transform"
            >
              <span>
                <span className="block text-sm font-semibold tracking-wide text-white/80">{libraryLabel}</span>
                <span className="mt-1 block text-xs text-white/35">
                  {loaded ? `${active.length} saved${activeJobs.length ? ` · ${activeJobs.length} generating` : ""}` : "Loading"}
                </span>
              </span>
              <span className="text-white/28">→</span>
            </TransitionLink>
          </div>
        </RevealBlock>

        <RevealBlock delay={260}>
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.22em] text-white/35">Latest</h2>
              {active.length > 3 && (
                <TransitionLink href={`/library/my-rthms?collection=${kind}`} className="text-xs uppercase tracking-widest text-white/30">
                  View all
                </TransitionLink>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {activeJobs.map((job) => (
                <div key={job.jobId} className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-3">
                  <p className="text-sm text-white/78">{job.title}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest" style={{ color: `${accent}b8` }}>{job.status}</p>
                </div>
              ))}
              {latest.map((rhythm) => (
                <TransitionLink
                  key={rhythm.id}
                  href={`/library/my-rthms?collection=${kind}`}
                  className="block rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 active:bg-white/[0.06]"
                >
                  <p className="text-sm text-white/78">{rhythm.title}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-white/28">{rhythm.status}</p>
                </TransitionLink>
              ))}
              {loaded && activeJobs.length === 0 && latest.length === 0 && (
                <p className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-5 text-sm leading-relaxed text-white/38">
                  {emptyCopy}
                </p>
              )}
            </div>
          </section>
        </RevealBlock>
      </div>
    </main>
  );
}
