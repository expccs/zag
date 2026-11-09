# Current state

Handoff log between agent sessions. Newest entry on top. See the
"Current-state log" rule in [`AGENTS.md`](../AGENTS.md) for the format.

---

- **Timestamp:** 2026-11-09T15:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** Interactive-flow UI in `apps/web` (stage 4; uncommitted,
  on `master`). Copy and geometry pulled from Figma copy
  `w3H4qazUL5GxhIm3MXnKzP` via remote MCP (`use_figma` text dumps):
  - `/touch` is a layout route (`TouchScreen` → `Outlet`, notice gate);
    nested `ModesView` (3 cards → `/touch/:mode`), `InstructionsView`,
    `SetupView` (`ColorPicker` reads the wheel pixels, `WidthPicker`,
    `PalettePicker`), `session/SessionView` (`QueueView`, `RotateView`,
    `CountdownView`, `DrawingView` + `TrailCanvas` + `use-touch-stream`,
    `FinalView`, `LandscapeBar`). Shared `TouchChrome`, `GlassButton`,
    `.glass-card`, `BackLink` as button, `LangSwitch layout="row"`.
  - `socket/session-store.ts` (+ `useSession`): phases idle / queued /
    fade / active / ended from `session:request` ack, `queue:update`
    (`position: 0` = fade), `session:start`, `session:end`; local
    timestamps; re-request on reconnect; `cancel` / `reset` / `sendTouch`
    (volatile). Hooks `useOrientation`, `useSecondsUntil`.
  - i18n: all UA/ENG strings of modes, instructions (3 modes), setup,
    queue, fade, timer, final. Assets in `apps/web/public` (see
    design-system.md § 9). Typecheck / eslint / prettier / build green;
    headless-Chrome CDP walkthrough (scratchpad `walk.mjs`, UA + ENG)
    screenshotted every screen incl. landscape countdown and drawing.
  - Only «Комета» is shown for now: `ENABLED_MODES` in
    `interactive/modes.ts` filters the mode cards and guards
    `/touch/:mode` and `/touch/:mode/setup` (hidden modes redirect to the
    list); copy, pickers and trail code of the other two modes stay.
  - Drawing screen photo re-cut to the Figma `CROP` window of
    `Rectangle 5` (`47:5934`), `public/facade-bw.jpg` 1600 × 825, now
    under the whole stage with the bars on top (design-system.md § 9).
  - `touch:event` coordinates now have the origin in the bottom-left
    corner (`y` grows upwards, TouchDesigner UV); documented in the
    protocol type and shared-modules § 4 / § 5; the local trail flips
    back. Was top-left like Kutaisi's `TouchArea.jsx`.
  - Comet takes two colours: `params { head, tail }` (was `color`).
    `ColorPicker` has «Голова» / «Хвіст» glass pills above the wheel and
    two markers; the local trail draws only the tail colour (no head
    core on the phone, by request). Not in Figma (design-system.md § 11).
  - `docs/touchdesigner-setup.md` rewritten to the implemented protocol
    (direct WS, `fade` → `session:start` → `touch:event` → `session:end`
    → `drain`, no acks, bottom-left origin, `head` / `tail`); the old
    CCS-run / `stroke:*` scheme is gone.
  - `touch:event` trimmed to `{ x, y, touch }`: `swipe` / `direction`
    removed from the protocol type, server validation, web stream and
    docs (the facade does not need them).
  - CCS «Public app controls»: `infrastructure/ccs/cloud-controls.ts`
    (`CloudControls implements FacadeGateway`): `fade` / `session:start`
    → `WITH_PARAMS` buttons with `params: [JSON {mode, params,
    durationMs}]`, `session:end` → «Session end», `drain` → «Idle»
    (`COMMAND`); `infrastructure/facade/composite-facade.ts` fans commands
    out to TD + CCS (stream only to TD); wired in `provideFacade`. Group
    `_id` `6aef0c3e53257f190d66c477` and the four program ids come from
    `docs/backend/ccs-goups.json` (constants in `ccs-ids.ts`, env
    override, `offline:controls` offline, recorded by `FakeCloudClient`).
    Config `controls { groupID, programs }`, env `CCS_PROGRAM_*`;
    `ProgramReference.params` may hold strings. Tests: unit + e2e
    (11 button presses over 3 turns), config.
- **Next step:** try on real phones (orientation lock, pointer capture,
  fade timing of the trail), then commit stages 2–4; geo-fence remains.
- **Blockers / open questions:** the forward arrow on the landscape
  countdown (`31:2523`, x = 755) has no defined action — not rendered;
  no Figma frames for ENG rotate/countdown/final beyond 89:1915 /
  84:3543 / 89:1596 (used); selected state of width/palette cards is the
  § 7 proposal; `FADE_MS` 5 s and TD message names still to confirm.

---

- **Timestamp:** 2026-11-09T12:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** Fade task + TouchDesigner (stage 2; uncommitted, on
  `master`; shared-modules § 1.5 / § 4 / § 5 / § 7, server-architecture
  «Очередь сеансов»):
  - `SessionQueue` now queues **turns** (`enqueue(tasks[])`, one user per
    turn, tasks back to back, no `gapMs`); `waits()` is per user,
    `abort()` drops waiting turns and skips the current task. Every
    `SessionService.request` enqueues `[fade(FADE_MS=5000), session]`
    with one `sessionId`: fade start → TD `fade` + client `queue:update
{ waitMs: FADE_MS, position: 0 }` (countdown); session start → TD
    `session:start` + `session:start`; skipped fade → `session:end`
    like a session. Touches accepted only on the `session` step.
    `SESSION_GAP_MS` replaced by `FADE_MS` (`.env.example`, config).
  - New port `app/ports/facade-gateway.ts` (`FacadeGateway`,
    `FACADE_GATEWAY`, command / touch message types) and adapters
    `infrastructure/touch-designer/`: `TouchDesignerClient` (from
    reference, `ws` dep added), `OfflineFacade` (logs commands when
    `TD_WS_URL` is empty), `FacadeGatewayFactory`. Wired in
    `bootstrap.ts` (`connect` on start, `close` on stop); `/health.facade
{ connected, dropped }`; eslint forbids `ws` in `src/app`.
  - Tests: queue (6), service with `FakeFacade`, TD client against a
    `ws` server, bootstrap e2e asserts the exact TD message sequence
    (fade → session:start → touch → session:end → … → drain). 56 tests
    green; turbo typecheck + lint + build OK for protocol / web / server.
- **Next step:** geo-fence (port + adapter + `geo:check`), then commit
  stage 2; web side of the queue (countdown on `position: 0`) is stage 4.
- **Blockers / open questions:** TD message names (`fade`, `session:*`,
  `drain`) and `FADE_MS` = 5 s to confirm with the TouchDesigner
  operator; the `WITH_PARAMS` payload format of the CCS «Session start»
  button (one JSON string) to confirm with Expolight.

---

- **Timestamp:** 2026-11-09T10:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** Session queue on the server (stage 2; uncommitted, on
  `master`; server-architecture.md «Очередь сеансов»):
  - `app/domain/session-queue.ts` (from reference; fixed: cancelling the
    last waiting user during the gap no longer runs `undefined`, queue
    settles idle + `drain`), ports `session-api.ts` (`SessionApi`,
    `SessionError`, `SESSION_API`), `session-config.ts`; `ClientGateway`
    gained `notifyQueue` / `notifySessionStart` / `notifySessionEnd`.
  - `app/services/session-service.ts`: request / cancel / handleTouch
    gate / grace timers / abort on screen change; `summary` in `/health`.
  - `infrastructure/socket/socket-server.ts`: per-user socket map,
    `session:request` / `session:cancel` / `touch:event` handlers with
    payload validation, lazy `sessions: () => SessionApi` (breaks the
    ClientGateway ⇄ SessionService cycle). Config `session`
    (`SESSION_MS` 40000, `SESSION_GAP_MS` 5000, `DISCONNECT_GRACE_MS` 10000) + `.env.example`.
  - Tests: queue, service, socket routing / fan-out, end-to-end over
    Socket.IO in `bootstrap.test.ts` (3 clients, grace, tech pause abort,
    grace expiry). 50 tests green; `--test-timeout=20000` in the test
    script. Build + offline smoke OK.
- **Next step:** TouchDesigner port + adapter (`session:start` /
  `session:end` / `drain` commands, `touch:event` stream), then geo-fence;
  web side of the queue is stage 4.
- **Blockers / open questions:** CCS «Public app controls» buttons
  (`sessionStart` / `sessionEnd`, ccs-ids.ts) are not triggered on
  session start/end — confirm with Expolight whether CCS or TD owns that.

---

- **Timestamp:** 2026-11-09T08:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** `StateSyncService` now reads the CCS «App state» group
  on **every** `connect` event (first login, auto-reconnect, manual
  re-login after `io server disconnect` / rejected token). Before, the
  resync hung on the Manager `reconnect` event, which the manual re-login
  path never fires, so flags flipped during an outage were missed.
  `publish` skips broadcasts identical to the last published state (a
  resync that changes nothing stays silent). Test «re-reads the state
  group on every connect» added; 39 tests green. Promise chains in
  server code replaced with `async`/`await` + `try/catch` (user rule, see
  memory `no-promise-chains`): `StateSyncService.sync` / `connect`,
  `CloudClient.refresh` (re-login failure now logged instead of an
  unhandled rejection), `ccs-probe` entry. Docs: shared-modules § 2
  item 3, § 9; server-architecture lifecycle.
- **Next step:** verify against live CCS in `CCS_MODE=dry-run` (needs
  `CCS_LOGIN` / `CCS_PASSWORD` in `.env`; local `.env` is offline).

---

- **Timestamp:** 2026-11-09T07:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** `apps/server` re-laid out as hexagonal architecture
  with a DI container (uncommitted, on `master`; see
  `docs/backend/server-architecture.md`):
  - `src/app/` — `domain/app-state.ts`, ports `cloud-gateway.ts`
    (+ `CloudEmitter` base), `client-gateway.ts`, `logger.ts`, use cases
    `state-sync-service.ts` (CCS wiring / sync / broadcast moved out of
    `Application`) and `health-service.ts`.
  - `src/infrastructure/` — `ccs/` (`cloud-client.ts`,
    `fake-cloud-client.ts`, `cloud-gateway-factory.ts` with
    `createOfflineGroup`, `ccs-ids.ts`), `socket/socket-server.ts`
    (`implements ClientGateway`), `http/health-http-server.ts`,
    `logging/structured-logger.ts`, `config/config.ts`.
  - DI = tsyringe (user added `tsyringe` + `reflect-metadata`): typed
    `InjectionToken` symbols next to each port (`LOGGER`, `CLOUD_GATEWAY`,
    `CLIENT_GATEWAY`, `APP_INFO`) and contract (`SERVER_CONFIG`,
    `HTTP_SERVER`); use cases are `@injectable()` with explicit `@inject`
    on every parameter (no reliance on `emitDecoratorMetadata`);
    `bootstrap.ts` = `Application.createContainer` → child container,
    `instanceCachingFactory` adapters, `ContainerScoped` services;
    `tsconfig.json` has `experimentalDecorators` + `emitDecoratorMetadata`.
    Entry guarded by `require.main === module`. `eslint.config.js` forbids
    `src/app` → infrastructure / di / socket.io / node:http imports.
    Test glob quoted (`'src/**/*.test.ts'`) so nested tests run.
  - New tests: `app/services/state-sync-service.test.ts`,
    `bootstrap.test.ts` (whole offline graph via `/health` + port override
    with a fake). 38 tests green; lint, typecheck, build OK; built server smoke-tested offline.
- **Next step:** stage 2 continues on the new layout — geo-fence, session
  queue, TouchDesigner as new ports + adapters; stage 4 on the web side.

---

- **Timestamp:** 2026-11-08T10:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** Header logo is full-bleed (uncommitted, on `master`):
  `apps/web/src/components/zag-header.module.css` breaks the strip out of
  the centred column and its padding (`width: 100vw; margin-left:
calc(50% - 50vw)`), height follows the 374 × 34 aspect (≈ 36 px at 393)
  with a 48 px cap and `object-fit: cover`; `styles/global.css` adds
  `overflow-x: clip` on `body` so a desktop scrollbar does not add a
  horizontal one. Verified over CDP at 393 and 360 px on `/`, `/mission`,
  `/touch`: logo rect x = 0, width = viewport, `scrollWidth` = viewport.
  Native-app feel: viewport meta `maximum-scale=1, user-scalable=no`;
  `html, body` get `overflow-x: clip`, `overscroll-behavior: none`,
  `touch-action: pan-y` (vertical scroll only, no sideways pan, no
  double-tap zoom, no pull-to-refresh); `body` has `user-select: none` and
  `-webkit-touch-callout: none`; `img` gets `pointer-events: none`,
  `-webkit-user-drag: none` (no long-press «Save image», taps fall through
  to the surrounding link). `src/native-feel.ts` (called from `main.tsx`)
  blocks `gesturestart` / multi-touch `touchmove` (Safari tab ignores
  `user-scalable=no`) and `contextmenu` on coarse pointers.
  Proportional scaling (design-system.md § 1): `html { font-size:
min(calc(100vmin / 393 * 16), 17.92px) }` and every px in the web CSS
  modules converted to rem (px / 16, 144 values; footer logos sized in rem
  instead of HTML attributes). Verified over CDP at 320 / 360 / 393 / 430
  / 1200 px: root font and all measured heights scale by width / 393, cap
  holds at 1200.
- **Next step:** stage 4 — actions behind the «Комета» card.

---

- **Timestamp:** 2026-11-08T07:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** Touch & Create screen with the live server connection
  (uncommitted, on `master`):
  - `apps/web/src/screens/TouchScreen.tsx` (+ `touch/*`, lazy route
    `/touch`; Mission button now leads here): `connect()` on mount,
    `disconnect()` on unmount — the only place the socket opens. View is
    resolved from connection status first, then `PublicState.screen`:
    `lost` (offline / connect_error, frames `45:3440` / `47:3912` with the
    unplugged-cable SVG), `connecting` (first attempt), `schedule`
    (`45:3600` / `47:4007`, hours 18:00–22:00 from `SCHEDULE_HOURS` — the
    protocol has no hours field), `maintenance` / `disabled` (notice
    layout, texts are mine — no Figma frame), `interactive` → modes list
    `26:1957` / `47:4183` (liquid-glass card; only «Комета» is listed — the
    user deferred «Чумацький шлях» and «Палітра»; static until stage 4).
  - `src/socket/server-state-store.ts`: `useSyncExternalStore` over
    `state:update`; on every `connect` also `state:get`, so a change on the
    server re-renders the screen immediately (verified with a fake server
    via CDP: switch interactive → schedule → maintenance → disabled lands
    in < 5 ms; server kill → «Зв'язок втрачено» in 100 ms; server restart
    → recovered in 2.5 s). `connection-store.ts`: status `offline` for any
    drop after a successful connect except `disconnect()` from the app;
    `io server disconnect` (server restart) retries after 1 s because
    socket.io-client does not. `SocketProvider` exposes `state` and stable
    `connect` / `disconnect` (`useCallback`).
  - Assets: `public/bg-touch.jpg` (blurred `image 27` for the 393 × 852
    frames, recipe `docs/design/assets/images/bg-touch-blur-render.html`),
    `public/icons/no-connection.svg`, `public/modes/*.jpg` (300 px).
  - Headless Chrome `--screenshot` does not wait for WebSockets; the e2e
    check used a CDP script (Node `ws` + `Emulation.setDeviceMetricsOverride`
    393 × 852 @2x) against a fake Socket.IO server serving `dist/`.
- **Next step:** stage 4 — make the mode cards navigate to the
  instruction / settings screens and request `session:request`; geo-fence
  (`geo:check`) when `flags.locationRestriction` is on.
- **Blockers / open questions:** `maintenance`, `disabled` and `connecting`
  wording is not in Figma — needs the designer / client; schedule hours are
  hardcoded until the protocol carries them; UA Mission title still English
  in Figma `8:146`.

---

- **Timestamp:** 2026-11-08T09:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** documented the socket rule (user decision): the
  Socket.IO connection opens **only starting from the «Touch & Create»
  screen** (target of the Mission button); Home and Mission never connect,
  leaving that screen disconnects. Written into `shared-modules.md` § 6,
  `roadmap.md` stage 3, and the open question below is closed. Code is
  unchanged: `SocketProvider` is mounted with `autoConnect: false` and no
  screen calls `connect()` yet.
- **Next step:** add the `/touch` route (Touch & Create screen) that calls
  `connect()` on mount / `disconnect()` on unmount, point the Mission
  button at it, then the `state:update` screens on top of it.

---

- **Timestamp:** 2026-11-07T16:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** stage 3 started in `apps/web` (uncommitted, on `master`):
  - `src/i18n/`: `LanguageProvider` + `useLanguage()` (`uk` | `en`, stored
    in `localStorage` `zag:lang:v1`, default by `navigator.language`, sets
    `<html lang>`), typed dictionary `messages.ts` (Home, Mission body as
    paragraph/list blocks with bold runs). UA Mission text is my
    translation of the ENG frame `38:3029` — Figma has no UA frame.
  - `react-router` 8 (declarative `BrowserRouter`): `/` = `HomeScreen`
    (title, one button → `/mission`, lang pill), `/mission` =
    `MissionScreen` (lazy chunk; back arrow, lang pill, hero photo with
    title, text, 3 photos, «Touch & Create» → `/`, footer), `*` → `/`.
    `StubScreen` with the socket status is removed; `SocketProvider`
    stays mounted without `autoConnect`.
  - Components `ZagHeader`, `BrandFooter`, `LangSwitch` (toggle UA/ENG),
    `GlassLink` (`home` / `mission` variants), `BackLink`. Photos resized
    to 1000 px into `public/mission/`, `public/bg-interactive.jpg`.
    Checked with headless Chrome screenshots against the Figma render.
  - Typography verified layer-by-layer via remote Figma MCP (`use_figma`
    read-only on `8:3824`, `11:4392`, `38:3029`): every text has
    line-height AUTO (= CSS `normal`) and letter-spacing 0; sizes match
    (Unbounded ExtraBold 32 / Bold 33 / Regular 17.8 + 18.5, Montserrat
    14.8 body, 12.5 lang label). Fixes from that pass: Home titles carry
    the frame's line break («Створюй / світлом», «Create / with Light»),
    title→button gap 32, Mission text inset 39 / 20, second photo 260,
    footer logos 138 × 38 and 88 × 25 (design-system.md § 1 / § 6.2 still
    list the older 127 × 35 and 12.2 values). Backgrounds and photos are
    full-bleed on every viewport; only text, nav and buttons sit in the
    393 column (user request).
  - Interactive background: user supplied the sharp source
    (`docs/design/assets/images/bg-interactive-source.png`, 1080 × 1920).
    `apps/web/public/bg-interactive.jpg` (786 × 2600) is it rendered with
    the Figma layer geometry of `image 27` (519 × 1038 at −55/−76) and
    its Layer blur 73 (CSS blur 36.5), contrast 1.1, saturate 0.94 via
    headless Chrome — recipe in `bg-interactive-blur-render.html` next to
    the source; CSS maps it 1:1 (`100% auto`, top) with black below.
  - Mission texts re-read from Figma: `8:146` is the **UA** frame (385
    wide): body Montserrat 14 (→ 14.3 on 393) with bold «Благодійного
    фонду Козицького», empty lines between paragraphs (`gap` blocks),
    button «Доторкнись і твори», title kept in English «Mission &
    Philosophy» by the designer. `38:3029` is ENG. `messages.ts` now
    carries both verbatim; my earlier UA translation is gone.
- **Next step:** connect `state:update` screens (`maintenance` /
  `disabled` / `schedule`, «Зв'язок втрачено») behind an interactive
  route, then the interactive flow of stage 4.
- **Blockers / open questions:** UA Mission title is English in Figma
  `8:146` («Mission & Philosophy») — confirm with the designer. Decided
  2026-11-08: «Touch & Create» leads to the Touch & Create screen and the
  socket connects only from there (see the entry above).

---

- **Timestamp:** 2026-11-07T15:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** CCS ids are project constants (uncommitted, on `master`):
  - `apps/server/src/ccs-ids.ts`: `CCS_PROJECT_ID`, `CCS_STATE_GROUP_ID`
    (`6aef145253257f190d66c47b`), `CCS_STATE_PROGRAMS` (techPause =
    Maintenance `qduuwcanagbl`, interactive = Allow interactive
    `qxcsxqatyupx`, locationRestriction = Location restriction
    `azpuqosabwug`, schedule = Schedule `edbyrttglacr`),
    `CCS_CONTROL_PROGRAMS` (Session start `ospyruigxyop`, Session end
    `fwzxaqlwzwbu`). Mapping came from the user's `state.json` dump, moved
    to `docs/backend/ccs-state-group.json`.
  - `ConfigLoader`: `CCS_STATE_GROUP` / `CCS_PROGRAM_*` are now optional
    overrides of the constants (offline keeps `offline:*`). New
    `config.test.ts` (5 tests). `.env.example`, `ccs-ids.md`,
    `shared-modules.md` § 7 updated.
  - User decision: the project id is the constant `CCS_PROJECT_ID`
    (`676ed9a3108c970013dcb321`) — removed from `CloudCredentials`,
    `CloudConfig`, env (`CCS_PROJECT` gone) and docs; `CloudClient` still
    checks it against `/api/user/projects` at login.
- **Next step:** set `CCS_MODE=dry-run`, `CCS_LOGIN`, `CCS_PASSWORD` on the
  host `.env`, verify `state` in `/health` follows the CCS switches and
  that login accepts `CCS_PROJECT_ID` as the project (otherwise the error
  lists the account's projectUIDs). Then geo-fence, queue, TouchDesigner.
- **Blockers / open questions:** semantics of the "Schedule" switch
  (1 = outside schedule assumed); `_id` of the "Public app controls" group.

---

- **Timestamp:** 2026-11-07T14:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** server refactored to the OOP style the user asked for
  (rule recorded in `AGENTS.md`; uncommitted, on `master`):
  - No module-level functions in `apps/server/src` + `scripts`:
    `StructuredLogger` (was `createLogger`), `ConfigLoader.load` +
    private `EnvReader` (was `loadConfig`), `HealthHttpServer.create`,
    `ZagSocketServer` (`io`, `clientsCount`, `broadcastState`, `close`,
    `static resolveClientIp`), `CloudGatewayFactory.create` (was
    `createCloudGateway`), `CloudClient` helpers as static/private methods,
    `ZagAppState extends AppState<ZagFlag>` with `publicState` getter and
    `static resolveScreen` (was `resolveScreen` / `toPublicState`),
    `Application` composition root with `static main()` in `bootstrap.ts`,
    `CcsProbe.run()` in the probe script.
  - Tests follow (fake CCS is now `FakeCcsServer` class); added
    `CloudGatewayFactory`, `resolveClientIp`, 404 and broadcast tests —
    27 green. `turbo lint typecheck test build` green, offline smoke ok.
- **Next step:** unchanged — map the 3 STATE switches to flags
  (`docs/backend/ccs-ids.md`, `npm run ccs:probe`), then geo-fence,
  session queue, TouchDesigner, socket API § 4 — all as classes.
- **Blockers / open questions:** STATE has 3 switches vs 4 flags (see
  previous entry).

---

- **Timestamp:** 2026-11-07T13:30:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** stage 2 continued — `AppState` ported and wired
  (uncommitted, on `master`):
  - `apps/server/src/app-state.ts` from the reference: `AppState<F>`
    (`sync`, `apply`, `bind`, `reference`, `change`/`synced` events),
    `resolveScreen`, `toPublicState` (now `ZagAppState`). Tolerates `state: null` programs
    (CCS buttons). `config.ts`: `state` section (`CCS_STATE_GROUP`,
    `CCS_PROGRAM_*` required outside offline, `STATE_OVERRIDES`, SAFE vs
    OFFLINE initial). `bootstrap.ts`: bind to the gateway, resync on
    `connect`/`reconnect`, broadcast `state:update`, `state` in `/health`;
    offline fake CCS gets a state group from the config so `synced` is
    true. `socket-server.ts`: `state:update` on connect + `state:get`.
    `cloud-client.ts`: `ProgramStateChange.groupID?`, `CommandProgram.state`
    nullable, `createCloudGateway(config, logger, offlineGroups)`.
  - Tests: `app-state.test.ts` (7), socket `state:get` test; 23 total green.
  - `docs/backend/ccs-ids.md`: ids from the user's live `getPrograms` log —
    `projectID 676ed9a3108c970013dcb321`, buttons `ospyruigxyop` (Session
    start, WITH_PARAMS) / `fwzxaqlwzwbu` (Session end), STATE group
    `6aef145253257f190d66c47b` with programs `qxcsxqatyupx`,
    `edbyrttglacr`, `qduuwcanagbl`. The log was truncated: switch names →
    flag mapping and `projectUID` unknown.
  - The user's inline live-login probe at the end of `cloud-client.ts`
    (hard-coded password) was removed again; `npm run ccs:probe` replaces it.
- **Next step:** run `ccs:probe` (or ask the user for the full log) to map
  the three STATE switches to flags and get `projectUID`; fill
  `/srv/zag/.env` (`CCS_MODE=dry-run`) and verify `state` in `/health` on
  the host. Then geo-fence, session queue, TouchDesigner, socket API § 4.
- **Blockers / open questions:** STATE has 3 switches but the server
  expects 4 flags (`techPause`, `interactive`, `locationRestriction`,
  `schedule`) — which one is missing and should it be a 4th CCS switch or
  a `STATE_OVERRIDES` default?

---

- **Timestamp:** 2026-11-07T12:00:00Z
- **Agent / model:** Claude Fable 5.1
- **What changed:** stage 2 started — CCS client ported into the server
  (uncommitted, on `master`):
  - `apps/server/src/cloud-client.ts` from `docs/backend/reference/`:
    `CloudClient` (fetch login, socket.io `/users` + `path: /socket`,
    `joinRoom`, `getPrograms`, `execCommand` with dry-run), `FakeCloudClient`
    (offline), `createCloudGateway(config, logger)`; structured logger
    instead of `console`. Fix vs reference (back-ported to the reference
    file too): after `io server disconnect` and after a middleware token
    rejection socket.io does **not** reconnect by itself — client now
    re-logins and calls `socket.connect()` on the same socket.
  - `config.ts`: `cloud` section (`CCS_MODE` default `live`, `CCS_URL`,
    `CCS_LOGIN`/`CCS_PASSWORD` required outside offline; `CCS_PROJECT`
    later replaced by the `CCS_PROJECT_ID` constant).
    `resolveProject` always fetches `/api/user/projects` and requires the
    configured `projectUID` to be in it; empty list or unknown project →
    `CloudProjectError`, not retried, `connect()` rejects (user decision,
    replaces the reference's "first project" fallback).
    `bootstrap.ts`: gateway created at start, connects in the background
    with retries, events logged under `module: ccs`, `/health` reports
    `ccs: { mode, connected, projectUID }`, `close()` on shutdown.
    `socket.io-client` moved to runtime deps (Dockerfile prunes dev).
  - `cloud-client.test.ts`: 10 tests against a fake CCS (http + socket.io),
    see `shared-modules.md` § 9. `turbo lint typecheck test build` green;
    smoke: offline `/health` ok, live without creds fails fast with
    `ConfigError: CCS_LOGIN is required`, dry-run with unreachable CCS keeps
    serving and retries login with backoff.
  - Host `/srv/zag/.env` has `CCS_MODE=offline`, so the deploy keeps working
    without CCS credentials. `.env.example`, `deploy/README.md`,
    `roadmap.md` (stage 2 status), `shared-modules.md` § 1.1/§ 9 updated.
  - `apps/server/scripts/ccs-probe.ts` (`npm run ccs:probe -w @zag/server`):
    logs in with `CCS_*` from `.env` in dry-run and prints group/program
    `_id`s for `CCS_STATE_GROUP` / `CCS_PROGRAM_*`. The user has a CCS
    account (`zag`); a hard-coded probe with the password was removed from
    `cloud-client.ts` — credentials belong in the gitignored `.env`.
- **Next step:** run `ccs:probe` with the real account to get `projectUID`
  and ids, then continue stage 2 with `app-state.ts` (`AppState<ZagFlag>`
  bound to the gateway, `CCS_STATE_GROUP` / `CCS_PROGRAM_*`, `state:update`
  over Socket.IO), then geo-fence, queue, TouchDesigner.
- **Blockers / open questions:** CCS account, `projectUID`, group and
  program ids for ZAG are still needed from Expolight before `dry-run`/`live`
  can be tried.

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
