TD отримує два види повідомлень через один WebSocket-сервер:

1. **Команди** — від ExpoLight CCS, стандартний протокол пристрою
   `Touch`. Оператор натискає кнопки в CCS або їх викликає Public app server.
2. **Потік точок** — напряму від Public app server, поки триває сеанс
   малювання.

Розрізняти за полем `request`: `"run"` — команда, `"stream"` — точка.

## 1. Команди (група `public_app`)

У нативному інтерфейсі TD має бути група `public_app` з чотирма
командами. CCS запитує їх список під час підключення, і до них
прив'язуються чотири кнопки типу `WITH_PARAMS` у проєкті ZAG.

Відповідь на запит списку:

```json
→ { "request": "content", "payload": { "destination": "public_app" } }
← { "request": "content", "payload": { "destination": "public_app",
    "content": ["session_start", "session_end", "fade", "idle"] } }
```

| Команда | Коли приходить | `params` | Що робити на фасаді |
|---|---|---|---|
| `session_start` | черга дійшла до користувача; телефон уже повернуто, відлік минув — він починає малювати **просто зараз** | `[json]` — один рядок `{ "mode", "params", "durationMs" }` | увімкнути сцену режиму з параметрами; точки підуть одразу після відповіді |
| `session_end` | слот вичерпано або сеанс перервано | `["completed" \| "skipped" \| "aborted"]` | зупинити приймання точок, очистити полотно сеансу |
| `fade` | після `session_end`, якщо чекає наступний користувач | `[durationMs]` | анімація переходу; через `durationMs` мс прийде наступний `session_start` |
| `idle` | черга порожня або інтерактив вимкнено | `[]` | черговий режим фасаду |

**На кожну команду TD зобов'язаний відповісти** тими самими `destination`
і `content`, інакше CCS через 5 с поверне таймаут і сеанс на телефоні
скасується:

```json
← { "request": "run", "payload": { "destination": "public_app", "content": "session_start" } }
```

`session_start` приходить, коли всі відліки на телефоні вже минули й
користувач починає інтерактив. Одразу після відповіді TD на цю команду
починають надходити точки, тому сцену потрібно ввімкнути миттєво, без
власних затримок і анімацій входу. Час на підготовку є раніше: між
`fade` і `session_start` минає `durationMs` із `fade`, а перший
користувач після `idle` чекає чергу й відлік на телефоні.

### Приклади

`session_start`, режим «Комета» (перша ітерація — лише він):

```json
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "session_start",
               "params": ["{\"mode\":\"comet\",\"params\":{\"color\":\"#62D5FF\"},\"durationMs\":40000}"] } }
```

Після `JSON.parse(params[0])`:

```json
{ "mode": "comet", "params": { "color": "#62D5FF" }, "durationMs": 40000 }
```

`color` — hex `#RRGGBB` у верхньому регістрі, обраний користувачем на
колірному колі. `durationMs` — тривалість слота, за замовчуванням 40 000.

Інші режими прийдуть пізніше тим самим повідомленням, змінюється лише
вміст рядка:

```json
{ "mode": "milky-way", "params": { "width": 2 },   "durationMs": 40000 }
{ "mode": "palette",   "params": { "palette": 2 }, "durationMs": 40000 }
```

`session_end`:

```json
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "session_end", "params": ["completed"] } }
```

`fade`:

```json
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "fade", "params": [5000] } }
```

`idle`:

```json
{ "request": "run",
  "payload": { "destination": "public_app", "command": "scene",
               "content": "idle", "params": [] } }
```

Поле `command: "scene"` CCS підставляє сам, його можна ігнорувати.

## 2. Потік точок

Іде лише між відповіддю на `session_start` і `session_end`. Public app
server надсилає його окремим WS-з'єднанням до того самого сервера TD.
Відповідей не потрібно, TD нічого не надсилає у відповідь.

```json
{ "request": "stream", "payload": { "type": "stroke:begin", "point": { "x": 0.42, "y": 0.77 } } }
{ "request": "stream", "payload": { "type": "stroke:move",  "point": { "x": 0.44, "y": 0.75 } } }
{ "request": "stream", "payload": { "type": "stroke:move",  "point": { "x": 0.47, "y": 0.71 } } }
{ "request": "stream", "payload": { "type": "stroke:end",   "point": { "x": 0.61, "y": 0.58 } } }
```

- `x`, `y` — від 0 до 1 відносно зони малювання на телефоні, початок
  координат у лівому верхньому куті. Масштабування на фасад — на боці
  TD.
- `stroke:begin` — палець торкнувся екрана, `stroke:move` — веде,
  `stroke:end` — відпустив. Одна лінія = `begin`, N × `move`, `end`.
- `stroke:move` приходить не частіше 20 разів на секунду, `begin` і
  `end` без обмежень.
- Для режиму «Комета»: `stroke:begin` запускає комету в точці,
  `stroke:move` тягне її, `stroke:end` відпускає, шлейф згасає сам.
  Лінії не залишаються.
- Режим, колір та інші параметри в потоці не передаються — вони відомі
  з останнього `session_start`.

## 3. Послідовність на фасаді

```
idle ─▶ session_start ─▶ stroke:* … ─▶ session_end ─┬▶ fade ─▶ session_start ─▶ …
                                                    └▶ idle
```

- У кожен момент не більше одного сеансу; ідентифікаторів сеансу немає.
- Після `session_end` потік може ще кілька повідомлень «долетіти» —
  ігнорувати.
- `session_end` та `idle` можуть прийти без попереднього
  `session_start` (наприклад, інтерактив вимкнув оператор) — обробляти
  ідемпотентно, без помилок.
- Якщо TD не відповів на `session_start` за 5 с, Public app server
  скасує сеанс і все одно надішле `session_end` з `"aborted"`.
- `durationMs` у `session_start` відлічується з моменту відповіді TD; після
  його закінчення прийде `session_end` з `"completed"`.
