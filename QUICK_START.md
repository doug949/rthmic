# RTHMIC Quick Start

Last checked: 2026-06-05

## Doug Test

Ask this first:

```text
Do I need immediate visual feedback?
```

If yes, use local Codex on the Mac.

If no, cloud Codex is fine.

## Local Codex: Workshop Mode

Use this for building, visual work, and quick iteration.

```bash
cd /Users/dougsuiter/Documents/Claude/rthmic
git fetch origin
git status --short --branch
git pull --ff-only
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Typical local requests:

- Move this button.
- Fix this spacing.
- Change this animation.
- Test the onboarding flow.
- Adjust the mobile layout.

Before finishing:

```bash
npm run build
git status --short
```

Then:

```bash
git add -A
git commit -m "Short useful message"
git push origin main
```

## Cloud Codex: Remote Assistant Mode

Use this for work that does not depend on you seeing tiny UI details live.

Typical cloud requests:

- Map this repo.
- Investigate this bug.
- Refactor this component.
- Write documentation.
- Create a PR.
- Analyse logs or architecture.

Suggested cloud prompt:

```text
You are working in doug949/rthmic. Start from main. Make a small focused change, run the available checks, and explain the deployment impact. Do not touch secrets.
```

## Source Of Truth

- Repo: https://github.com/doug949/rthmic
- Branch: `main`
- Production: https://rthmic.app
- Local path: `/Users/dougsuiter/Documents/Claude/rthmic`

Anything important should end up in GitHub.

## First Five Minutes Of Any Session

Run:

```bash
git status --short --branch
git fetch origin
git status --short --branch
```

If you are behind and have no tracked local changes:

```bash
git pull --ff-only
```

If there are local changes, inspect them before pulling:

```bash
git diff
git status --short
```

## Do Not Panic Rules

- GitHub `main` is the canonical record.
- Vercel production is `rthmic.app`.
- Local is the workshop, not the only copy.
- Cloud is the assistant, not the only workflow.
- No manual upload should become the source of truth.
- If production is broken, fix or revert through Git.

## Useful Commands

```bash
npm run dev
npm run build
git log --oneline -5
git status --short --branch
vercel project inspect rthmic
vercel inspect rthmic.app
```
