# Хост ZAG: разовая настройка

Файлы здесь копируются на хост руками (см. `docs/monorepo.md` § 6–7);
CI их не раскатывает.

```bash
# пользователь деплоя и каталоги
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /srv/zag/releases && sudo chown -R deploy:deploy /srv/zag
# /srv/zag/ui НЕ создавать: CI сам ставит симлинк на /srv/zag/releases/<sha>

# compose + env сервера (CCS, TD — docs/backend/shared-modules.md § 7)
sudo -u deploy cp docker-compose.yml /srv/zag/
sudo -u deploy nano /srv/zag/.env          # PORT=8080, ALLOWED_ORIGINS=https://<domain>, CCS_*
sudo -u deploy docker login ghcr.io         # read:packages token

# nginx на хосте
sudo cp nginx/zag.conf /etc/nginx/sites-available/zag
sudo ln -s /etc/nginx/sites-available/zag /etc/nginx/sites-enabled/zag
sudo nginx -t && sudo systemctl reload nginx
```

В GitHub → Settings → Environments → `production`:

| Имя               | Тип      | Значение                                                          |
| ----------------- | -------- | ----------------------------------------------------------------- |
| `DEPLOY_SSH_KEY`  | secret   | приватный ключ, публичный — в `/home/deploy/.ssh/authorized_keys` |
| `DEPLOY_HOST`     | variable | хост или IP                                                       |
| `VITE_SOCKET_URL` | variable | пусто (тот же origin)                                             |

Первый деплой: `Actions → deploy → Run workflow → all`.
