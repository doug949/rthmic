# RTHMIC – Handoff Document
*Session: 0.7 complete → starting 0.8*
*Written: 14 May 2026*
*Project path: `/Users/dougsuiter/Documents/Claude/rthmic`*

---

## Session Summary (0.7 Work)

This session rebuilt the Rthmic generation and structure system around a menu-first architecture. Key deliverables:

- Rthmic Menus (Structure page) — time-of-day menus with per-slot generation, history, and "New Style" re-generation
- GenerationContext reworked to handle both library saves and menu-slot saves with routing
- Settings page merged with Rthm Styles (genre voice recorder, 4 tabs)
- Home page card layout finalised (7 cards + hamburger)
- Pillar catalog on /speak reorganised into collapsible sections with ADHD-mode gating
- Suno V5 integration with vocalist preference read server-side

---

## Project Overview

**Rthmic** is a Next.js PWA (App Router, "use client" throughout) where users speak about how they feel, pick a pillar (emotional context), and receive two personalised songs generated via Suno AI.

- **Deployed:** `rthmic.vercel.app` (Vercel, auto-deploys on `git push origin main`)
- **Framework:** Next.js App Router, TypeScript strict mode, Tailwind CSS
- **External APIs:** sunoapi.org (Suno V5), OpenAI Whisper (transcription)
- **Persistence:** Redis on RedisLabs — creds in Vercel env vars and `.env.local` (never commit)
- **No accounts.** Auth is invite-code based.

### Auth System

- Cookie `rthmic_session` (httpOnly) — session token compared against `RTHMIC_SESSION_TOKEN` env var
- Cookie `rthmic_uid` — derived from invite code via SHA-256, used as Redis key namespace
- Cookie `rthmic_code` — JS-readable display of the invite code
- Codes stored as `RTHMIC_CODES` env var (comma-separated), or as `beta-code:{code}` Redis keys if issued via `/request-access`

### Local Dev

```
RTHMIC_CODES=<comma-separated invite codes>
RTHMIC_SESSION_TOKEN=<session token value>
REDIS_URL=<redislabs connection string>
SUNO_API_KEY=<sunoapi.org key>
OPENAI_API_KEY=<Whisper key>
```

Run: `npm run dev` (port 3000)
Type-check: `npx tsc --noEmit`

---

## Redis Key Schema

| Key | Value | Notes |
|-----|-------|-------|
| `lib:{uid}` | `SavedRhythm[]` | Personal library, all songs |
| `menu:{uid}:{slug}` | `SavedRhythm[]` | Menu history, newest first |
| `settings:{uid}` | `{ name, vocalist, adhdMode }` | User preferences |
| `beta-code:{code}` | exists | Issued invite codes |

`vocalist` values: `"none"` | `"male"` | `"female"`

---

## Key Types

### `SavedRhythm` (defined in `app/api/library/route.ts`, imported everywhere)

```typescript
export interface SavedRhythm {
  id: string;
  title: string;
  pillar: PillarType;
  audioUrl?: string;
  lyrics?: string;
  savedAt: number;
  status: "active" | "favourite" | "archived" | "deleted";
  sunoClipId?: string;
  sunoTaskId?: string;
  timedLyrics?: TimedWord[];
}
```

### `TimedWord` (defined in `app/types/pipeline.ts`)

```typescript
export interface TimedWord {
  word: string;
  startS: number;
  endS: number;
  success: boolean;
}
```

---

## Architecture

### Generation Flow

```
/speak → /api/start-generation (Suno V5, customMode:true)
       → poll /api/poll-generation every 5s
       → songs ready → auto-save to lib:{uid} or menu:{uid}:{slug}
       → background fetch /api/timed-lyrics → patch into library entry
```

### Global Contexts

**GenerationContext** (`app/contexts/GenerationContext.tsx`)
- Manages `genPhase`: `idle` | `generating` | `ready` | `failed`
- Holds `genSongs` (the two generated songs)
- Knows `menuSlug` — if set, saves to `menu:{uid}:{slug}` instead of `lib:{uid}`
- After generation completes, routes to `/structure/[slug]` (menu flow) or `/library` (standard flow)

**AudioContext** (`app/contexts/AudioContext.tsx`)
- Global audio player singleton
- Drives `currentTime` via 60fps `requestAnimationFrame` loop (not `timeupdate`)
- Used by MiniPlayer + FullScreenPlayer

### Library Mutation Sync

All components that mutate the library dispatch:
```typescript
window.dispatchEvent(new CustomEvent("library-mutated"))
```
List pages and FullScreenPlayer listen and re-fetch on this event.

### Suno API Details

- Endpoint via sunoapi.org v1
- Model: V5, `customMode: true`
- Style string: `{genre} + {vocalist pref if set} + ", fade out ending, resolving outro"`
- Style string truncated to 200 chars at last comma
- Vocalist preference read **server-side** in `/api/start-generation` from `settings:{uid}`
- Menu title format: `"{Menu Name} — {D Month YYYY}"` e.g. `"The Morning Menu — 14 May 2026"`

---

## Page Map

### `/` — Home

7 cards in order:

| Card | Colour | Icon | Destination |
|------|--------|------|-------------|
| Speak | Gold (#c9a55a) | Mic | `/speak` |
| Your Rthmic and Rthmix Catalog | Blue | Play | `/library` |
| Structure: Rthmic Menus | Teal | Menu lines | `/structure` |
| ADHD Toolkit | Rose | Brain | `/speak` |
| Settings | Purple | EQ bars | `/settings` |
| Share Feedback | Subtle | — | `/feedback` |
| About RTHMIC | Subtle | — | `/understand` |

Hamburger (top-right of home header): opens sheet with **Refresh Cache** + **Log out**. Lives in `app/page.tsx`. `PageFooter.tsx` returns `null`.

---

### `/speak` — Generation Flow

URL params: `pillar`, `seed`, `menuSlug`, `menuTitle`

Phases: `module → priming → idle → recording → understanding → confirming → genre`

**Pillar catalog (collapsible sections):**

- **"For you in the moment"** (gold, collapsible)
  - "Rthms that Unlock" → Mode, Movement, Explain
  - "Rthms that Prime" → Mindset
  - "Rthms that Preserve" → Journal, Epiphany
  - "Rthms that Install" → Memory, Book Summary
- **"For someone else"** (blue) → Bridge, Invite
- **ADHD section** (purple, only when `adhdMode === true`) → Rejection Spike (RSD), Time Panic, Launch
- **"Let RTHMIC decide"** — random pillar
- **The Vault** — static coming-soon card, 50% opacity, non-interactive

ADHD pillars have `adhdOnly: true` flag in the pillar definition.

---

### `/library` — Catalog

Sections in order:
1. My Rthms
2. My Favourites
3. The RTHMIC Library
4. Rthmix Albums
5. The Archive (bottom, collapsed by default)

---

### `/structure` — Menus List

Lists 5 time-of-day menus. Empty menu → triggers speak flow. Has songs → `/structure/[slug]`.

Has loading state (no skeleton yet — improvement pending).

---

### `/structure/[slug]` — Menu Detail

Shows for a given menu slot:
- Current Rthm(s)
- **New Style** button (same lyrics, new genre — currently hardcodes style "B")
- **Record New** button → back to /speak
- History of older versions (below fold)

---

### `/settings` — Settings + Rthm Styles (merged, purple)

- **Profile:** name input, vocalist preference (3-button: None / Male / Female), ADHD mode toggle
- **Styles:** 4 tabs (Power / Focus / Energy / Safety), each with voice recorder for genre description
- Auto-saves with 800ms debounce

---

### `/feedback` and `/understand`

Exist. Were not touched in session 0.7.

---

## Colour Palette

| Use | Colour |
|-----|--------|
| Speak / primary (Gold) | `#c9a55a` / `rgba(201,165,90,...)` |
| Catalog (Blue) | `rgba(100,140,255,...)` / `rgba(120,160,255,...)` |
| Structure / Menus (Teal) | `rgba(100,195,165,...)` |
| Settings / ADHD section (Purple) | `rgba(160,130,220,...)` / `rgba(180,150,240,...)` |
| ADHD Toolkit card (Rose) | `rgba(220,110,140,...)` |
| Secondary cards (Subtle) | `rgba(255,255,255, 0.28–0.6)` |

---

## Development Rules

- **Always `Read` a file before using `Edit`** — the Edit tool requires a prior read in the session
- TypeScript strict — run `npx tsc --noEmit` before committing
- Deploy = `git push origin main` (Vercel auto-deploys, no manual step)
- No automated tests — verify visually via preview on port 3000
- `AGENTS.md` / `CLAUDE.md` in repo root: read the Next.js docs in `node_modules/next/dist/docs/` before writing new Next.js code — this version has breaking changes from training data
- `SavedRhythm` type lives in `app/api/library/route.ts` — import from there, do not redefine
- `PageFooter.tsx` returns `null` — hamburger is in `app/page.tsx`

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `app/page.tsx` | Home page + hamburger menu |
| `app/speak/page.tsx` | Full generation flow, pillar catalog, all pillar definitions |
| `app/library/page.tsx` | Catalog with 5 sections |
| `app/structure/page.tsx` | Menus list |
| `app/structure/[slug]/page.tsx` | Menu detail |
| `app/settings/page.tsx` | Settings + Rthm Styles |
| `app/api/library/route.ts` | `SavedRhythm` type + library CRUD endpoints |
| `app/api/start-generation/route.ts` | Kicks off Suno generation, reads vocalist pref |
| `app/api/poll-generation/route.ts` | Polls Suno, attaches `sunoTaskId` to songs |
| `app/api/timed-lyrics/route.ts` | Fetches word-level lyric timestamps from sunoapi.org |
| `app/contexts/GenerationContext.tsx` | Global generation state + menu routing |
| `app/contexts/AudioContext.tsx` | Global audio player (60fps rAF) |
| `app/components/FullScreenPlayer.tsx` | Full-screen player + `FullLyricsView` karaoke |
| `app/types/pipeline.ts` | `TimedWord`, `Song` types |

---

## Starting Point for 0.8

Pending items in rough priority order:

1. **ADHD Toolkit home card** — currently routes to `/speak` (full page). Consider a dedicated `/adhd` page that shows only ADHD pillars without the full collapsible structure. Low lift, good UX improvement.

2. **Structure page skeleton** — loading state exists but shows no skeleton. Add a skeleton matching the menu card shape.

3. **Menu "New Style" — expose style choice** — currently hardcodes style "B" in the new-style generation call. Could surface a genre picker or let the user record a new style description.

4. **Lyric sync** — word-level karaoke was added in 0.7. User reported "a line out" — investigate `FullLyricsView` word→line distribution in `app/components/FullScreenPlayer.tsx`. Check browser console for `[timed-lyrics]` logs; if "no alignedWords" appears, the fallback is running. Also check tag-line filtering in `nonTagLines`.

5. **Stale menu Rthm in My Rthms** — a menu-generated song may have landed in My Rthms before the menu architecture was finalised. User is aware. No action needed unless it surfaces as a bug.

6. **Feedback and About pages** — `/feedback` and `/understand` exist but haven't been designed/built out. Future session work.
