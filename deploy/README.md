# Хост ZAG: разовая настройка

Деплой идёт через **self-hosted GitHub Actions runner на самом хосте**:
`deploy.yml` чекаутит код на машину, собирает UI и переключает
`/srv/zag/ui`, собирает Docker-образ сервера локально и перезапускает его
через `docker compose`. SSH-ключей, registry и секретов не нужно.
`ci.yml` (PR-проверки) остаётся на раннерах GitHub.

```bash
# пользователь, от которого работает runner, и каталоги
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /srv/zag/releases && sudo chown -R deploy:deploy /srv/zag
# /srv/zag/ui НЕ создавать: CI сам ставит симлинк на /srv/zag/releases/<sha>
sudo apt-get install -y git rsync curl jq            # + docker engine с compose v2

# env сервера (CCS, TD — docs/backend/shared-modules.md § 7); в git не попадает
sudo -u deploy nano /srv/zag/.env          # PORT=8080, ALLOWED_ORIGINS=https://<domain>, CCS_*

# nginx на хосте
sudo cp nginx/zag.conf /etc/nginx/sites-available/zag
sudo ln -s /etc/nginx/sites-available/zag /etc/nginx/sites-enabled/zag
sudo nginx -t && sudo systemctl reload nginx
```

## Runner

GitHub → repo → Settings → Actions → Runners → New self-hosted runner →
Linux x64. Выполнить показанные там команды **от пользователя `deploy`**,
при `config.sh` добавить метку `zag` (workflow выбирает
`runs-on: [self-hosted, zag]`):

```bash
sudo -iu deploy
mkdir actions-runner && cd actions-runner
# curl + tar из инструкции GitHub
./config.sh --url https://github.com/expccs/zag --token <TOKEN> --labels zag --unattended
exit
sudo /home/deploy/actions-runner/svc.sh install deploy   # systemd-сервис
sudo /home/deploy/actions-runner/svc.sh start
```

Runner должен видеть `docker` (группа `docker`), писать в `/srv/zag` и
дёргать `localhost:8080/health`. Node ставит `actions/setup-node`
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
(`/home/deploy/actions-runner/_work/zag/zag`), пока образ не вычищен
(хранится только текущий и `latest`).
