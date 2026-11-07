# Current state

Handoff log between agent sessions. Newest entry on top. See the
"Current-state log" rule in [`AGENTS.md`](../AGENTS.md) for the format.

---

- **Timestamp:** 2026-11-07T11:40:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** deploy moved to a **self-hosted runner on the ZAG
  host** (uncommitted, on `master`; commit `90919d5` before it still had
  the SSH/GHCR flow, whose first run failed with an empty
  `DEPLOY_SSH_KEY`):
  - `deploy.yml`: `detect` stays on `ubuntu-latest`; `deploy-web` and
    `deploy-server` run on `self-hosted`. Web: build → rsync into
    `/srv/zag/releases/<sha>` → `chmod -R u=rwX,go=rX` → atomic symlink
    `/srv/zag/ui` (a hand-made real dir is moved to `releases/manual-<ts>`),
    keep current + 4. Server: local `docker build` → `zag-server:<sha>` +
    `:latest` → `docker compose -f deploy/docker-compose.yml up -d` →
    `/health` wait → `docker rmi` old tags + `docker image prune -f`.
    No SSH, no GHCR, no secrets; only var `VITE_SOCKET_URL`.
  - `deploy/docker-compose.yml`: `name: zag`, image `zag-server:${SERVER_TAG}`,
    used from the checkout (not copied to the host). `deploy/README.md`:
    runner install as user `deploy`; `docs/monorepo.md`
    § 5–7 synced. `deploy/nginx/zag.conf`: `open_file_cache` dropped (stale
    fds after symlink switch).
  - First run on the real runner (`expo`, user `expo`, commit `0b9ba2c`):
    workflow logic reached the host steps; both failed on host permissions
    — web: `mkdir: Permission denied` on `/srv/zag/releases`; server:
    `permission denied … /var/run/docker.sock`. `deploy/README.md` now
    targets user `expo` with the exact fix commands.
  - Second run (host perms fixed): web step installed the release and
    switched the symlink, then exited 1 silently — the prune pipeline
    `grep -vx "$RELEASE"` returns 1 when no other release exists
    (`set -o pipefail`). Fixed: prune is now non-fatal and runs after the
    result echo; simulated first-deploy + prune locally. Server: image
    built OK, `compose up` failed — `127.0.0.1:8080` already in use on the
    host by something outside project `zag` (network `zag_default` was
    created fresh).
  - Host port 8080 was taken by another service → server now published on
    `127.0.0.1:8090` (container port stays 8080): `deploy/docker-compose.yml`,
    `deploy/nginx/zag.conf` (`proxy_pass`), health check in `deploy.yml`,
    docs. `zag.conf` in git is now the certbot-processed host version
    (443 + 80→301); re-applied the `open_file_cache` removal and the
    `location = /health` proxy on top of it.
  - **Deploy confirmed working by the user** (web + server via the
    self-hosted runner, nginx on 443 → `/srv/zag/ui`, `/socket.io/` →
    `127.0.0.1:8090`).
  - `actions/checkout` and `actions/setup-node` bumped v4 → v5 in both
    workflows (Node 20 deprecation warning in runner logs).
- **Next step:** stage 2 of [`roadmap.md`](roadmap.md). Housekeeping
  when convenient: decide whether
  `deploy/**` + `deploy.yml` go into `turbo.json` `globalDependencies`
  so infra-only commits redeploy automatically (today: `Run workflow → all`).
- **Blockers / open questions:** if the repo is public, confirm the
  self-hosted runner is only used by `deploy.yml` (push to `master` /
  manual), never by PR workflows.

---

- **Timestamp:** 2026-11-05T13:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** stage 1 of [`roadmap.md`](roadmap.md) shipped
  (uncommitted, on `master`):
  - Monorepo: root `package.json` (npm workspaces, `packageManager`),
    `turbo.json`, `packages/config` (eslint Metarhia + typescript-eslint +
    react-hooks, tsconfig `base`/`node`/`react`), `packages/protocol`
    (§ 4 event names + payload types, `isValidUserId`; dual build:
    `dist/` CJS for the server via `require`, `dist/esm/` for Vite via
    `import` — Vite serves linked workspace packages as source, so a
    CJS-only build has no named exports in dev).
  - `apps/server`: `bootstrap.ts` (http + Socket.IO websocket-only +
    `/health` with live client count), `EAUTH` handshake check, JSON-lines
    logger (`pretty` outside production), `socket connected` /
    `socket disconnected` / `socket rejected` logs with socketId, userId,
    transport, ip (X-Forwarded-For), UA, origin, duration; `node:test`
    suite; multi-stage `Dockerfile` via `turbo prune`.
  - `apps/web`: Vite 8 + React 19 + `vite-plugin-pwa`, fontsource fonts
    (cyrillic confirmed), `SocketProvider` (`useSyncExternalStore` over
    socket flags: idle / connecting / connected / offline, `userId` in
    `localStorage`), stub screen on the Home layout (logo, hero, status
    pill, footer logos, build sha), PWA icons from `zag-short.png`.
  - CI/CD: `ci.yml` (`turbo --affected`), `deploy.yml` (detect →
    rsync + symlink for web, GHCR + compose for server, `workflow_dispatch`
    all/web/server), `deploy/docker-compose.yml`, `deploy/nginx/zag.conf`,
    `deploy/README.md` (host bootstrap + GitHub vars/secrets).
  - Verified: `turbo run lint typecheck test build` green; server smoke
    test through the Vite proxy (connect / EAUTH / disconnect logged);
    local `docker build` of the server image. **Not** verified: stub
    screen in a real browser (Chrome extension was offline), workflows on
    GitHub (nothing pushed yet).
- **Next step:** commit + push to trigger `ci.yml`; set up the host and
  `production` environment per `deploy/README.md`, then run `deploy →
  all`. Then stage 2: move `docs/backend/reference/*.ts` into
  `apps/server/src` and wire the full § 4 API.
- **Blockers / open questions:** `deploy/` as `@zag/deploy` package
  (monorepo.md § 7) still undecided — currently a plain folder, nginx /
  compose changes are applied by hand. Remote `master` still holds the
  pre-filter-repo history (force-push pending from the previous entry).

- **Timestamp:** 2026-11-05T12:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - `docs/estimate.md` and `docs/estimate.xlsx` purged from the whole
    local git history with `git filter-repo` (all commit SHAs after
    `228c602` changed; `origin` remote re-added). Pre-rewrite backup
    bundle is in the session scratchpad, not in the repo.
  - Uncommitted work (AGENTS.md, shared-modules.md, design-system.md,
    this file, new `docs/monorepo.md`) carried over untouched.
- **Next step:** force-push the rewritten `master` to `origin`
  (`git push --force-with-lease origin master`), then have every other
  clone re-clone; ask GitHub support to purge cached old commits if the
  files were sensitive.
- **Blockers / open questions:** force-push to shared `master` not done
  yet — needs the owner's go-ahead.

- **Timestamp:** 2026-11-05T00:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - Decision: **no Next.js at all.** New `docs/monorepo.md`: Turborepo +
    npm workspaces (`apps/web` React 19 + Vite + `vite-plugin-pwa`,
    `apps/server` Socket.IO, `packages/protocol`, `packages/config`),
    `turbo.json`, PWA/Workbox config, server Dockerfile via `turbo prune`,
    host layout (nginx on host, `/srv/zag/releases/<sha>` + symlink,
    `server` in compose on loopback), GitHub Actions `ci.yml`/`deploy.yml`
    with `turbo --affected` so only changed packages are checked/deployed.
  - `shared-modules.md` § 6/6.1/8, `AGENTS.md` (skills + stack sections),
    `design-system.md` fonts (fontsource instead of `next/font`),
    `estimate.md` updated to the new stack.
- **Next step:** Bootstrap the monorepo per `docs/monorepo.md` § 2–3:
  root `package.json` workspaces, `turbo.json`, `packages/config`,
  `packages/protocol` (types from `reference/socket-api.ts`),
  `apps/server` from `reference/`, `apps/web` Vite skeleton; then the two
  workflows.
- **Blockers / open questions:** `@fontsource-variable/unbounded`
  cyrillic subset; whether `deploy/` becomes a `@zag/deploy` package
  (`monorepo.md` § 7); unchanged CCS/TD questions from 2026-11-02.

---

- **Timestamp:** 2026-11-04T00:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - Documented the "no SSR" requirement: `docs/backend/shared-modules.md`
    § 6.1 (static export via `output: 'export'`, forbidden Next server
    features, build-at-start `ui-build` compose service writing to a
    host bind-mount `/srv/zag/ui`, host nginx `root`/cache/proxy config
    with `server` published on loopback only, CI checks); § 8 step 1
    updated; `AGENTS.md` got a "UI delivery — static export, no SSR" rule.
    Decision: nginx runs on the host, not in Docker.
- **Next step:** Bootstrap the repo per § 6.1 and § 8: Next.js app with
  `output: 'export'`, `server/` from `reference/`, `docker-compose` with
  `ui-build` + `nginx` + `server`.
- **Blockers / open questions:** unchanged from 2026-11-02 entry (CCS
  credentials, program ids, `SESSION_MS`, TD message names).

---

- **Timestamp:** 2026-11-02T10:40:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - Analysed `~/tv-tower-back` and `~/artisight-htv-sys-new/kutaisi-public`
    (server + both frontends); wrote `docs/backend/shared-modules.md`
    (comparison, defects found, decisions, Socket.IO and TouchDesigner
    protocols, env table) and `docs/backend/reference/*.ts` — unified
    CloudClient/FakeCloudClient, AppState, GeoFence, TouchDesignerClient,
    SessionQueue, config, Application, socket-api, bootstrap. `tsc --strict`
    clean; `reference/selftest.js` passes (real socket.io + ws servers).
  - `AGENTS.md`: rule to reuse `docs/backend/reference/` for the server.
- **Next step:** Bootstrap the repo (Next.js app + `server/` process from
  `reference/`), then screens per `docs/design/frames.md`.
- **Blockers / open questions:** CCS credentials, `projectUID`, state
  group and program ids for ZAG (Expolight); semantics of the `schedule`
  flag; confirm `SESSION_MS` (40 s) and `SESSION_GAP_MS`; TouchDesigner
  message names to agree with the TD operator.

---

- **Timestamp:** 2026-11-01T18:10:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - `docs/design/` completed from verified Figma data: `design-system.md`
    (colors, 4 palettes, backgrounds incl. blur/filters, full type ramp
    with native sizes, Figma Glass vs liquid-glass card, buttons, lang
    switch, timer ring/badge, mode card, per-screen layout), `tokens.json`,
    `frames.md`, `screens/`, and `assets/` (logos, icons SVG, backgrounds,
    color wheel, mode previews, mission photos; 78 MB, raw sources + 1x renders).
  - Remote Figma MCP now works via the Pro-team copy
    `w3H4qazUL5GxhIm3MXnKzP` (same node ids); `AGENTS.md` updated.
    Figma file has no variables/styles; states are not designed.
- **Next step:** Bootstrap the Next.js app: `next/font` for Unbounded +
  Montserrat, CSS variables from `tokens.json`, `GlassCard`/`GlassPill`
  primitives, then screens in the order of `docs/design/frames.md`.
  Decide whether `assets/` raw sources (78 MB) move to `public/` or an
  image CDN; consider git LFS.
- **Blockers / open questions:** Button/selected states need designer
  input (proposals in design-system.md §7). Desktop stub and maintenance
  screen have no design.

---



- **Timestamp:** 2026-10-29T09:50:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - Figma access works through the local Dev Mode MCP (`figma-desktop`,
    `.mcp.json`); it serves the current selection and also answers
    `get_metadata` for page `0:1`. Remote Figma MCP still lacks edit access.
  - `AGENTS.md`: added mandatory-skill rules and the Figma MCP rule.
  - Wrote `docs/estimate.md`: screen inventory from Figma (53 frames), three
    interactives rated 3/3/4, work breakdown ≈300–450 h with assumptions and
    open questions.
- **Next step:** Get answers to the open questions in `docs/estimate.md`
  §6 (TouchDesigner protocol, cloud state service, proximity method), then
  bootstrap the Next.js app.
- **Blockers / open questions:** Rates/currency not provided, estimate is
  hours only. Branch `master` vs `main` still undecided.

---

- **Timestamp:** 2026-10-29T08:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:**
  - Set up agent instructions: `CLAUDE.md` imports `AGENTS.md`; `AGENTS.md`
    now has mandatory-skill rules (Next.js skill for all app code; GoF +
    metaskills for API code) and the handoff-log rule.
  - Installed skills: `gof-patterns`, `vercel-react-best-practices`
    (vendored, pinned in `skills-lock.json`), `metaskills` (npm dev
    dependency, symlinked into `.agents/skills/`).
  - Added `.gitignore`, this file, and the `origin` remote
    (`git@github.com:expccs/zag.git`, empty so far).
- **Next step:** Bootstrap the Next.js app (no application code exists yet)
  and replace the placeholder `test` script in `package.json`.
- **Blockers / open questions:** Local branch is `master`; the remote is
  empty, and PRs are expected to target `main`. Decide on the branch name
  before the first push (`git branch -M main`).
