# Current state

Handoff log between agent sessions. Newest entry on top. See the
"Current-state log" rule in [`AGENTS.md`](../AGENTS.md) for the format.

---

- **Timestamp:** 2026-11-07T06:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** hardened the UI deploy into `/srv/zag/ui`
  (uncommitted, on `master`):
  - `deploy.yml` `deploy-web`: `mkdir -p` the release dir before rsync,
    `--chmod=D755,F644`, host script via `bash -s` heredoc; a pre-existing
    real `/srv/zag/ui` directory is moved to `releases/manual-<ts>` so the
    symlink switch (`mv -T`) cannot fail; asserts `index.html` before
    switching; prune keeps current + 4 and never touches the current one.
    Host script simulated locally (real-dir, switch+prune, missing index).
  - `deploy/nginx/zag.conf`: dropped `open_file_cache` (pinned fds of the
    old release for 60 s after a switch → new index.html + 404 assets);
    `server_name my.zag.com.ua` kept from the user's local edit.
    `docs/monorepo.md` § 6–7 and `deploy/README.md` synced.
  - **Not** verified: `nginx -t` (no nginx/Docker locally), workflow run
    on GitHub.
- **Next step:** commit + push; copy the new `zag.conf` to the host,
  `nginx -t && systemctl reload nginx`; run `deploy → all` and check the
  step log prints `/srv/zag/ui -> /srv/zag/releases/<sha>`.

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
