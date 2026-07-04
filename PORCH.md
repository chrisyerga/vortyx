# PORCH deployment — vortyx

Deployed to the shared VPS (droplet `zoey.lindale.tech`, SSH alias `milo`) via
[Porch](https://github.com/chrisyerga/porch) (`@lindale/porch`), behind the
shared Caddy edge.

## Service shape

- **service-id:** `vortyx`
- **kind:** static Astro build served by in-container Caddy
- **container:** `vortyx-web`, internal port `80`, external docker network `porch`
- **image:** `ghcr.io/chrisyerga/vortyx:<sha>`
- **deploy path:** `/opt/vortyx`
- **domains:** DYNAMIC — `vortyx.dev` (canonical) plus `<key>.vortyx.dev` for
  every enabled site in Convex. The deploy workflow resolves the list at deploy
  time via `node scripts/list-domains.mjs` (queries `sites:listDomains`) and
  passes it to `porch service register --domain ...`. Porch upserts a
  DigitalOcean DNS record and a Caddy site block per domain.

## Why deploys happen

1. Push to `main` / manual `workflow_dispatch`.
2. `repository_dispatch` type `content-publish` — fired by the Convex action
   `convex/deploy.ts:triggerSiteDeploy` whenever a post is published/unpublished/
   edited-while-published, or a site is created/enabled/disabled. This is how
   content changes reach the static build, and how new subdomains get
   registered (routing + DNS + TLS).

New subdomains: DNS propagation + ACME issuance can take a minute or two after
the deploy finishes.

## Pipeline (.github/workflows/deploy.yml)

1. `convex` job: `npx convex deploy --yes` (schema + functions first — the
   Astro build queries Convex).
2. `deploy` job (needs convex): npm build sanity check → resolve domain list →
   build+push GHCR image → SSH to the Porch host → `porch service register` →
   `docker compose restart caddy`.

## Required GitHub secrets

- `PUBLIC_CONVEX_URL` — production Convex deployment URL
- `CONVEX_DEPLOY_KEY` — production deploy key (Convex dashboard → Settings)
- `PORCH_HOST`, `PORCH_USER`, `PORCH_SSH_KEY` — SSH access to the Porch host

## Required Convex env vars (production: `npx convex env set --prod NAME value`)

- `ADMIN_PASSWORD` — admin panel login
- `GITHUB_DEPLOY_TOKEN` — PAT able to send `repository_dispatch` to this repo
- `GITHUB_REPO` — `chrisyerga/vortyx`
- `FORGE_API_KEY` — `forge_...` key from forge.lindale.tech
- `FORGE_API_URL` — `https://forge.lindale.tech`
- `FORGE_WEBHOOK_SECRET` — random string authenticating forge callbacks
- `FORGE_PROJECT_ID` — optional global fallback forge project id

## Local container smoke test

```bash
npm run build
docker build -t vortyx-local --build-arg PUBLIC_CONVEX_URL="$PUBLIC_CONVEX_URL" .
docker run --rm -p 8080:80 vortyx-local

curl -sI -H "Host: pets.vortyx.dev" http://localhost:8080/                 # 200 site home
curl -sI -H "Host: pets.vortyx.dev" http://localhost:8080/welcome-to-vortyx-pets/  # 200 article
curl -sI -H "Host: vortyx.dev"      http://localhost:8080/admin/sites/    # 200 admin
curl -sI -H "Host: www.vortyx.dev"  http://localhost:8080/                # 301 → https://vortyx.dev/
curl -sI -H "Host: nope.vortyx.dev" http://localhost:8080/                # 404 (404.html)
```
