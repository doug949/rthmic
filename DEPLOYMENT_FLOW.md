# RTHMIC Deployment Flow

Last checked: 2026-06-05

## Production Facts

- Production repo: `doug949/rthmic`
- Production branch: `main`
- Production Vercel project: `rthmic`
- Production URL: https://rthmic.app
- Framework: Next.js
- Vercel root directory: `.`
- Vercel Node.js version: `24.x`
- Vercel project id: `prj_PXfugxsIUuNuFcVLKUvN1GZZux77`

## Current Flow

Production uses native Vercel Git Integration:

```text
push to main
  -> Vercel detects GitHub push
  -> Vercel builds Next.js app
  -> rthmic.app
```

The Vercel dashboard shows `rthmic` connected to `doug949/rthmic`, with deployments coming from `main`.

The old GitHub Actions deploy workflow was removed so there is one deployment path instead of two competing systems.

## Local Development Flow

Use this when working on the Mac:

```bash
cd /Users/dougsuiter/Documents/Claude/rthmic
git fetch origin
git status --short --branch
git pull --ff-only
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

Before committing:

```bash
npm run build
git status --short
```

Commit and push:

```bash
git add -A
git commit -m "Describe the change"
git push origin main
```

## Cloud Codex Flow

Use this when away from the Mac or delegating non-visual work:

```text
Ask cloud Codex to inspect the repo.
Ask it to make a focused change.
Ask it to run build/type checks.
Ask it to open a PR or push a branch.
Review the diff.
Merge to main when ready.
```

Good cloud tasks:

- Investigate a bug.
- Refactor a component.
- Write docs.
- Summarise architecture.
- Prepare a PR.

Avoid using cloud Codex for visual tuning unless it can provide screenshots or a preview you trust.

## Smoke Test After Deployment

Check these after production deploys:

- `/` opens.
- `/studio` opens.
- `/rthmix` opens.
- `/speak` starts the intended flow.
- `/library` opens after access/login.
- `/settings` opens after access/login.
- `/diagnostics` shows the expected build/deployment id.

If production looks wrong:

1. Check the latest GitHub commit on `main`.
2. Check the latest Vercel deployment for `rthmic`.
3. Revert or fix through Git, not manual uploads.
