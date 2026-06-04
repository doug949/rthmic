# RTHMIC System Map

Last checked: 2026-06-05

## Source Of Truth

RTHMIC's canonical source is GitHub.

- GitHub repo: https://github.com/doug949/rthmic
- Default branch: `main`
- Local workshop path: `/Users/dougsuiter/Documents/Claude/rthmic`
- Production Vercel project: `rthmic`
- Vercel project id: `prj_PXfugxsIUuNuFcVLKUvN1GZZux77`
- Vercel team/account context: `video4`
- Production URL: https://rthmic.app
- Production aliases: `www.rthmic.app`, `rthmic.vercel.app`, `rthmic-video4.vercel.app`, `rthmic-doug-2853-video4.vercel.app`

Rule: GitHub `main` is the canonical record. Do not treat local-only edits, manual uploads, or one-off cloud changes as the source of truth until they are committed and pushed.

## Current Deployment Shape

Production is deployed to Vercel through Vercel Git Integration. The Vercel dashboard shows project `rthmic` connected to `doug949/rthmic`, with production deployments coming from `main`.

This means the production path is:

```text
Local Codex or Cloud Codex
  -> GitHub main
  -> Vercel Git Integration
  -> rthmic.app
```

There should be no separate GitHub Actions deployment workflow unless a future task needs one for checks or release orchestration.

## App Shape

RTHMIC is a Next.js 16 App Router app with TypeScript and Tailwind v4.

Primary areas:

- `/` home and access entry
- `/studio` studio surface
- `/speak` recording, understanding, and generation flow
- `/rthmix` RTHMIX experience
- `/library` saved Rthms, archive, favourites, log
- `/structure` menu/time-of-day flows
- `/settings` user settings
- `/diagnostics` runtime diagnostics
- `/admin` and `/admin/backfill` admin utilities

Important folders:

- `app/api/` server route handlers
- `app/components/` shared UI components
- `app/contexts/` client-side generation and audio state
- `app/lib/` shared utilities and diagnostics
- `app/services/` AI/service orchestration
- `app/modules/` prompt/content modules
- `templates/` reusable prompt templates
- `docs/` supporting docs

## Key Services

- Anthropic Claude: lyrics, understanding, and AI interpretation
- OpenAI: transcription and supporting AI features
- Suno API: music generation and status polling
- Redis: sessions, library, menus, queues, settings, logs
- Wasabi/S3-compatible storage: audio storage/proxying
- Resend: optional feedback email delivery
- Vercel Cron: `vercel.json` runs `/api/process-queue` every minute

## Development Roles

Use local Codex when immediate visual feedback matters:

- UI spacing
- animation changes
- layout rearrangement
- onboarding and mobile flow testing
- colour and interaction polish

Use cloud Codex when remote delegation matters:

- repo mapping
- documentation
- architecture analysis
- refactors
- bug investigations
- pull requests
- crash/log analysis

## Safety Rules

- Start work by syncing from GitHub: `git fetch origin` then `git status --short --branch`.
- If local `main` is behind and you have no tracked local changes, run `git pull --ff-only`.
- Keep secrets out of Git. Use `.env.local`, Vercel environment variables, and GitHub Actions secrets only.
- Make small commits. Push when a change is worth preserving.
- Treat anything merged to `main` as production-bound.
