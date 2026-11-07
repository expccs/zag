# Хост ZAG: разовая настройка

Деплой идёт через **self-hosted GitHub Actions runner на самом хосте**:
`deploy.yml` чекаутит код на машину, собирает UI и переключает
`/srv/zag/ui`, собирает Docker-образ сервера локально и перезапускает его
через `docker compose`. SSH-ключей, registry и секретов не нужно.
`ci.yml` (PR-проверки) остаётся на раннерах GitHub.

```bash
# runner уже установлен и работает от пользователя expo (/home/expo/actions-runner).
# Ему нужны: группа docker и право писать в /srv/zag.
sudo usermod -aG docker expo
sudo mkdir -p /srv/zag/releases && sudo chown -R expo:expo /srv/zag
# /srv/zag/ui НЕ создавать: CI сам ставит симлинк на /srv/zag/releases/<sha>
sudo apt-get install -y git rsync curl jq            # + docker engine с compose v2
# новая группа применяется только после перезапуска сервиса раннера
sudo systemctl restart 'actions.runner.*'
sudo -u expo docker ps                                # должно работать без sudo

# env сервера (CCS, TD — docs/backend/shared-modules.md § 7); в git не попадает
sudo -u expo nano /srv/zag/.env
# ALLOWED_ORIGINS=https://<domain>; PORT=8080 (внутри контейнера);
# CCS_MODE=offline пока нет учётки CCS — без неё в live/dry-run обязательны
# CCS_LOGIN и CCS_PASSWORD, иначе сервер падает на старте (см. .env.example)

# nginx на хосте
sudo cp nginx/zag.conf /etc/nginx/sites-available/zag
sudo ln -s /etc/nginx/sites-available/zag /etc/nginx/sites-enabled/zag
sudo nginx -t && sudo systemctl reload nginx
```

## Runner

Уже установлен: GitHub → repo → Settings → Actions → Runners → `expo`
(`runs-on: self-hosted`, дополнительных меток не нужно). Если ставить
заново: New self-hosted runner → Linux x64, команды выполнять от
пользователя, который будет деплоить, затем
`sudo ./svc.sh install <user> && sudo ./svc.sh start`.

Runner должен видеть `docker` (группа `docker`), писать в `/srv/zag` и
дёргать `localhost:8090/health` (хостовый порт контейнера). Node ставит `actions/setup-node`
в кэш раннера, системный Node не нужен.

Если репозиторий публичный, не давать self-hosted раннеру `pull_request`-
триггеры: `deploy.yml` запускается только на `push` в `master` и
`workflow_dispatch`, `ci.yml` — на `ubuntu-latest`.

## GitHub → Settings → Environments → `production`

| Имя               | Тип      | Значение              |
| ----------------- | -------- | --------------------- |
| `VITE_SOCKET_URL` | variable | пусто (тот же origin) |

Первый деплой: `Actions → deploy → Run workflow → all`. В логе шага
`Install release and switch /srv/zag/ui` должно быть
`/srv/zag/ui -> /srv/zag/releases/<sha>`.

Откат UI: `ln -sfn /srv/zag/releases/<sha> /srv/zag/ui.tmp && mv -Tf
/srv/zag/ui.tmp /srv/zag/ui`. Откат сервера: `SERVER_TAG=<sha> docker
compose -f deploy/docker-compose.yml up -d server` из чекаута раннера
(`/home/expo/actions-runner/_work/zag/zag`), пока образ не вычищен
(хранится только текущий и `latest`).
