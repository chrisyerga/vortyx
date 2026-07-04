# Vortyx

Multi-site publishing platform. **vortyx.dev** hosts a marketing landing page
and the `/admin` panel; content sites live on subdomains (`pets.vortyx.dev`,
`tech.vortyx.dev`, …), each with its own topic, theme, and articles — a mix of
AI-generated content (via [forge](https://forge.lindale.tech)) and hand-written
markdown.

## Architecture

**One static Astro build serves every host.** The main site is built at the
dist root; each content site is built under `dist/sites/<key>/`. The app
container's Caddy rewrites by Host header (`pets.vortyx.dev/foo` →
`/srv/sites/pets/foo`) with a single generic regex rule — adding a site needs
no server config, just a rebuild.

**All backend logic lives in Convex Cloud** — no separate backend service:

- `sites` / `posts` tables + admin CRUD (password → session-token auth, ported
  from mitch-dot-live)
- Content publishing schedules `convex/deploy.ts:triggerSiteDeploy`, which
  fires a GitHub `repository_dispatch` (`content-publish`) → the deploy
  workflow rebuilds the static site (mitch-dot-live pattern)
- Forge generation: `generationRequests` tracks `POST /v1/tasks` jobs
  (recipe `seo_article`). Status arrives via a webhook
  (`convex/http.ts` → `/forge/callback`, shared-secret in the callback URL)
  **and** a 2-minute polling cron (`convex/crons.ts`) — polling is the source
  of truth since forge webhooks are fire-and-forget
- Completed deliverables are reviewed in `/admin/generate` and accepted as
  draft posts, then published normally
- `researchTopics` / `keywordSuggestions` tables are schema-only for now —
  future background-research crons will populate them

**Deploys via PORCH** (see `PORCH.md`): the workflow resolves the domain list
dynamically from Convex (`scripts/list-domains.mjs`) because PORCH has no
wildcard-subdomain support — every enabled site's subdomain is registered
explicitly (routing + DigitalOcean DNS + TLS).

## Local development

```bash
npm install
npx convex dev          # terminal 1 — dev deployment, writes .env.local
                        # (ensure PUBLIC_CONVEX_URL=<CONVEX_URL> is in .env.local)
npm run seed            # demo sites + posts
npm run dev             # terminal 2
```

- Main site: `http://localhost:4321/` — site pages: `/sites/pets/` — admin: `/admin/`
- Set `ADMIN_PASSWORD` on the dev deployment: `npx convex env set ADMIN_PASSWORD <pw>`
- To exercise the generation flow without a real forge key:
  `npx convex env set FORGE_FAKE_SUBMIT true` (+ `FORGE_WEBHOOK_SECRET <secret>`),
  then simulate the callback with curl against
  `https://<dev>.convex.site/forge/callback?secret=...&requestId=...`

### The one rule that matters

Site pages are **built** under `/sites/<key>/` but **served** at
`<key>.vortyx.dev/`. Every internal link on a site page must go through
`siteHref()` (`src/lib/siteHref.ts`); canonical/OG URLs use `siteAbsoluteUrl()`.
Never hardcode `/sites/...` hrefs. Verify with:

```bash
npm run build && grep -r 'href="/sites/' dist/sites/ && echo LEAK || echo OK
```

### Container smoke test

See `PORCH.md` for the docker build + Host-header curl matrix.

## Environment inventory

| Where | Name | Purpose |
| --- | --- | --- |
| build/GitHub | `PUBLIC_CONVEX_URL` | Convex deployment URL (build-time prefetch + browser client) |
| GitHub | `CONVEX_DEPLOY_KEY` | `npx convex deploy` in CI |
| GitHub | `PORCH_HOST` / `PORCH_USER` / `PORCH_SSH_KEY` | SSH to the Porch host |
| Convex | `ADMIN_PASSWORD` | admin login |
| Convex | `GITHUB_DEPLOY_TOKEN` / `GITHUB_REPO` | repository_dispatch rebuild trigger |
| Convex | `FORGE_API_KEY` / `FORGE_API_URL` | forge API access |
| Convex | `FORGE_WEBHOOK_SECRET` | authenticates forge callbacks |
| Convex | `FORGE_PROJECT_ID` | optional global fallback forge project id |
| Convex | `FORGE_FAKE_SUBMIT` | dev only: skip real forge, fake task submission |

## Convex conventions

- Read `convex/_generated/ai/guidelines.md` before touching Convex code.
- Reactive admin queries never return `body` / `bodyMarkdown` — lists carry
  metadata + excerpts; full bodies come from one-shot `get` queries. (This
  class of bug once blew Convex's 1GB/day read limit on mitch-dot-live.)
- Reserved site keys: `www`, `admin`, `api`, `mail`, `forge`, `sites`.
