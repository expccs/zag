# Серверные модули ZAG: сведение kutaisi-public и tv-tower-back

Дата анализа: 2026-11-02. Исходники на машине разработчика:

| Проект                 | Путь                                                  | Назначение                                                | Последний коммит |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| tv-tower-back          | `~/tv-tower-back` (`src/service/*`)                   | Бэкенд телебашни Ереван: оплата, очередь анимаций, CCS    | 2026-10-07       |
| kutaisi-public         | `~/artisight-htv-sys-new/kutaisi-public/server/src/*` | Бэкенд инсталляции в Кутаиси: очередь, CCS, TouchDesigner | 2026-07-30       |
| tv-tower-ui            | `~/tv-tower-ui/src`                                   | Фронт телебашни (геолокация, state)                       | —                |
| kutaisi-public (фронт) | `~/artisight-htv-sys-new/kutaisi-public/src`          | Фронт Кутаиси (геолокация, touch)                         | —                |

Генеалогия: `state.ts`, `cloud-client.ts`, `geo-position-service.ts` и
`async-queue.ts` написаны в tv-tower-back (окт 2025 – дек 2025) и
скопированы в kutaisi-public в апреле 2026 почти без изменений. Kutaisi
добавил `WebSocketClient.ts` (TouchDesigner) и расширил очередь; tv-tower
после этого правил только геозону и флаг `EXEC_COMMANDS_ENABLED`. Общего
пакета нет, фиксы в одном проекте не попадали в другой.

Результат сведения лежит в [`reference/`](reference/): типизированные
модули на TypeScript, которые переносятся в серверную часть ZAG как есть.
Код проверен `tsc --strict` и сценарным тестом
[`reference/selftest.js`](reference/selftest.js) (см. §9).

---

## 1. Сравнение реализаций

### 1.1 CCS-клиент (ExpoLight Cloud Control System, `admin.expolightcontrols.net`)

| Аспект            | tv-tower-back                                                                                                                                              | kutaisi-public                                                                              | Унифицировано                                                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Учётные данные    | в коде `application.ts` (`cloudCreds`)                                                                                                                     | в коде класса (`login`, `password`, `project` захардкожены)                                 | учётка через env `CCS_LOGIN`, `CCS_PASSWORD`; id проекта — константа `CCS_PROJECT_ID` (`apps/server/src/ccs-ids.ts`)                                                                                                                                                                                                   |
| HTTP              | axios                                                                                                                                                      | axios                                                                                       | встроенный `fetch` (Node 20+), без зависимости                                                                                                                                                                                                                                                                         |
| Логин             | `POST /api/user/projects` → первый проект → `POST /api/user/app/auth`                                                                                      | то же                                                                                       | то же, но проект — константа `CCS_PROJECT_ID`, сверяется со списком `/api/user/projects`: пустой список или чужой `projectUID` → `CloudProjectError` без повторов логина                                                                                                                                               |
| Сокет             | `socket.io-client` на `/users`, `path: /socket`, websocket only, бесконечный reconnect 1–5 с                                                               | то же                                                                                       | то же                                                                                                                                                                                                                                                                                                                  |
| Подписка на state | `joinRoom` + `programStateChange` → событие `stateChange`                                                                                                  | то же                                                                                       | то же, но слушатель `programStateChange` регистрируется один раз, а не на каждом `connect`                                                                                                                                                                                                                             |
| `reconnect`       | слушается на `socket` — в socket.io v4 это событие **Manager**, на сокете не срабатывает (мёртвый код)                                                     | то же                                                                                       | `socket.io.on('reconnect')`                                                                                                                                                                                                                                                                                            |
| Истечение токена  | в `connect_error` вызывается `await this.connect()` — создаётся **второй сокет**, старый продолжает реконнектиться; ошибка логина даёт unhandled rejection | то же                                                                                       | `connect_error` (только при `socket.active === false`, т.е. отказ middleware) → один повторный логин с экспоненциальным backoff → обновление `socket.auth.token` + `socket.connect()`, сокет тот же. То же после `io server disconnect`: socket.io сам после него не переподключается (найдено тестом в `apps/server`) |
| Dry-run           | `EXEC_COMMANDS_ENABLED=false` внутри `execCommand`                                                                                                         | нет                                                                                         | опция `execEnabled` (`CCS_MODE=dry-run`)                                                                                                                                                                                                                                                                               |
| Dev-режим         | `CloudClientDev` при `NODE_ENV !== production` — всё равно ходит в сеть                                                                                    | `CloudClientDev` при `NODE_ENV === development` — та же логика, **противоположное условие** | `CCS_MODE=live \| dry-run \| offline`; `offline` = `FakeCloudClient` без сети с тем же интерфейсом `CloudGateway`                                                                                                                                                                                                      |
| Останов           | `disconnect()` снимает один слушатель                                                                                                                      | то же                                                                                       | `close()` снимает все слушатели сокета и менеджера                                                                                                                                                                                                                                                                     |

### 1.2 Состояние приложения (`State`)

| Аспект                  | tv-tower-back                                                            | kutaisi-public                                             | Унифицировано                                                                                           |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Флаги                   | `techPause`, `interactive`, `show`, `payment`, `locationRestriction`     | `techPause`, `interactive`, `pause`, `locationRestriction` | generic `AppState<F>`; для ZAG `F = techPause \| interactive \| locationRestriction \| schedule`        |
| ID программ CCS         | константы в коде                                                         | константы в коде                                           | env `CCS_PROGRAM_*` + `CCS_STATE_GROUP`                                                                 |
| Маппинг program → flag  | дублирован в `syncProjectState` и в `switch` обработчика                 | то же                                                      | один `apply(changes)` для начальной синхронизации и live-событий                                        |
| Чужое состояние         | State пишет напрямую в `geoService.isEnable` и `paymentService.isEnable` | то же для geo                                              | State ничего не мутирует; потребители читают `state.get('locationRestriction')`                         |
| Событие `change`        | при любом событии CCS, даже без изменения                                | то же                                                      | только если значение изменилось, с перечнем изменённых флагов; отдельное `synced` после первой загрузки |
| Dev-значения            | подкласс `DevState` с захардкоженным `getStates()`                       | подкласс `StateDev`                                        | env `STATE_OVERRIDES=interactive=true,locationRestriction=false`                                        |
| До первой синхронизации | флаги `false`, т.е. интерактив «выключен»                                | то же                                                      | `initial` из конфига: в `live` — безопасные (`techPause=true`), в `offline` — рабочие                   |
| Запись в CCS            | `runAppStateCommand` в Application (`params: [+value]`)                  | нет                                                        | `state.reference(projectUID, flag, value)` + `cloud.execCommand`                                        |

### 1.3 Геопозиция

| Аспект         | tv-tower-back                                                                           | kutaisi-public                                                       | Унифицировано                                                                     |
| -------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Расчёт         | библиотека `geopoint` + `// @ts-ignore`                                                 | то же                                                                | формула гаверсинуса (10 строк), без зависимости; расхождение с `geopoint` < 0.3 % |
| Радиус         | 50 м                                                                                    | 100 м                                                                | env `GEO_RADIUS_M` (по умолчанию 100)                                             |
| Центр          | **захардкожен** в `setAllowLocation` (координаты из логина CCS игнорируются)            | из логина CCS                                                        | из логина CCS, env `GEO_CENTER=lat,lng` переопределяет и блокирует                |
| Точность GPS   | клиент Кутаиси отправляет `accuracy`, сервер игнорирует                                 | —                                                                    | `accuracy` даёт допуск, ограниченный `GEO_ACCURACY_TOLERANCE_M` (30 м)            |
| Центр не задан | `distanceTo(undefined)` → TypeError                                                     | то же                                                                | ответ `{ allowed: false, reason: 'no-center' }`                                   |
| Ответ          | `boolean`                                                                               | `boolean`                                                            | `{ allowed, distanceM, reason }` — клиент может показать расстояние               |
| Протокол       | `geo` с ack `{ success }`                                                               | `checkGeoposition` → два события `goodPosition` / `badPosition`      | `geo:check` с ack                                                                 |
| Клиент         | `watchPosition`, `enableHighAccuracy: true`, только когда `locationRestriction` включён | `getCurrentPosition` каждые 5 с, `enableHighAccuracy: false`, всегда | как tv-tower-ui (см. §6)                                                          |

### 1.4 Клиент TouchDesigner

Есть только в kutaisi-public (`WebSocketClient.ts`, библиотека `ws`,
URL `EXTERNAL_WS_URL`, по умолчанию `ws://10.11.113.101:85`). tv-tower
управляет железом только через CCS. Для ZAG клиент нужен (смета A3).

| Аспект    | kutaisi-public                                                         | Унифицировано                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API       | колбэки в опциях                                                       | `EventEmitter` (`open`, `close`, `message`), как у CCS-клиента                                                                                                                             |
| Reconnect | фиксированный 1 с                                                      | экспоненциальный 1 → 10 с, сброс при успешном `open`                                                                                                                                       |
| Ping      | `ping()` каждые 30 с, pong не проверяется                              | если pong не пришёл до следующего ping — `terminate()` и reconnect                                                                                                                         |
| Отправка  | один `send()`; при разрыве сообщение теряется, лог на каждое сообщение | `stream()` для точек касания (при разрыве отбрасывается, счётчик `droppedCount`), `command()` для управляющих сообщений (буфер до 32, досылается после реконнекта); логов на сообщение нет |
| Формат    | плоский JSON `{ type, ... , timestamp }`                               | тот же стиль, `timestamp` добавляется только командам (§5)                                                                                                                                 |

### 1.5 Очередь сеансов (`AsyncQueue`)

| Аспект                       | tv-tower-back                                                                                                  | kutaisi-public                                                 | Унифицировано                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Пауза между пользователями   | фейковая задача `Fade` 5 с без `user`                                                                          | фейковая задача `fade` 15 с                                    | ход пользователя = цепочка задач `fade` (`FADE_MS`, 5 с) → `session`; `fade` уходит в TD, клиент видит отсчёт (`queue:update`, `position: 0`); пауз без задач нет |
| Удаление при дисконнекте     | `splice(index-1, 2)` — удаляет **соседнюю** задачу, если `Fade` не стоит перед ней (index 0 → `splice(-1, 2)`) | фильтр по `user.id`                                            | `remove(userId)`: ждущих — фильтром, текущего — `skipCurrent()`                                          |
| Прерывание текущего          | нет                                                                                                            | через внешние переменные `currentInteractiveNext` в `index.ts` | `skipCurrent()` внутри очереди                                                                           |
| Время ожидания               | сумма `duration` впереди + остаток текущей                                                                     | то же + `currentTaskFinishAfter()`                             | `placeOf(userId)`: остаток текущей задачи + задачи впереди (fade и сеансы); событие `update` для всех ждущих |
| Кратковременный разрыв связи | место теряется сразу                                                                                           | то же                                                          | grace-период `DISCONNECT_GRACE_MS` (10 с) в socket-слое                                                  |
| Порядок событий              | синхронно внутри `add()`                                                                                       | то же                                                          | `start`/`finish`/`update`/`drain` через `queueMicrotask`, чтобы ack на запрос уходил раньше push-событий |

---

## 2. Решение

Берётся архитектура tv-tower-back (DI через конструктор, `Application`
как композиционный корень, `EventEmitter` с типизированными событиями) и
функциональность kutaisi-public (TouchDesigner, прерывание текущего
сеанса, ответ по позиции в очереди). Устранены найденные дефекты:

1. Секреты и ID программ CCS вынесены в env.
2. Повторный логин в CCS не создаёт второй сокет.
3. Состояние группы «App state» читается (`getPrograms` → `state.sync`) на
   **каждом** событии `connect` сокета CCS: первый логин, авто-reconnect
   socket.io, ручной перелогин после `io server disconnect` или
   отвергнутого токена (последние два `reconnect` Manager'а не эмитят).
   Иначе пропущенные `programStateChange` теряются.
4. Сервер поднимается сразу, CCS подключается в фоне с backoff; до первой
   синхронизации отдаётся безопасное состояние (`techPause=true`).
5. Геозона не падает без центра, учитывает точность GPS, возвращает
   расстояние.
6. TouchDesigner: backoff, контроль pong, буфер команд.
7. Очередь без фейковых задач, корректное удаление, grace при разрыве.
8. Один режим dev (`CCS_MODE`), одинаковый в обоих слоях, без подклассов.

Зависимости сервера: `socket.io`, `socket.io-client`, `ws`. Убраны
`axios`, `geopoint`, `express`/`fastify` для health (достаточно `node:http`;
при появлении REST-эндпоинтов добавить Fastify, как в tv-tower).

---

## 3. Состав `reference/`

| Файл                       | Экспорт                                                    | Роль                                                                                                                 |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `cloud-client.ts`          | `CloudGateway`, `CloudClient`, `FakeCloudClient`, типы CCS | Логин, сокет, `getPrograms`, `execCommand`, события `login` / `connect` / `disconnect` / `reconnect` / `stateChange` |
| `app-state.ts`             | `AppState<F>`                                              | Флаги приложения ↔ программы CCS; `bind(cloud)`, `sync(groups)`, `apply`, `reference`                                |
| `geo-fence.ts`             | `GeoFence`, `haversineDistanceM`                           | Проверка расстояния до центра                                                                                        |
| `touch-designer-client.ts` | `TouchDesignerClient`                                      | WebSocket к TouchDesigner                                                                                            |
| `session-queue.ts`         | `SessionQueue<T>`, `QueueError`                            | Однополосная очередь сеансов                                                                                         |
| `config.ts`                | `loadConfig`, `ZagFlag`, `BackendConfig`                   | Разбор env, валидация                                                                                                |
| `application.ts`           | `Application`, `resolveScreen`, `AppError`                 | Композиционный корень: связывает всё выше, доменные методы                                                           |
| `socket-api.ts`            | `attachSocketApi`                                          | Обработчики Socket.IO (§4)                                                                                           |
| `bootstrap.ts`             | —                                                          | Точка входа: http + io + graceful shutdown                                                                           |
| `selftest.js`              | —                                                          | Сценарные проверки (§9)                                                                                              |

Схема связей:

```
CCS ──socket.io──▶ CloudClient ──stateChange──▶ AppState ──change──▶ Application ──state──▶ Socket.IO ──▶ клиенты
                        │ login                                          │
                        └──────────▶ GeoFence.setCenter                  ├── SessionQueue ──start/finish──▶ TouchDesignerClient.command
                                                                         └── handleTouch ─────────────────▶ TouchDesignerClient.stream
```

`Application.publicState` = `{ flags, screen, synced }`, где `screen`
вычисляется из флагов (`resolveScreen`):

| Условие        | `screen`      | Экран из Figma                      |
| -------------- | ------------- | ----------------------------------- |
| `techPause`    | `maintenance` | «Технические работы» (дизайна нет)  |
| `!interactive` | `disabled`    | «Интерактив выключен»               |
| `schedule`     | `schedule`    | 12 — график 18:00–22:00 (`45:3600`) |
| иначе          | `interactive` | рабочий сценарий                    |

Семантика `schedule` (флаг CCS «неправильное время») уточнить у Expolight:
если расписание считает CCS — флаг достаточен; если нет, добавить
локальную проверку времени в `resolveScreen`.

---

## 4. Протокол Socket.IO (клиент ↔ сервер ZAG)

Подключение: `io(url, { transports: ['websocket'], auth: { userId } })`.
`userId` — UUID, который клиент генерирует и хранит в `localStorage`
(как в Кутаиси, 8–64 символа). Невалидный `userId` → `connect_error`
с сообщением `EAUTH`.

| Направление                         | Событие           | Данные                                                            | Ответ (ack)                                                                                                                                                                     |
| ----------------------------------- | ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S→C при подключении и при изменении | `state:update`    | `PublicState`                                                     | —                                                                                                                                                                               |
| C→S                                 | `state:get`       | —                                                                 | `PublicState`                                                                                                                                                                   |
| C→S                                 | `geo:check`       | `{ latitude, longitude, accuracy? }`                              | `{ allowed, distanceM, reason }`; `reason`: `ok` / `too-far` / `no-center` / `invalid` / `disabled`                                                                             |
| C→S                                 | `session:request` | `{ mode: 'comet' \| 'milky-way' \| 'palette', params }`           | `{ success: true, sessionId, waitMs, position, durationMs }` или `{ success: false, code }`; `code`: `ENOTALLOWED` (экран не `interactive`), `EBADMODE`, `EQUEUED`, `EINTERNAL` |
| C→S                                 | `session:cancel`  | —                                                                 | `{ success: true, removed }`                                                                                                                                                    |
| S→C                                 | `queue:update`    | `{ waitMs, position }`                                            | —                                                                                                                                                                               |
| S→C                                 | `session:start`   | `{ sessionId, mode, durationMs, endsAt }`                         | —                                                                                                                                                                               |
| S→C                                 | `session:end`     | `{ reason: 'completed' \| 'skipped' }`                            | —                                                                                                                                                                               |
| C→S                                 | `touch:event`     | `{ x, y, touch: 0\|1, swipe: 0\|1, direction }`, `x`/`y` ∈ [0, 1], ноль в **левом нижнем** углу (UV: `y` растёт вверх) | —                                                                                                                                                                               |

Правила:

- Каждый запрос ставит в очередь **ход** из двух задач: `fade`
  (`FADE_MS`, 5 с — фасад анимирует переход к интерактиву, пользователь
  видит отсчёт) и сам `session` (`SESSION_MS`). `position: 0` означает, что
  ход пользователя уже идёт: фасад делает fade, сеанс начнётся через
  `waitMs` (это и есть отсчёт). Для ждущих `position` — число пользователей
  впереди, `waitMs` включает их fade и сеансы. В начале fade пользователь
  получает `queue:update { waitMs: FADE_MS, position: 0 }`, по его концу —
  `session:start`; push-события могут прийти **до** ack, поэтому клиент
  подписывается на `session:start` / `session:end` / `queue:update` до
  отправки запроса.
- `touch:event` обрабатывается только от пользователя текущего сеанса и
  только на шаге `session` (во время fade — отбрасывается), остальные молча
  отбрасываются. Серверного превью нет: TD получает поток,
  клиент рисует локально.
- При разрыве соединения место в очереди сохраняется
  `DISCONNECT_GRACE_MS`; если тот же `userId` вернулся раньше, таймер
  снимается. Текущий сеанс при истечении grace пропускается
  (`session:end` с `skipped` для остальных не отправляется, они получают
  `queue:update`).
- Отмена или обрыв во время своего fade завершает ход как сеанс:
  пользователь получает `session:end { skipped }`, TD — `session:end`.
- При переходе `screen` из `interactive` в любой другой очередь очищается,
  все участники получают `session:end { reason: 'skipped' }`.

---

## 5. Протокол TouchDesigner (сервер → TD, JSON по WebSocket)

Поток (`stream`, без буфера; `x`/`y` ∈ [0, 1], ноль в левом нижнем углу,
`y` растёт вверх):

```json
{
  "type": "touch:event",
  "sessionId": "…",
  "x": 0.4213,
  "y": 0.7712,
  "touch": 1,
  "swipe": 0,
  "direction": "none"
}
```

Команды (`command`, буферизуются до реконнекта, получают `timestamp` ISO):

```json
{ "type": "fade", "sessionId": "…", "mode": "comet",
  "params": { "color": "#FF4848" }, "durationMs": 5000, "timestamp": "…" }
{ "type": "session:start", "sessionId": "…", "mode": "comet",
  "params": { "color": "#FF4848" }, "durationMs": 40000, "timestamp": "…" }
{ "type": "session:end", "sessionId": "…", "reason": "completed", "timestamp": "…" }
{ "type": "drain", "timestamp": "…" }
```

Порядок на один ход: `fade` (TD за `durationMs` = `FADE_MS` переводит
фасад к интерактиву, как `Fade` в tv-tower / `fade` в Кутаиси) →
`session:start` (тот же `sessionId`) → поток `touch:event` →
`session:end`. Если ход отменён во время fade (cancel, grace, техпауза),
после `fade` приходит `session:end { reason: 'skipped' }` без
`session:start`. `drain` — очередь пуста, фасад возвращается к idle-шоу.
Между ходами пауз нет: следующий `fade` уходит сразу за `session:end`.
Типы в `apps/server/src/app/ports/facade-gateway.ts`.

`params` по режимам из дизайна: `comet` → `color` (hex из палитры),
`milky-way` → `width` (индекс ширины кисти 0–3), `palette` → `palette`
(индекс 0–3, см. `docs/design/design-system.md` §2). Формат совместим по
духу с Кутаиси (`events-documentation.md` там), но имена типов новые,
согласовать с оператором TD до интеграции.

---

## 6. Клиентская часть (React PWA, `apps/web`)

Стек и сборка — в [`docs/monorepo.md`](../monorepo.md). Переносится
подход tv-tower-ui, не Кутаиси:

- Один `SocketProvider` с `socket.io-client`, `autoConnect: false`.
  **Сокет открывается только начиная с экрана «Touch & Create»** (куда
  ведёт кнопка «Touch & Create» / «Доторкнись і твори» на Mission; в
  Figma — секция «СПОВІЩЕННЯ» и далее «Інтерактиви»). Home и Mission
  работают без соединения (как в Кутаиси `App.jsx`): ни `state:update`,
  ни индикатора связи на них нет. При уходе с «Touch & Create» назад на
  Home / Mission соединение закрывается (`socket.disconnect()`), чтобы
  читатели лендинга не держали сокеты и не занимали очередь.
- Геолокация: `navigator.geolocation.watchPosition(…, { enableHighAccuracy:
true })` запускается только когда `flags.locationRestriction === true`;
  каждая позиция уходит в `geo:check` с ack; `clearWatch` при размонтировании
  и при выключении флага. Ошибка с `code === 1` (запрет) → экран «вне зоны»
  с подсказкой включить геолокацию. Не опрашивать `getCurrentPosition`
  по таймеру.
- Касания (`screens/touch/session/use-touch-stream.ts`): Pointer Events на
  области фасада, нормализация в [0, 1] относительно неё с нулём в левом
  нижнем углу (`y = 1 − clientY/height`, как UV в TouchDesigner), `touch: 1` на
  старт и движение (движения не чаще 33 мс, `socket.volatile.emit`),
  `touch: 0` на отпускание со свайпом (`|Δx| ≥ 0.15` за ≤ 600 мс →
  `left` / `right`). Один палец. Локальный след рисуется на canvas
  (`TrailCanvas`): комета и Чумацький шлях гаснут за ~2 с, палитра держит
  две последние линии и перебирает цвета палитры.
- Поток экранов интерактива — вложенные роуты `/touch` (layout с сокетом и
  гейтом по `state:update`): `/touch` режимы → `/touch/:mode` инструкция →
  `/touch/:mode/setup` настройка → `/touch/session`. Последний рисуется из
  `SessionStore` (`socket/session-store.ts`): `queued` (круг с секундами
  до своего сеанса) → `fade` (портрет: «Початок через N» + подсказка
  повернуть телефон; ландшафт: большая цифра) → `active` (ландшафт:
  фасад ч/б + плашка «Таймер: mm:ss»; портрет: подсказка с таймером) →
  `ended` (`completed` → финал, `skipped` → назад к режимам). Таймеры
  считаются от локального `Date.now()` в момент события, `endsAt`
  сервера не используется. При реконнекте стор повторяет
  `session:request`: `EQUEUED` — место цело, новый билет — встали заново,
  иначе ход потерян. Стрелка «назад» в очереди и во время fade —
  `session:cancel`; уход с `/touch` сбрасывает стор и закрывает сокет.

### 6.1 Раздача UI: только статика, без SSR

Требование к продакшену: **ни один запрос браузера за UI не обрабатывается
Node**. Next.js в проекте не используется. `apps/web` — React PWA на Vite;
CI собирает её в `dist/` и выкладывает файлы в `/srv/zag/releases/<sha>`
на хосте, nginx на хосте раздаёт их с диска (`root /srv/zag/ui`) и
кэширует. Единственный рантайм-процесс — `apps/server` (`bootstrap.ts`:
Socket.IO + `/health`), он не раздаёт статику.

Как это обеспечивается:

1. Все данные — флаги состояния, очередь, геозона, язык — приходят в уже
   загруженное приложение через Socket.IO (§ 4). Ничего не запрашивается
   на сборке; UA/EN переключаются на клиенте, не по `Accept-Language`.
2. Единственная переменная сборки UI — `VITE_SOCKET_URL` (пустая = тот
   же origin, `/socket.io/` проксирует nginx). Вшивается в CI.
3. nginx: `/assets/` — `immutable`; `index.html`, `sw.js`,
   `manifest.webmanifest` — `no-cache`; `try_files $uri /index.html`;
   проксируются только `/socket.io/` и `/health` на `127.0.0.1:8090`.
   Полный конфиг, compose и CI — `docs/monorepo.md` § 6–7.
4. Проверка перед релизом: в `apps/web` нет серверного кода и
   зависимостей `next`, `express` и т.п.; в `deploy/docker-compose.yml`
   единственный сервис — `server`.

---

## 7. Переменные окружения

| Переменная                                                                                                      | Назначение                                                                    | По умолчанию                                                            |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `PORT`                                                                                                          | порт http/socket.io                                                           | `8080`                                                                  |
| `ALLOWED_ORIGINS`                                                                                               | CORS, через запятую                                                           | пусто                                                                   |
| `CCS_MODE`                                                                                                      | `live` / `dry-run` (читает состояние, не шлёт команды) / `offline` (без сети) | `live`                                                                  |
| `CCS_URL`                                                                                                       | адрес CCS                                                                     | `https://admin.expolightcontrols.net`                                   |
| `CCS_LOGIN`, `CCS_PASSWORD`                                                                                     | учётка приложения в CCS (обязательны вне `offline`)                           | —                                                                       |
| `CCS_STATE_GROUP`                                                                                               | `_id` группы программ «состояние приложения»                                  | `6aef145253257f190d66c47b` из `ccs-ids.ts` ([`ccs-ids.md`](ccs-ids.md)) |
| `CCS_PROGRAM_TECH_PAUSE`, `CCS_PROGRAM_INTERACTIVE`, `CCS_PROGRAM_LOCATION_RESTRICTION`, `CCS_PROGRAM_SCHEDULE` | `_id` программ-флагов                                                         | константы ZAG из `ccs-ids.ts`; в `offline` — `offline:<flag>`           |
| `STATE_OVERRIDES`                                                                                               | принудительные флаги, `interactive=true,schedule=false`                       | —                                                                       |
| `GEO_RADIUS_M`                                                                                                  | радиус зоны                                                                   | `100`                                                                   |
| `GEO_ACCURACY_TOLERANCE_M`                                                                                      | максимум допуска по точности GPS                                              | `30`                                                                    |
| `GEO_CENTER`                                                                                                    | `lat,lng`; переопределяет координаты из CCS                                   | из логина CCS                                                           |
| `TD_WS_URL`                                                                                                     | адрес TouchDesigner; пусто — TD отключён                                      | —                                                                       |
| `TD_PING_INTERVAL_MS`                                                                                           | интервал ping                                                                 | `30000`                                                                 |
| `SESSION_MS`                                                                                                    | длительность сеанса                                                           | `40000`                                                                 |
| `FADE_MS`                                                                                                       | задача `fade` перед каждым сеансом (отсчёт + переход фасада)                  | `5000`                                                                  |
| `DISCONNECT_GRACE_MS`                                                                                           | удержание места при разрыве                                                   | `10000`                                                                 |

Значения ZAG собраны в [`ccs-ids.md`](ccs-ids.md) и `apps/server/src/ccs-ids.ts`;
ничего из env задавать не нужно. В kutaisi/tv-tower эти значения смотрели через
`cloudClient.getPrograms()` после логина; для ZAG это делает
`npm run ccs:probe -w @zag/server` (читает `CCS_*` из корневого `.env`,
всегда в `dry-run`, печатает `_id` групп и программ).

---

## 8. Как использовать

1. При бутстрапе монорепы (`docs/monorepo.md`) положить `reference/*.ts`
   в `apps/server/src/`, `bootstrap.ts` — точка входа единственного
   рантайм-процесса. Типы событий из `socket-api.ts` вынести в
   `packages/protocol`, чтобы `apps/web` импортировал их оттуда.
2. `npm i socket.io socket.io-client ws` и `npm i -D @types/ws`.
3. `tsconfig`: `target ES2022`, `module nodenext`, `strict`; базовый — из `@zag/config`.
4. Для Metarhia-стиля (см. `.agents/skills/metaskills/js-conventions`)
   добавить `eslint-config-metarhia` и `prettier`; код уже в этом стиле
   (одиночные кавычки, 80 колонок, `error` в catch).
5. Локально без CCS и TD: `CCS_MODE=offline` — состояние рабочее, геозона
   выключена, команды логируются.

---

## 9. Что проверено

`tsc --strict --noUnusedLocals --noUnusedParameters` — без ошибок
(TypeScript 5.9, @types/node 20). `selftest.js` (запуск: `node selftest.js`
в каталоге с `node_modules`, где есть `ws`, `socket.io`,
`socket.io-client`; `geopoint` опционален) прогоняет:

- гаверсинус против `geopoint` на трёх расстояниях (< 0.3 %), допуск по
  точности, блокировка центра из env, ответы `invalid` / `no-center`;
- `AppState`: sync с чужой группой, частичный apply, отсутствие дублей
  `change`, overrides, `reference`;
- `SessionQueue`: ожидание с `gapMs`, `EQUEUED`, удаление ждущего,
  пропуск текущего, порядок `start/finish/drain`;
- `TouchDesignerClient`: буфер команды до подключения, отброс потока,
  падение сервера → reconnect → досылка буфера, ping/pong;
- `Application` + `socket-api` через реальный socket.io: `EAUTH`,
  `state:update`, `geo:check` при выключенной геозоне, очередь двух
  пользователей, маршрутизация `touch:event`, grace при реконнекте,
  `techPause` из CCS → `maintenance` + `session:end`, `ENOTALLOWED`,
  удаление по истечении grace.

`apps/server/src/app-state.test.ts` (node:test): initial до sync, sync с
чужой группой (warn), sync с пропуском чужих и stateless (`state: null`)
программ, overrides, дедупликация `change`, `reference`, `bind` к
`FakeCloudClient`, таблица `ZagAppState.resolveScreen`. В `apps/server`
код в OOP-стиле (см. `AGENTS.md`): `ZagAppState` (= `AppState<ZagFlag>` +
`publicState` + `static resolveScreen`), `CloudGatewayFactory.create`,
`ConfigLoader.load`, `StructuredLogger`, `HealthHttpServer.create`,
`ZagSocketServer`, `StateSyncService` (`app/services`): sync на каждом `connect`, рассылка только при реальном отличии состояния; `SessionQueue` + `SessionService` (§ 4: `session:request` / `session:cancel` / `touch:event`, `queue:update` / `session:start` / `session:end`, grace при разрыве, сброс при уходе со `screen: interactive`; сквозной тест в `bootstrap.test.ts`),
`state:update` всем сокетам на `synced`/`change`, `state:update` при
подключении и `state:get`, `state` в `/health`. Конфиг состояния лежит в
`config.state` (`groupID`, `programs`, `initial`, `overrides`), а не в
`cloud`, как в референсе.

`apps/server/src/cloud-client.test.ts` (node:test, фейковый CCS на
`node:http` + `socket.io`): логин с выбором проекта, backoff, `joinRoom`,
`getPrograms` / `runProgram`, dry-run, `programStateChange`, повторный
логин после `io server disconnect` и после отказа middleware по
устаревшему токену, `close()`.

Не проверено: живой CCS (нет учётки ZAG), живой TouchDesigner.

---

## 10. Открытые вопросы

- ID программ и учётка CCS для проекта ZAG; семантика флага `schedule`.
- Длительность сеанса: в дизайне 40 с, в Кутаиси 30 с на сеанс + 10 с
  сбора точек; подтвердить `SESSION_MS`. Fade перед сеансом — 5 с
  (`FADE_MS`, как в tv-tower), согласовать с оператором TD.
- Анти-абьюз: Кутаиси отключал сокет после 20 чужих `touch:event`; в
  унифицированной версии события отбрасываются молча. Добавить лимит, если
  появятся злоупотребления.
- Логирование: сейчас `console`; при деплое в Docker подключить `pino`
  через опцию `logger`.
