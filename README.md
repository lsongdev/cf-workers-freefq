# cf-workers-rocket

A **Trojan + VLESS proxy** running on Cloudflare Workers, with an admin panel for user management.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lsongdev/cf-workers-rocket)

## Features

- **Trojan & VLESS protocol support** over WebSocket
- **Admin dashboard** — create, enable/disable, and delete users via browser
- **D1 database** — persistent user storage with in-memory caching
- **Connection links** — generate client URLs for VLESS, Trojan, Clash, and Shadowrocket
- **UDP DNS proxying** — DNS (port 53) via Cloudflare DNS-over-HTTPS
- **Fallback proxy** — optional `PROXYIP` for retry on connection failure

## Prerequisites

- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/)
- [Cloudflare account](https://dash.cloudflare.com/) with Wrangler authenticated (`wrangler login`)
- A [D1 database](https://developers.cloudflare.com/d1/) created and bound to the worker

## Quick Start

```bash
pnpm install
cp .dev.vars.example .dev.vars   # edit with your secrets
pnpm run types                   # generate Worker types
pnpm run dev                     # start local dev server
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ACCESS_TOKEN` | Yes | Admin panel login password |
| `SESSION_SECRET` | Yes | Key for signing session cookies (64-char hex) |
| `PROXYIP` | No | Fallback proxy IP for retry on failure |

Set them via `wrangler secret put <NAME>` for production, or in `.dev.vars` for local dev.

## Commands

| Command | Description |
|---|---|
| `pnpm run dev` | Start dev server on `0.0.0.0:8787` |
| `pnpm run start` | Start dev server on `localhost:8787` |
| `pnpm run deploy` | Deploy worker to Cloudflare |
| `pnpm run deploy:production` | Run D1 migrations + deploy |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm run types` | Generate Worker types from `wrangler.jsonc` |

## Routes

| Route | Description |
|---|---|
| `GET /` | Redirects to admin panel |
| `GET/POST /admin/login` | Admin login |
| `GET /admin/logout` | Logout |
| `GET /admin` | Admin dashboard |
| `POST /admin/users` | Create user |
| `POST /admin/users/:id/toggle` | Enable/disable user |
| `POST /admin/users/:id/delete` | Delete user |
| `GET /trojan` | WebSocket Trojan proxy endpoint |
| `GET /vless` | WebSocket VLESS proxy endpoint |
| `GET /link/vless/:uuid` | VLESS connection URL |
| `GET /link/trojan/:uuid` | Trojan connection URL |
| `GET /link/clash/:uuid` | Clash YAML config |
| `GET /link/shadowrocket/:uuid` | Shadowrocket config |

## Database

Migrations are in `migrations/`. Apply them with:

```bash
wrangler d1 migrations apply rocket --local    # local dev
wrangler d1 migrations apply rocket --remote   # production
```

## Architecture

The worker uses the [Hono](https://hono.dev/) framework. Admin sessions are stored in D1 with SHA-256 hashed tokens and a 4-hour TTL. Proxy handlers authenticate users against D1 and pipe TCP traffic bidirectionally over WebSocket. User data is cached per-isolate with a 5-minute TTL and LRU eviction.
