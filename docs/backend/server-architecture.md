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
│   │   └── app-state.ts         # AppState<F>, ZagAppState, resolveScreen
│   ├── ports/                   # интерфейс + его InjectionToken
│   │   ├── cloud-gateway.ts     # CloudGateway / CLOUD_GATEWAY, типы программ, CloudEmitter
│   │   ├── client-gateway.ts    # ClientGateway / CLIENT_GATEWAY
│   │   ├── logger.ts            # Logger / LOGGER
│   │   └── app-info.ts          # AppInfo / APP_INFO: version, ccsMode
│   └── services/                # use cases, @injectable()
│       ├── state-sync-service.ts # CCS ⇄ AppState ⇄ клиенты
│       └── health-service.ts    # отчёт /health
├── infrastructure/              # адаптеры портов
│   ├── ccs/                     # CloudClient, FakeCloudClient, CloudGatewayFactory, ccs-ids
│   ├── socket/socket-server.ts  # ZagSocketServer implements ClientGateway
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
`node:http`. Тесты (`*.test.ts`) могут пересекать границу ради фейков
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
CCS в фоне с ретраями логина, полный `getPrograms` при каждом
(ре)коннекте, `state:update` всем клиентам на каждое изменение флагов).
`stop(signal)`: закрыть CCS, Socket.IO, http; `process.exit` по таймауту
5 с.
