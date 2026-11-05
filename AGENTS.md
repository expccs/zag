# Skills — mandatory per area of code

Skills live under [`.agents/skills/`](.agents/skills/). Read the relevant
`SKILL.md` **before** writing, reviewing, or refactoring code in its area;
do not rely on training-data defaults.

## Any application code (React)

Always apply
[`vercel-react-best-practices`](.agents/skills/vercel-react-best-practices/SKILL.md):
40+ performance rules under `rules/`, prioritized by impact (waterfalls
and bundle size are critical, then re-render hygiene, micro-optimizations).
The consolidated document is `AGENTS.md` inside that skill folder. The
project has **no Next.js**, so skip the rules that only exist for it:
`server-*`, `async-api-routes`, `rendering-hydration-*`, and anything
built on `next/dynamic` or `next/image` (use `React.lazy` and plain
`<img>`/`<picture>` instead).

## API code (route handlers, server actions, services, data layer)

In addition to the rule above, apply both:

- [`gof-patterns`](.agents/skills/gof-patterns/SKILL.md) — language-agnostic
  reference for all 23 GoF patterns; start from `pattern-selection.md` when
  choosing a pattern for a design problem.
- [`metaskills`](.agents/skills/metaskills/) — Metarhia conventions, one
  skill per folder:
  - `js-conventions` — JS/TS style and naming
  - `error-handling` — error handling conventions
  - `js-gof` — GoF patterns in idiomatic JavaScript (pair with
    `gof-patterns` above: GoF for the *what*, `js-gof` for the *how*)
  - `data-structures`, `js-data-structures`,
    `metautil-data-structures` — choosing and implementing collections
  - `npm-publish` — only when preparing a package for release

`.agents/skills/metaskills` is a symlink into
`node_modules/metaskills/skills`. After a fresh `npm install` run
`npx metaskills antigravity` to recreate it. The other two skills are
vendored and pinned in `skills-lock.json`; do not hand-edit them.

# Figma MCP — source of truth for UI

Designs live in Figma. The project MCP config ([`.mcp.json`](.mcp.json))
registers `figma-desktop`, the Dev Mode MCP server of the Figma desktop
app at `http://127.0.0.1:3845/mcp`. **Use it for every task that
implements, reviews, or changes UI**: before writing a screen or
component, pull the design from Figma (`get_design_context`,
`get_screenshot`, `get_metadata`, `get_variable_defs`) and build to it;
do not invent layout, copy, colors, or spacing that the design already
defines. Load the `figma-design-to-code` skill (from the `figma` Claude
Code plugin) before calling `get_design_context`.

How this server behaves:

- It serves the **current selection in Figma Desktop**, and ignores the
  `fileKey` argument. The user must have the file open and the target
  frame selected. If a call returns "This resource couldn't be accessed",
  ask the user to open the file and select the frame, then retry — do not
  fall back to guessing the design.
- It is read-only (design context, screenshots, metadata, variables,
  motion, FigJam). It cannot create or edit designs.
- If the server is unreachable, Figma Desktop is not running; ask the user
  to start it. The remote Figma MCP (`plugin:figma:figma`,
  `https://mcp.figma.com/mcp`) works read-only on the ZAG files once the
  user authenticates via `/mcp`, and takes `fileKey` + `nodeId` directly
  (no selection needed). It is metered: the Starter plan has a monthly
  tool-call cap, so request small nodes, not whole screens, and never
  retry a call that timed out.

Extracted tokens live in [`docs/design/`](docs/design/): `design-system.md`
(colors, typography, liquid-glass component, buttons, per-screen layout),
`tokens.json`, `frames.md` (node-id index) and `screens/` (reference
screenshots). Read `design-system.md` before styling anything; go to Figma
for the exact frame you implement and for anything marked **[проверить]**.

Project design files:

- "Додаток ZAG" — `MXOBup4Ilaxy5WE8wRyevL` (mobile app screens, e.g.
  `8:3824` "Home UA"). Its Starter team has no MCP quota left; use the
  copy `w3H4qazUL5GxhIm3MXnKzP` in the Pro team "grif energy" (same node
  ids) for remote MCP calls.
- "ZAG Інтерактив на фасаді 2025" — `8EJBwH8nOkFYKZPRI7Su1z`

# Stack and delivery — monorepo, React PWA, no SSR

[`docs/monorepo.md`](docs/monorepo.md) is the source of truth for the
repository layout, build and deployment. Summary:

- Turborepo + npm workspaces: `apps/web` (React 19 + Vite +
  `vite-plugin-pwa`), `apps/server` (Socket.IO, code from
  `docs/backend/reference/`), `packages/protocol` (shared event types),
  `packages/config` (eslint/prettier/tsconfig presets).
- **No Next.js and no SSR.** The UI is static files built in CI and
  served by nginx installed on the host (`root /srv/zag/ui`). The only
  runtime process is `apps/server`, run via `docker compose` on the host
  and published on loopback only. All data reaches the browser through
  Socket.IO after the page loads.
- CI/CD (GitHub Actions, branch `master`) uses `turbo --affected` /
  `turbo ls --affected` to run checks and deploy **only the packages
  that changed** (and their dependents). Do not add `paths:` filters or
  per-app workflows; extend the `detect` job in `deploy.yml` instead.
- Shared Socket.IO types live only in `packages/protocol`; never
  duplicate them in `web` or `server`.

# Backend modules — reuse, do not reinvent

[`docs/backend/shared-modules.md`](docs/backend/shared-modules.md) is the
result of merging the server code of two earlier Expolight projects
(tv-tower-back, kutaisi-public). It fixes the CCS client (ExpoLight Cloud
Control System), application state flags, geo-fence, TouchDesigner client
and session queue, and defines the Socket.IO and TouchDesigner protocols
for ZAG. The typed, tested TypeScript lives in
[`docs/backend/reference/`](docs/backend/reference/). When bootstrapping
the server, copy those files instead of writing new ones; read the
document before changing any of them.

# Current-state log

Maintain [`docs/current-state.md`](docs/current-state.md) as a running
handoff note between agent sessions. At the **end of every working
session** (before reporting the task complete), prepend a new entry to the
top of the file with:

- **Timestamp** — ISO-8601 UTC of when the session ended (e.g.
  `2026-06-30T14:32:00Z`).
- **Agent / model** — which agent or model performed the work (e.g.
  `Claude Fable 5.1`).
- **What changed** — 1–3 bullets summarizing the files touched and the
  outcome (shipped feature, partial progress, investigation only).
- **Next step** — the single most useful thing the next session should
  pick up, or `none` if the work is finished.
- **Blockers / open questions** — anything a human needs to decide before
  the next step is viable; omit the line if there are none.

At the **start of every session**, read the top entry of
`docs/current-state.md` first so you inherit context from the previous
agent. Keep entries terse — this file is a handoff log, not a changelog;
older entries can be pruned once they no longer aid handoff.
