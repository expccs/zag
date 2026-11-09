# Монорепозиторий ZAG: структура, Turborepo, CI/CD

Решения от 2026-11-05. Заменяет прежний план «Next.js + отдельный
`server/`»: Next.js в проекте **не используется** ни как фреймворк, ни
как сборщик.

## 1. Стек

| Часть | Технология | Артефакт | Где работает |
|---|---|---|---|
| `apps/web` | React 19 + TypeScript, Vite, `vite-plugin-pwa` (Workbox) | статические файлы `dist/` | nginx на хосте, `root /srv/zag/ui` |
| `apps/server` | Node 22, `socket.io`, `ws`; код из `docs/backend/reference/` | Docker-образ в GHCR | `docker compose` на хосте, порт только на loopback |
| `packages/protocol` | TypeScript | типы и имена событий Socket.IO (§ 4 и § 5 `shared-modules.md`), флаги состояния, константы сеанса | импортируется обоими приложениями |
| `packages/config` | eslint (`eslint-config-metarhia`), prettier, базовые `tsconfig` | — | dev-only |

Правила, которые из этого следуют:

- **Никакого SSR и никакого рантайма для UI.** Браузер получает только
  файлы с диска через nginx. Все данные (флаги, очередь, геозона, язык)
  приходят в уже загруженное приложение через Socket.IO. Никакого
  Node-процесса, обслуживающего HTTP для UI, нет.
- **Единственный рантайм-процесс — `apps/server`** (`bootstrap.ts`:
  Socket.IO + `/health`). Он не раздаёт статику и не знает о UI.
- Общие типы живут только в `packages/protocol`; дублировать интерфейсы
  событий в `web` и `server` нельзя.
- Шрифты Unbounded и Montserrat — self-hosted через
  `@fontsource-variable/unbounded` и `@fontsource-variable/montserrat`
  (у обоих есть `cyrillic` и `cyrillic-ext`, проверено 2026-11-05 по
  содержимому пакетов 5.3.0); к Google Fonts в рантайме не обращаемся
  (PWA должна открываться без внешних запросов).

## 2. Структура

```
zag/
├── apps/
│   ├── web/                 # React PWA (Vite)
│   │   ├── public/          # manifest-иконки, favicon, статические картинки
│   │   ├── src/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json     # name: @zag/web
│   └── server/              # Socket.IO-сервер (backend/server-architecture.md)
│       ├── src/app/         # домен, порты, use cases
│       ├── src/infrastructure/ # адаптеры: ccs, socket, http, logging, config
│       ├── src/bootstrap.ts # композиционный корень
│       ├── Dockerfile
│       └── package.json     # name: @zag/server
├── packages/
│   ├── protocol/            # @zag/protocol — события, payload'ы, флаги
│   └── config/              # @zag/config — eslint/prettier/tsconfig
├── docs/
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── deploy/
│   ├── docker-compose.yml   # то, что лежит на хосте в /srv/zag
│   └── nginx/zag.conf       # /etc/nginx/sites-available/zag
├── turbo.json
├── package.json             # npm workspaces: apps/*, packages/*
└── package-lock.json
```

Пакетный менеджер — npm workspaces (один `package-lock.json` в корне).
Все внутренние пакеты с префиксом `@zag/`, зависимости между ними —
`"@zag/protocol": "*"`.

## 3. Turborepo

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"],
      "env": ["VITE_SOCKET_URL", "VITE_APP_VERSION"]
    },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- `^build` гарантирует, что `@zag/protocol` собран до `web` и `server`.
- `env` перечисляет переменные, влияющие на хэш кэша `web`: смена
  `VITE_SOCKET_URL` обязана инвалидировать сборку.
- Базовый `tsconfig` лежит в `packages/config/tsconfig/base.json` (не в
  корне): Vite резолвит `extends` через симлинк `node_modules/@zag/config`
  без `realpath`, поэтому относительные пути наружу пакета не работают.
- Корень требует `"packageManager": "npm@<version>"` — без него
  `turbo` не находит workspace.
- `@zag/protocol` собирается дважды: `dist/` (CJS, `require` для
  `apps/server`) и `dist/esm/` (`import` для Vite). Vite не
  pre-bundl'ит симлинк-пакеты воркспейса, поэтому CJS-сборка в dev даёт
  «does not provide an export named …».
- Корневые скрипты: `turbo run build`, `turbo run lint typecheck test`,
  `turbo run dev` (параллельно `vite` и `tsx watch`).
- Удалённый кэш не обязателен; при желании — `turbo login && turbo link`
  (Vercel Remote Cache) или self-hosted. CI работает и без него.

## 4. `apps/web`: PWA без сервера

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ZAG Інтерактив',
        short_name: 'ZAG',
        display: 'standalone',
        orientation: 'any',          // экраны рисования — landscape
        background_color: '#000000', // [проверить] по design-system.md
        theme_color: '#000000',
        icons: [/* 192, 512, maskable — из docs/design/assets/logos */],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // сокет и health никогда не перехватываем
        navigateFallbackDenylist: [/^\/socket\.io\//, /^\/health$/],
        runtimeCaching: [],          // всё, что нужно, в precache
      },
    }),
  ],
  build: { sourcemap: true, target: 'es2022' },
});
```

- Один `index.html`, маршрутизация на клиенте (`react-router`), UA/EN —
  клиентское переключение с сохранением в `localStorage`; никакого
  `Accept-Language` на сервере.
- `VITE_SOCKET_URL` по умолчанию пустой = тот же origin (`/socket.io/`
  проксирует nginx). Переменная вшивается при сборке в CI.
- Socket.IO идёт по WebSocket и service worker его не касается; при
  потере сети показываем экран «Связь потеряна» из дизайна
  (`docs/design/screens/11-connection-lost-ua.png`).
- Обновление: `registerType: 'autoUpdate'` + `index.html`, `sw.js`,
  `manifest.webmanifest` отдаются nginx с `no-cache`, поэтому новая
  сборка подхватывается при следующем открытии.

## 5. `apps/server`: Docker-образ

`Dockerfile` (multi-stage, через `turbo prune`, чтобы в образ попали
только `server` и `protocol`). Актуальная версия —
`apps/server/Dockerfile`; схема:

```dockerfile
FROM node:22-alpine AS pruner
WORKDIR /repo
RUN npm i -g turbo
COPY . .
RUN turbo prune @zag/server --docker

FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/package-lock.json .
RUN npm ci
COPY --from=pruner /repo/out/full/ .
RUN npx turbo run build --filter=@zag/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/server/dist ./dist
COPY --from=builder /repo/node_modules ./node_modules
USER node
EXPOSE 8080
CMD ["node", "dist/bootstrap.js"]
```

Образ собирается **на хосте** self-hosted раннером (`docker build` из
чекаута) и тегается `zag-server:<sha>` и `zag-server:latest`; registry нет.
После успешного старта старые теги `zag-server:*` и висячие слои
удаляются (`docker rmi`, `docker image prune -f`).

## 6. Хост

nginx установлен на хосте (не в Docker). В Docker — только `server`.

`deploy/docker-compose.yml` (используется из чекаута раннера, на хост
не копируется; на хосте лежит только `/srv/zag/.env`):

```yaml
name: zag
services:
  server:
    image: zag-server:${SERVER_TAG:-latest}   # собран локально deploy.yml
    env_file: /srv/zag/.env
    ports: ["127.0.0.1:8090:8080"]   # хост 8090 → контейнер 8080, доступен только nginx
    restart: unless-stopped
```

`/etc/nginx/sites-available/zag` (внутри `server { … }`):

```nginx
root /srv/zag/ui;                     # симлинк на /srv/zag/releases/<sha>, ставит CI
# без open_file_cache: он держит fd старого релиза до 60 с после переключения симлинка
gzip on;
gzip_types text/html text/css application/javascript image/svg+xml application/json application/manifest+json;

# хэшированные ассеты Vite — навсегда
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
# то, через что приходит обновление PWA, — всегда перепроверять
location = /index.html         { add_header Cache-Control "no-cache"; }
location = /sw.js              { add_header Cache-Control "no-cache"; }
location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
# SPA-fallback
location / { try_files $uri /index.html; }

location /socket.io/ {
  proxy_pass http://127.0.0.1:8090;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}
location = /health { proxy_pass http://127.0.0.1:8090; }
```

Релизы UI лежат в `/srv/zag/releases/<sha>/`, `/srv/zag/ui` — симлинк
на текущий. Переключение симлинка атомарно, откат = переставить симлинк.
Старые релизы чистятся до последних 5. `ALLOWED_ORIGINS` сервера =
origin сайта.

Разовая настройка хоста (`deploy/README.md`): `mkdir -p /srv/zag/releases`,
пользователь `deploy` в группе `docker` с правом писать в `/srv/zag`,
`/srv/zag/.env`, и **self-hosted GitHub Actions runner**,
установленный как systemd-сервис от `deploy`. SSH-ключи и registry не нужны.

## 7. CI/CD: деплоим только то, что изменилось

Хостинг — GitHub (`expccs/zag`), ветка по умолчанию — `master`.
Определение «что изменилось» делает **Turborepo по графу зависимостей**,
а не `paths:`-фильтры GitHub: правка в `packages/protocol` должна
затронуть и `web`, и `server`, а `paths:` этого не знает.

### 7.1 `ci.yml` — PR и push в `master`

```yaml
name: ci
on:
  pull_request:
  push: { branches: [master] }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }          # нужна история для --affected
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx turbo run lint typecheck test build --affected
        env:
          TURBO_SCM_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
          TURBO_SCM_HEAD: ${{ github.sha }}
```

`--affected` запускает задачи только в пакетах, изменившихся между
`TURBO_SCM_BASE` и `HEAD`, плюс в их зависимых.

### 7.2 `deploy.yml` — push в `master`

```yaml
name: deploy
on:
  push: { branches: [master] }
concurrency: { group: deploy, cancel-in-progress: false }

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.affected.outputs.web }}
      server: ${{ steps.affected.outputs.server }}
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - id: affected
        env:
          TURBO_SCM_BASE: ${{ github.event.before }}
        run: |
          # force-push или первый коммит: before = 000…0 → деплоим всё
          if [[ "$TURBO_SCM_BASE" =~ ^0+$ ]]; then
            echo web=true >> "$GITHUB_OUTPUT"; echo server=true >> "$GITHUB_OUTPUT"; exit 0
          fi
          PKGS=$(npx turbo ls --affected --output=json | jq -r '.packages.items[].name')
          echo "affected: $PKGS"
          echo web=$(grep -qx '@zag/web' <<<"$PKGS" && echo true || echo false) >> "$GITHUB_OUTPUT"
          echo server=$(grep -qx '@zag/server' <<<"$PKGS" && echo true || echo false) >> "$GITHUB_OUTPUT"

  # оба job — на self-hosted runner, установленном на хосте ZAG
  deploy-web:
    needs: detect
    if: needs.detect.outputs.web == 'true'
    runs-on: self-hosted
    environment: production
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx turbo run build --filter=@zag/web
        env:
          VITE_SOCKET_URL: ${{ vars.VITE_SOCKET_URL }}
          VITE_APP_VERSION: ${{ github.sha }}
      - run: |
          R="/srv/zag/releases/${{ github.sha }}"; mkdir -p "$R"
          rsync -a --delete apps/web/dist/ "$R/" && chmod -R u=rwX,go=rX "$R"
          # /srv/zag/ui — симлинк; если на хосте лежит обычный каталог, он
          # сначала убирается в releases/manual-<ts>
          ln -sfn "$R" /srv/zag/ui.tmp && mv -Tf /srv/zag/ui.tmp /srv/zag/ui
          OLD=$(ls -dt /srv/zag/releases/* | grep -vx "$R" || true)   # на первом деплое пусто
          echo "$OLD" | tail -n +5 | grep . | xargs -r rm -rf || true

  deploy-server:
    needs: detect
    if: needs.detect.outputs.server == 'true'
    runs-on: self-hosted
    environment: production
    steps:
      - uses: actions/checkout@v5
      - run: docker build -f apps/server/Dockerfile --build-arg APP_VERSION=${{ github.sha }} \
               -t zag-server:${{ github.sha }} -t zag-server:latest .
      - run: |
          SERVER_TAG=${{ github.sha }} docker compose -f deploy/docker-compose.yml up -d server
          curl -fsS --retry 15 --retry-delay 2 --retry-all-errors localhost:8090/health
      - run: |   # чистим старые образы: остаются текущий тег и :latest
          docker images zag-server --format '{{.Tag}}' \
            | grep -vx -e ${{ github.sha }} -e latest | xargs -r -I{} docker rmi zag-server:{}
          docker image prune -f
```

Поведение:

| Что изменилось | `ci` | `deploy-web` | `deploy-server` |
|---|---|---|---|
| только `apps/web` | lint/test/build `web` | да | нет |
| только `apps/server` | lint/test/build `server` | нет | да |
| `packages/protocol` | оба | да | да |
| только `docs/`, `*.md` | ничего не затронуто, job зелёный за секунды | нет | нет |
| `packages/config`, корневые конфиги | оба (зависимость через `devDependencies`/`globalDependencies`) | да | да |

Ограничения и как с ними жить:

- `deploy/nginx/zag.conf` и `deploy/docker-compose.yml` не входят ни в
  один пакет → turbo их не видит (compose берётся из чекаута, но правка
  только compose сервер не передеплоит). Либо сделать `deploy/` пакетом
  `@zag/deploy` с пустым `build`, от которого зависит `server`
  (тогда правка compose передеплоит сервер), либо раскатывать их руками.
  Принято: отдельный пакет `@zag/deploy` **[решить]**.
- `github.event.before` при `cancel-in-progress: false` и очереди из
  нескольких пушей корректен: каждый ран сравнивает со своим
  предшественником. Если ран упал, следующий push *не* повторит его
  изменения — для этого есть `workflow_dispatch` с ручным выбором
  `web`/`server`/`all` (добавить в `deploy.yml`).
- Секретов в GitHub нет: раннер стоит на хосте, SSH и registry не
  используются. Единственная переменная — `VITE_SOCKET_URL` (environment
  `production`, пустая). Серверный `.env` (CCS, TD, § 7
  `shared-modules.md`) лежит на хосте в `/srv/zag/.env` и в git не
  попадает.
- Self-hosted runner исполняет код из `master`; `ci.yml` (в т.ч. для PR)
  остаётся на `ubuntu-latest`, чтобы чужой PR не выполнялся на хосте.

## 8. Локальная разработка

```
npm ci
cp .env.example .env            # CCS_MODE=offline по умолчанию
npx turbo run dev               # vite :5173 с proxy /socket.io → :8080, server :8080
```

`apps/web/vite.config.ts` в `server.proxy` проксирует `/socket.io` на
`http://localhost:8080` с `ws: true`, поэтому `VITE_SOCKET_URL` локально
тоже пустой.

## 9. Открытые вопросы

- Пакет `@zag/deploy` для `nginx.conf`/`compose` (§ 7).
- Нужен ли staging (второй `environment` и хост) — по умолчанию нет.
- Удалённый кэш Turborepo — по желанию, когда CI станет медленным.
