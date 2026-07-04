# Vortyx — Agent Notes

Multi-site publishing platform. `vortyx.dev` is the marketing site + `/admin`
panel; content sites live on subdomains (`pets.vortyx.dev`, …) served from one
static Astro build via a Host-header → `/sites/<key>/` Caddy rewrite.

## Stack

- Astro 7 (pure static, no SSR adapter) + React 19 islands
- Tailwind v4 via `@tailwindcss/vite` (CSS-first config in `src/styles/`, no tailwind.config)
- Convex Cloud for ALL backend logic (auth, CRUD, forge orchestration, crons)
- Content generated via the forge API (`https://forge.lindale.tech`) + optional markdown in `src/content/sites/<siteKey>/`
- Deployed to the shared VPS via PORCH (`@lindale/porch`); see `PORCH.md` once created

## Rules

- **Before writing any Convex code, read `convex/_generated/ai/guidelines.md`.**
  Those rules override training-data assumptions. Convex skills are vendored
  under `.claude/skills/`.
- **Convex read-limit discipline:** reactive admin queries must never return
  `body`/`bodyMarkdown`. Lists return metadata + excerpt; fetch full bodies via
  one-shot `get` queries. (mitch-dot-live once blew the 1GB/day read limit this way.)
- **Link-prefix duality:** site pages are built under `/sites/<key>/` but served
  at `<key>.vortyx.dev/`. All internal links on site pages MUST go through
  `siteHref()` in `src/lib/siteHref.ts`. Canonical/OG URLs always use
  `siteAbsoluteUrl()` (subdomain form). Never hardcode `/sites/...` hrefs.
- Reserved subdomain keys (not allowed as site keys): `www`, `admin`, `api`, `mail`, `forge`.
- Publishing content or adding/enabling a site triggers a full rebuild+deploy
  via GitHub `repository_dispatch` (`content-publish`).

## Local dev

```
npx convex dev        # terminal 1 — provisions dev deployment, writes .env.local
npm run dev           # terminal 2 — main site at /, sites at /sites/<key>/, admin at /admin/
npm run seed          # demo site + posts
```

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
