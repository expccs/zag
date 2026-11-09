# `apps/server`: гексагональная архитектура и DI

Сервер разложен по принципу «порты и адаптеры». Ядро (`src/app`) не знает
ни о Socket.IO, ни о `node:http`, ни о CCS-клиенте: оно работает только с
интерфейсами-портами. Адаптеры (`src/infrastructure`) реализуют порты.
Единственное место, где одно встречается с другим, — композиционный корень
`src/bootstrap.ts`, который регистрирует граф зависимостей в контейнере
[tsyringe](https://github.com/microsoft/tsyringe).

```
apps/server/src/
├── app/                         # ядро: домен, порты, use cases
│   ├── domain/
│   │   ├── app-state.ts         # AppState<F>, ZagAppState, resolveScreen
│   │   └── session-queue.ts     # SessionQueue<T>, QueueError: очередь ходов (fade → session)
│   ├── ports/                   # интерфейс + его InjectionToken
│   │   ├── cloud-gateway.ts     # CloudGateway / CLOUD_GATEWAY, типы программ, CloudEmitter
│   │   ├── client-gateway.ts    # ClientGateway / CLIENT_GATEWAY: broadcast + notify* по userId
│   │   ├── session-api.ts       # SessionApi / SESSION_API (driving port), SessionError
│   │   ├── session-config.ts    # SessionConfig / SESSION_CONFIG: sessionMs, fadeMs, grace
│   │   ├── facade-gateway.ts    # FacadeGateway / FACADE_GATEWAY: команды и поток в TouchDesigner
│   │   ├── logger.ts            # Logger / LOGGER
│   │   └── app-info.ts          # AppInfo / APP_INFO: version, ccsMode
│   └── services/                # use cases, @injectable()
│       ├── state-sync-service.ts # CCS ⇄ AppState ⇄ клиенты
│       ├── session-service.ts   # очередь сеансов: request/cancel/touch, grace, abort
│       └── health-service.ts    # отчёт /health (+ sessions)
├── infrastructure/              # адаптеры портов
│   ├── ccs/                     # CloudClient, FakeCloudClient, CloudGatewayFactory, ccs-ids, CloudControls (кнопки = FacadeGateway)
│   ├── facade/composite-facade.ts # CompositeFacade: команды в TD и CCS, поток — только в TD
│   ├── socket/socket-server.ts  # ZagSocketServer implements ClientGateway; session:*, touch:event → SessionApi
│   ├── touch-designer/          # TouchDesignerClient (ws), OfflineFacade, FacadeGatewayFactory
│   ├── http/health-http-server.ts # HealthHttpServer, HTTP_SERVER
│   ├── logging/structured-logger.ts
│   └── config/config.ts         # ConfigLoader: env → ServerConfig, SERVER_CONFIG
└── bootstrap.ts                 # Application: регистрации tsyringe + lifecycle, точка входа
```

## Правило зависимостей

`app → ports` и только (плюс декораторы и `InjectionToken` из tsyringe).
`infrastructure → app` (реализует порты, берёт типы). `bootstrap` видит
всё. Правило закреплено в `apps/server/eslint.config.js` через
`no-restricted-imports` для `src/app/**`: запрещены
`**/infrastructure/**`, `bootstrap`, `socket.io`, `socket.io-client`,
`node:http`, `ws`. Тесты (`*.test.ts`) могут пересекать границу ради фейков
(`FakeCloudClient`).

Чтобы добавить внешнюю систему (TouchDesigner, геозона по IP и т.п.):

1. интерфейс и его токен в `app/ports/<port>.ts`
   (`export const X: InjectionToken<X> = Symbol('X')`),
2. адаптер в `infrastructure/<система>/`,
3. регистрация в `Application.createContainer` (`bootstrap.ts`):
   `useValue` для готовых значений, `useFactory` +
   `instanceCachingFactory(Application.provideX)` для адаптеров,
4. use case в `app/services/` с `@injectable()` и `@inject(TOKEN)` на
   каждом параметре конструктора; регистрируется `useClass` с
   `Lifecycle.ContainerScoped`.

## DI: tsyringe

- `reflect-metadata` импортируется первым в `bootstrap.ts` и в тестах,
  которые инстанцируют декорированные классы.
- `tsconfig.json` сервера включает `experimentalDecorators` и
  `emitDecoratorMetadata`. **Каждый** параметр конструктора всё равно
  помечен явным `@inject(token)`: интерфейсы в метаданные не попадают, а
  tsx/esbuild метаданные не эмитят — с явными токенами DI работает и в
  `dev`, и в тестах, и в сборке `tsc`.
- Токены — `Symbol`, типизированные как `InjectionToken<T>`, поэтому
  `container.resolve(CLOUD_GATEWAY)` возвращает `CloudGateway`, а
  `register(SERVER_CONFIG, { useValue })` проверяет тип значения.
  Классы (`ZagAppState`, `HealthService`, `StateSyncService`) служат
  токенами сами себе.
- `Application.createContainer(config, logger, version)` создаёт
  **дочерний** контейнер (`container.createChildContainer()`): один на
  процесс или на тест, ничего не оседает в глобальном. Адаптеры —
  ленивые синглтоны через `instanceCachingFactory`, use cases —
  `Lifecycle.ContainerScoped`.
- Подмена в тестах: `container.register(CLIENT_GATEWAY, { useValue: fake })`
  до первого `resolve` — последняя регистрация выигрывает
  (`bootstrap.test.ts`, «container overrides»).
- Цикл `httpServer → health → clients → httpServer` разорван ленивым
  колбэком: `/health` резолвит `HealthService` при каждом запросе.

## Жизненный цикл

`Application.main()` → `ConfigLoader.load()` → `createContainer` →
`start()`: `httpServer.listen`, `StateSyncService.start()` (подключение к
CCS в фоне с ретраями логина; на каждом событии `connect` — чтение группы
«App state» через `getPrograms` и `state.sync`; `state:update` всем
клиентам только когда публичное состояние реально изменилось).
`stop(signal)`: закрыть CCS, Socket.IO, http; `process.exit` по таймауту
5 с.

## Очередь сеансов

`SessionQueue<T>` (домен) — развитие `reference/session-queue.ts`: очередь
**ходов**. Ход — цепочка задач одного пользователя, которые идут встык:
`enqueue(turn)` принимает массив задач с одним `userId`; первая стартует
сразу, если очередь пуста. Пауз (`gapMs`) больше нет — их место заняла
задача `fade` (как `Fade` 5 с в tv-tower-back). События `start` /
`finish` на каждую задачу, `update` (по одному элементу на ждущего
пользователя, `{ userId, waitMs, position }`), `drain` — через
`queueMicrotask`, чтобы ack запроса ушёл раньше. `waitMs` — время до
старта последней задачи хода (сеанса); `position: 0` — ход уже идёт.
`remove(userId)` снимает все задачи пользователя и пропускает текущую,
если она его; `abort()` тихо сбрасывает ждущих (возвращает их `userId`)
и пропускает текущую задачу.

`SessionService` (use case, `SessionApi`):

- `request(userId, { mode, params })` → `ENOTALLOWED` вне `interactive`,
  `EBADMODE`, `EQUEUED`; иначе ставит ход `[fade(FADE_MS), session(SESSION_MS)]`
  с общим `sessionId` и отвечает `{ sessionId, waitMs, position, durationMs }`
  (`durationMs` — сеанс; `position: 0`, `waitMs ≈ FADE_MS` — отсчёт).
- `start(fade)` → TD `fade`, клиенту `queue:update { waitMs: FADE_MS, position: 0 }`;
  `start(session)` → TD `session:start`, клиенту `session:start`;
  `finish(session, *)` и `finish(fade, skipped)` → TD `session:end`,
  клиенту `session:end`; `finish(fade, completed)` — ничего, следом идёт
  сеанс; `drain` → TD `drain`.
- `cancel(userId)`; `handleTouch(userId, event)` — `true` только для
  пользователя текущего сеанса на шаге `session`; сервис считает фазу
  штриха (`begin` / `move` / `end` по `touch`, сбрасывается на старте и
  конце сеанса) и отдаёт точку в `facade.stream` (без буфера).
- `userDisconnected` / `userConnected` — grace `disconnectGraceMs`: место
  держится, пока не вернулась хотя бы одна вкладка; по истечении —
  `cancel`.
- `state.change` → `screen !== 'interactive'` → `abort()`: ждущие получают
  `session:end { skipped }` сразу, текущая задача — через очередь.
- `summary` → `/health.sessions: { active, waiting }`; `/health.facade:
  { connected, dropped }` — состояние TD и число отброшенных касаний.

`FacadeGateway` (порт) → два адаптера. `infrastructure/touch-designer`:
`TouchDesignerClient` (из `reference/touch-designer-client.ts`; адрес
`TD_DEFAULT_URL` = `ws://10.11.68.104:82`, бесконечный реконнект раз в
5 с с одним предупреждением на обрыв, контроль pong) — клиент к
WebSocket-серверу TD, шлёт **только поток** `{ request: 'stream', payload: { type: 'stroke:*', point } }`
(`docs/touchdesigner-setup.md` § 2), команды на этом сокете не
отправляет; при пустом `TD_WS_URL` — `OfflineFacade` (команды в лог).
Выбор — `FacadeGatewayFactory.create(config.facade, logger)`. Команды
идут через CCS: если `groupID` кнопок не пуст (константа
`CCS_CONTROLS_GROUP_ID`, env может обнулить), `Application.provideFacade`
оборачивает рендерер в `CompositeFacade` вместе с `CloudControls`
(`infrastructure/ccs`): тот же порт поверх `CloudGateway.execCommand`,
`fade` / `session:start` → кнопки `WITH_PARAMS` с JSON сеанса,
`session:end` / `drain` → кнопки `COMMAND` «Session end» / «Idle».
`Application.start` вызывает `connect()`, `stop` —
`close()`.

`ZagSocketServer` держит `Map<userId, Set<Socket>>`: `notify*` доходят до
всех вкладок пользователя, `userDisconnected` вызывается, когда закрылась
последняя. `SessionApi` передаётся адаптеру ленивым геттером
(`sessions: () => container.resolve(SESSION_API)`), иначе цикл
`ClientGateway → SessionService → ClientGateway`.
