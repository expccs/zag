# План реализации ZAG по этапам

Решения от 2026-11-05. Стек и структура — [`monorepo.md`](monorepo.md),
серверные модули — [`backend/shared-modules.md`](backend/shared-modules.md),
дизайн — [`design/design-system.md`](design/design-system.md). Статус
этапов ведётся в [`current-state.md`](current-state.md).

| # | Этап | Результат | Статус |
|---|---|---|---|
| 1 | **Каркас + CI/CD** | Монорепо (Turborepo, npm workspaces), `@zag/config`, `@zag/protocol`; `apps/server` — Socket.IO + `/health`, лог открытия/закрытия клиентского соединения; `apps/web` — экран-заглушка и `SocketProvider`; `ci.yml`, `deploy.yml`, Dockerfile, `deploy/` (compose, nginx) | в работе |
| 2 | **Домен сервера** | Перенос `docs/backend/reference/*.ts` в `apps/server/src`: CCS-клиент, флаги состояния, геозона, очередь, TouchDesigner, полный Socket.IO API § 4; `selftest.js` → тесты; структурный логгер в Docker | в работе: `cloud-client.ts`, `app-state.ts` + `state:update`/`state:get`; гексагональная раскладка `app/` + `infrastructure/` + DI на tsyringe (`backend/server-architecture.md`); дальше геозона, очередь, TD |
| 3 | **Оболочка приложения** | Роутинг, UA/EN, шрифты, токены, компоненты glass, Home, Mission, экран «Touch & Create» — единственная точка, где открывается сокет (Home и Mission без соединения, § 6 `shared-modules.md`), на нём экраны по `state:update` (`maintenance` / `disabled` / `schedule`), «Зв'язок втрачено» | в работе: роутинг (`react-router`), `LanguageProvider` UA/EN, компоненты glass, Home, Mission, `/touch` с сокетом, подпиской на `state:update` и экранами `maintenance` / `disabled` / `schedule` / «Зв'язок втрачено» / список режимов (пока только «Комета», остальные два режима отложены); дальше — действия карточки режима (этап 4) |
| 4 | **Интерактив** | Режимы, инструкция, настройки (цвет / ширина / палитра), очередь-таймер, «поверніть телефон», отсчёт, рисование (`touch:event`), финал | — |
| 5 | **Запуск** | Геозона на клиенте, PWA-иконки и обновление, анти-абьюз, настройка хоста, живые CCS и TouchDesigner, staging при необходимости | — |

## Этап 1 — что входит

- Корень: `package.json` (workspaces), `turbo.json`, `.prettierrc.json`,
  `.env.example`, `.prettierrc.json`.
- `packages/config`: пресеты eslint (Metarhia + typescript-eslint,
  вариант для React), tsconfig `base` / `node` / `react`.
- `packages/protocol`: имена событий и типы payload'ов Socket.IO из § 4
  `shared-modules.md`, `PublicState`, флаги, экраны, правила `userId`.
- `apps/server`: `bootstrap.ts` (http + Socket.IO + `/health`), проверка
  `userId` в handshake (`EAUTH`), лог `connection` / `disconnect` с
  `socketId`, `userId`, транспортом, IP (из `X-Forwarded-For`), UA,
  длительностью. Доменной логики нет — этап 2.
- `apps/web`: Vite + React 19 + PWA; `SocketProvider` (`socket.io-client`,
  `autoConnect: false`, `userId` в `localStorage`, статус
  `connecting` / `connected` / `disconnected`); экран-заглушка на базе
  Home из дизайн-системы с индикатором соединения.
- CI/CD: `ci.yml` (lint / typecheck / test / build по `--affected`),
  `deploy.yml` (detect → `deploy-web` rsync + симлинк, `deploy-server`
  GHCR + compose; `workflow_dispatch` с выбором `web` / `server` / `all`).
- `deploy/docker-compose.yml`, `deploy/nginx/zag.conf`.

Не входит: CCS, геозона, очередь, TouchDesigner, i18n, роутинг — этапы
2–4.
