# TouchDesigner: що отримує фасад

TD тримає один WebSocket-сервер у локальній мережі фасаду —
`ws://10.11.68.104:82` (константа `TD_DEFAULT_URL` у Public app server,
`TD_WS_URL` перевизначає). Сервер підключається до нього сам і, поки TD
недоступний, повторює спробу кожні 5 с без обмежень: щойно TD підніметься,
з'єднання відкриється без перезапуску. Через нього приходять два види
повідомлень:

1. **Команди** — від ExpoLight CCS за стандартним протоколом пристрою
   `Touch` (у проєкті ZAG — пристрій «SR7 Facade Interactive»). Їх
   натискає Public app server кнопками групи «Public app controls»
   (`docs/backend/ccs-ids.md`), оператор може натиснути вручну.
2. **Потік точок** — напряму від Public app server окремим з'єднанням,
   поки триває сеанс малювання.

Розрізняти за полем `request`: `"run"` — команда, `"stream"` — точка.
Реалізація на боці сервера:
`apps/server/src/infrastructure/touch-designer/touch-designer-client.ts`
(потік) і `apps/server/src/infrastructure/ccs/cloud-controls.ts`
(кнопки CCS).

## 1. Команди (група `public_app`)

У нативному інтерфейсі TD має бути група `public_app` з чотирма
командами. CCS запитує їх список під час підключення, і до них
прив'язані чотири кнопки проєкту ZAG.

Відповідь на запит списку:

```json
→ { "request": "content", "payload": { "destination": "public_app" } }
← { "request": "content", "payload": { "destination": "public_app",
    "content": ["fade", "session_start", "session_end", "idle"] } }
```

| Команда         | Кнопка CCS                     | Коли приходить                                                                                | `params`                                                            | Що робити на фасаді                                                                                 |
| --------------- | ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `fade`          | Fade (`WITH_PARAMS`)           | хід користувача почався: через `durationMs` (5000) почнеться його сеанс, на телефоні відлік   | `[json]` — рядок `{ "mode", "params", "durationMs": 5000 }`         | анімація переходу з чергового режиму до сцени режиму; далі прийде `session_start`                  |
| `session_start` | Session start (`WITH_PARAMS`)  | відлік минув, користувач малює **просто зараз**                                               | `[json]` — рядок `{ "mode", "params", "durationMs": 40000 }`        | сцена режиму вже має бути готова; точки підуть одразу, без власних затримок і анімацій входу        |
| `session_end`   | Session end (`COMMAND`)        | слот вичерпано або хід перервано (скасування, обрив зв'язку, техпауза); причина не передається | `[]`                                                                | зупинити приймання точок, очистити полотно сеансу; якщо хтось чекає — одразу прийде наступний `fade` |
| `idle`          | Idle (`COMMAND`)               | черга порожня                                                                                 | `[]`                                                                | черговий режим фасаду                                                                               |

**На кожну команду TD зобов'язаний відповісти** тими самими `destination`
і `content`, інакше CCS поверне таймаут:

```json
← { "request": "run", "payload": { "destination": "public_app", "content": "session_start" } }
```

Між ходами пауз немає: наступний `fade` іде одразу за `session_end`.
Якщо хід скасовано під час fade, після `fade` прийде `session_end` **без**
`session_start`.

### Приклади

`fade` і `session_start`, режим «Комета» (перша ітерація — лише він):

```json
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "fade",
               "params": ["{\"mode\":\"comet\",\"params\":{\"head\":\"#FF7D65\",\"tail\":\"#4BABD5\"},\"durationMs\":5000}"] } }
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "session_start",
               "params": ["{\"mode\":\"comet\",\"params\":{\"head\":\"#FF7D65\",\"tail\":\"#4BABD5\"},\"durationMs\":40000}"] } }
```

Після `JSON.parse(params[0])`:

```json
{ "mode": "comet", "params": { "head": "#FF7D65", "tail": "#4BABD5" }, "durationMs": 40000 }
```

`head` — колір ядра комети, `tail` — колір шлейфу; обидва hex `#RRGGBB` у
верхньому регістрі з колірного кола на телефоні. `durationMs` —
тривалість слота (40 000) або fade (5000).

Інші режими прийдуть тим самим повідомленням, змінюється лише вміст рядка
(у застосунку поки приховані):

```json
{ "mode": "milky-way", "params": { "width": 1 },   "durationMs": 40000 }
{ "mode": "palette",   "params": { "palette": 2 }, "durationMs": 40000 }
```

`width` — індекс товщини пензля 0–2 (тонкий → товстий), `palette` —
індекс палітри 0–3 (`docs/design/design-system.md` § 2):
`#2C45E6 #62D5FF #9B2AFF`, `#F9FF46 #1B8700 #9DF200`,
`#FF4848 #FF9F3F #FFFF2F`, `#9D2CFF #FF5CE1 #F300B6`.

`session_end` та `idle`:

```json
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "session_end", "params": [] } }
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "idle", "params": [] } }
```

Поле `command: "scene"` CCS підставляє сам, його можна ігнорувати.

## 2. Потік точок

Іде лише між `session_start` і `session_end`. Public app server надсилає
його окремим WS-з'єднанням до того самого сервера TD. Відповідей не
потрібно, TD нічого не надсилає у відповідь.

```json
{ "request": "stream", "payload": { "type": "stroke:begin", "point": { "x": 0.42, "y": 0.23 } } }
{ "request": "stream", "payload": { "type": "stroke:move",  "point": { "x": 0.44, "y": 0.25 } } }
{ "request": "stream", "payload": { "type": "stroke:move",  "point": { "x": 0.47, "y": 0.29 } } }
{ "request": "stream", "payload": { "type": "stroke:end",   "point": { "x": 0.61, "y": 0.42 } } }
```

- `x`, `y` — від 0 до 1 відносно зображення фасаду на телефоні, **початок
  координат у лівому нижньому куті** (UV: `x` праворуч, `y` вгору).
  Масштабування на фасад — на боці TD.
- `stroke:begin` — палець торкнувся екрана, `stroke:move` — веде,
  `stroke:end` — відпустив. Одна лінія = `begin`, N × `move`, `end`.
  Одночасно малює один палець.
- `stroke:move` приходить не частіше 20 разів на секунду, `begin` і
  `end` без обмежень.
- Для «Комети»: `stroke:begin` запускає комету в точці, `stroke:move`
  тягне її, `stroke:end` відпускає, шлейф згасає сам. Лінії не
  залишаються.
- Режим, кольори та інші параметри в потоці не передаються — вони відомі
  з останніх `fade` / `session_start`.
- Поки з'єднання з TD немає, точки відкидаються (лічильник `dropped` у
  `/health.facade`); після перепідключення (пауза 1–10 с, WebSocket ping
  кожні 30 с) потік просто продовжується.

## 3. Послідовність на фасаді

```
idle ─▶ fade ─▶ session_start ─▶ stroke:* … ─▶ session_end ─┬▶ fade ─▶ session_start ─▶ …
                                                             └▶ idle
```

- У кожен момент не більше одного сеансу; ідентифікаторів сеансу в
  командах немає, `fade` і `session_start` одного ходу несуть той самий
  JSON.
- Після `session_end` потік може ще кілька повідомлень «долетіти» —
  ігнорувати.
- `session_end` може прийти без `session_start` (хід скасовано під час
  fade), `idle` — без попереднього сеансу (інтерактив вимкнув оператор,
  рестарт сервера). Обробляти ідемпотентно, без помилок.
- `durationMs` відлічується сервером з моменту натискання кнопки; після
  його закінчення прийде `session_end`.

Загальний опис модулів і Socket.IO-протоколу телефона —
[`backend/shared-modules.md`](backend/shared-modules.md) § 4–5.
