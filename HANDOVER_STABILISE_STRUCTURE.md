# RTHMIC Stabilise Structure Handover

Created: 2026-05-22

## Current Safe Baseline

The live production app should remain on `main` until explicitly moved. At the time this handover was written, `main` was at:

- `b7cc6b2 Add In The Moment tile`

There are untracked local feedback/script/handover files in the repo. Treat them as local working context unless Doug explicitly asks to commit them.

## Backup / Cleanup Branch

The structural cleanup work has been isolated on:

- branch: `stabilise-structure`
- remote: `origin/stabilise-structure`

This branch has not been deployed to production and should be considered a candidate cleanup branch, not the current live recovery branch.

Commits on the branch:

- `e294d96 Stabilise app cache updates`
  - Service worker now only caches audio.
  - Manual update clears app caches but preserves offline audio.
  - Public assets such as `/images`, `/bg.jpg`, and `/apple-touch-icon.png` bypass proxy auth.
- `83c6aae Share generation completion logic`
  - Added `app/lib/generationCompletion.ts`.
  - Webhook and cron now share completed-generation save logic.
- `32cb434 Move saved rhythm type to domain types`
  - Added `app/types/library.ts`.
  - Moved `SavedRhythm` type out of the route module, with compatibility re-export.

## Verification Already Done

On `stabilise-structure`:

- `npm run build` passed after each commit.
- Focused eslint checks on changed files passed.
- Full `npm run lint` still fails because of pre-existing issues, mainly generated `.netlify` output and existing React lint rules.

## Why Work Paused

Doug reported a reliable live production generation failure: newly created songs enter the generating state, disappear quickly, and do not appear in the library under today's Rthms.

The priority is to restore the live `main` production app to base operational status before continuing structural cleanup.

## Suggested Next Cleanup Steps

When production is stable again:

1. Continue on `stabilise-structure`, not directly on `main`.
2. Re-test update flow, offline audio preservation, and app-shell caching on iPhone/Safari/PWA.
3. Finish extracting shared library-save logic away from route modules.
4. Consider a focused route/data boundary pass for:
   - normal Rthms
   - Rthmix albums
   - Menus
   - Bridge
   - Invite
5. Only merge/deploy after a clean production smoke test plan is in place.
