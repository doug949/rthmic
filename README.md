# rthmic

You are **not starting from scratch** — this guide is for picking up your existing rthmic project in a cloud-based workflow and getting momentum back quickly.

## Where we are now

GitHub is connected, so the next move is deployment. Treat the first deploy as a **staging deploy**: prove the app builds in the cloud, add the needed secrets, then promote it to production only after the main pages work.

## Quick restart (existing project)

If rthmic has slowed down and you just want it running again, do this first:

```bash
git status
git pull --rebase
npm ci
npm run dev
```

Then open the cloud preview URL (usually port `3000`) and test one key page first (for example `/studio`).

---

## Deploy now with GitHub + Vercel

Vercel is the lowest-friction deployment path for this existing Next.js app.

1. Go to **Vercel → Add New Project → Import Git Repository**.
2. Select the GitHub repository for `rthmic`.
3. Keep the detected framework as **Next.js**.
4. Keep these commands unless Vercel already fills them in:
   - Install command: `npm ci`
   - Build command: `npm run build`
   - Output directory: leave blank / default
5. Add the environment variables listed below in **Project Settings → Environment Variables**.
6. Click **Deploy**.
7. Open the generated Vercel URL and test `/`, `/studio`, `/library`, and `/settings`.

### Required production secrets

Add these before expecting the full app to work:

- `RTHMIC_SESSION_TOKEN` — private login/session token.
- `RTHMIC_CODES` — invite/access codes, usually comma-separated.
- `REDIS_URL` — Redis database URL for sessions, queues, notes, shares, and logs.
- `OPENAI_API_KEY` — OpenAI generation features.
- `ANTHROPIC_API_KEY` — Anthropic generation features.
- `SUNO_API_KEY` — music generation/status features.
- `WASABI_ACCESS_KEY_ID` — Wasabi audio storage access key.
- `WASABI_SECRET_ACCESS_KEY` — Wasabi audio storage secret.

Optional but useful:

- `RESEND_API_KEY` — feedback email delivery.
- `RTHMIC_FROM_EMAIL` — sender address for feedback email.
- `ADMIN_KEY` — admin feedback lookup key.
- `CRON_SECRET` — protects cron-style maintenance routes.
- `RTHMIX_ONLY_TRACKS` — optional feature flag for RTHMIX track filtering.

Do **not** commit these values to GitHub. Store them only in Vercel/GitHub/cloud secrets.

### After each deploy

Use this quick smoke test:

```bash
npm run build
```

Then verify these pages on the deployed URL:

- `/` opens.
- `/studio` opens.
- `/library` opens.
- `/settings` opens.
- A login/access-code path works if the deployment is private.

---

## Cloud-first setup (for ongoing work)

### 1) Choose where you will work

Recommended options:

- **GitHub Codespaces** (best if repo is on GitHub)
- **Gitpod**
- **Replit**
- **VPS + VS Code Remote SSH**

If you want the least friction, start with **Codespaces**.

### 2) Install and run in that environment

```bash
npm ci
npm run dev
```

If install fails, try:

```bash
npm install
npm run dev
```

### 3) Set environment variables (critical)

Do **not** commit secrets to Git. Store them in your cloud provider/project secrets.

Common locations:

- Codespaces: **Repository Settings → Secrets and variables**
- Vercel / Netlify: **Project Settings → Environment Variables**

After changing secrets, restart `npm run dev`.

---

## Keep moving fast without constant branching

Default rhythm:

1. Keep one main working branch (`main` or one dedicated `dev` branch).
2. Make small, frequent commits.
3. Auto-deploy that branch to staging.
4. Branch only when a change is risky, very large, or needs pre-merge review.

### Fast checkpoint commands

```bash
git add -A
git commit -m "checkpoint: short note"
git push
```

---

## Deployment model that preserves speed

- **Staging**: deploy every push from your working branch.
- **Production**: promote only when staging looks good.

This keeps iteration fast while reducing breakage risk.

---

## Practical next step (right now)

1. Import the GitHub repo into Vercel.
2. Add the environment variables above.
3. Deploy once to staging/preview.
4. Test `/`, `/studio`, `/library`, and `/settings`.
5. If it works, promote that deployment to production.
